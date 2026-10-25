import { useSyncExternalStore } from 'react'
import { supabase } from '../../landing/supabase'
import { inShow, loadShow } from '../show'
import { botPreset, presetAsked, presetAt, type BotPreset } from './presets'

// How hard the bots play for this player: at their skill rating, eased off a little after a run of bad games
// and pushed back a little after a run of good ones. The ratings are kept in Supabase (supabase/skill.sql:
// every game a signed-in player finishes moves theirs), read as the games open and again after each game.
// For a player who isn't signed in they're worked out here instead, the same way, and kept in the browser.
//
// The scale: 0 is the Easy preset, 0.5 Normal, 1 Hard, 1.25 Elite (./presets blends between them). In Party
// Games the easing off is only in the qualifying rounds, so it can help a player into the final, but the
// final's played at their rating. A show's bots aren't all the same: online, the bulk of them play at the
// difficulty of the player who needs it easiest, and the best few at the difficulty of the one who needs it
// hardest (./net/party has the server work that out), so everyone has a field to match. In Shoot Out, the
// other side plays at the player's difficulty and their own side at their rating.
//
// The numbers it goes by are Supabase's skill_settings (the same ones the ratings are worked out with);
// these are what they start as.

export type SkillMode = 'party-games' | 'shoot-out'
export type Skill = { rating: number; games: number; streak: number; lastPlayed: string | null } // streak: good games in a row (> 0), or bad (< 0)
// A Party Games qualifying round, its final, or a Shoot Out match
export type Stage = 'qualifier' | 'final' | 'match'
export type Field = { low: number; high: number } // a show's bots, from the bulk of them to the best few

const SETTINGS = {
  adaptive: true,
  start_rating: 0.35,
  scale: 0.15,
  k_new: 0.2,
  k_settled: 0.05,
  settle_games: 12,
  k_rusty: 0.12,
  rusty_days: 14,
  max_rating: 1.25,
  mercy_2: 0.08,
  mercy_3: 0.15,
  mercy_5: 0.2,
  hot_2: 0.05,
  hot_3: 0.1,
}
type Settings = typeof SETTINGS
const KEY = 'fallguy.skill'
const WAIT = 1200 // ms the games wait for the ratings before going on without them

let settings: Settings = SETTINGS
let skills: Partial<Record<SkillMode, Skill>> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
})()
let signedIn = false

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const skillOf = (mode: SkillMode): Skill => skills[mode] ?? { rating: settings.start_rating, games: 0, streak: 0, lastPlayed: null }

// Easing off after a run of bad games (below 0), pushing back after good ones
export function formOf(streak: number) {
  const s = settings
  if (streak <= -5) return -s.mercy_5
  if (streak <= -3) return -s.mercy_3
  if (streak <= -2) return -s.mercy_2
  if (streak >= 3) return s.hot_3
  if (streak >= 2) return s.hot_2
  return 0
}

// How hard the bots play for me in a mode, at a stage of it
export function difficultyFor(mode: SkillMode, stage: Stage) {
  const { rating, streak } = skillOf(mode)
  return clamp(rating + (stage === 'final' ? 0 : formOf(streak)), 0, settings.max_rating)
}

// Whether the bots adapt at all (not when it's switched off, or a preset's asked for to try it out)
export const adaptive = () => settings.adaptive && !presetAsked()

// ---------------------------------------------------------------------------------------------------------
// Party Games: the field

let onlineField: Field | null = null
// Online, the round's field, as the server works it out from every player's (./net/party)
export function setField(field: Field | null) {
  onlineField = field
}

// The field now: online, the server's; in a show on my own, mine; otherwise (a map played on its own) none
function fieldNow(): Field | null {
  if (onlineField) return onlineField
  if (!inShow()) return null
  const show = loadShow()
  if (!show || show.humans) return null
  const d = difficultyFor('party-games', show.rounds[show.round].quota === null ? 'final' : 'qualifier')
  return { low: d, high: d }
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// The preset a show's bot plays by, from where it stands in the field (`rank`, 0..1: the show gives each bot
// one): the bulk at the field's low end, the best few (from about the top third) at its high end
export function partyPreset(rank: number): BotPreset {
  const field = fieldNow()
  if (!field || !adaptive()) return botPreset()
  return presetAt(field.low + (field.high - field.low) * smooth(0.55, 0.85, rank))
}

// ---------------------------------------------------------------------------------------------------------
// Shoot Out: set as each match starts (./match), and kept to the end of it

let shooters: { mine: BotPreset; theirs: BotPreset; faced: number | null } | null = null
export function tuneShooters() {
  shooters = adaptive()
    ? { mine: presetAt(difficultyFor('shoot-out', 'final')), theirs: presetAt(difficultyFor('shoot-out', 'match')), faced: difficultyFor('shoot-out', 'match') }
    : { mine: botPreset(), theirs: botPreset(), faced: null }
}
// The preset a Shoot Out bot plays by: on my side, or the other
export function shooterPreset(mine: boolean): BotPreset {
  if (!shooters) tuneShooters()
  return mine ? shooters!.mine : shooters!.theirs
}

// ---------------------------------------------------------------------------------------------------------

// The difficulty I played at, kept with the game (null: not adapting). In an online show, mine as the field
// had it: the bulk of the bots if I needed it easier than that, the best few if I needed it harder.
export function difficultyFaced(mode: SkillMode, stage: Stage): number | null {
  if (!adaptive()) return null
  if (mode === 'shoot-out') return shooters?.faced ?? difficultyFor('shoot-out', 'match')
  const d = difficultyFor('party-games', stage)
  const field = fieldNow()
  return Math.round((field ? clamp(d, field.low, field.high) : d) * 1000) / 1000
}

// ---------------------------------------------------------------------------------------------------------
// Reading the ratings

let ready = false
const listeners = new Set<() => void>()
function changed() {
  listeners.forEach((l) => l())
}
function done() {
  if (ready) return
  ready = true
  changed()
}
function keep() {
  try {
    localStorage.setItem(KEY, JSON.stringify(skills))
  } catch {
    // (not kept)
  }
}

type Row = { mode: SkillMode; rating: number; games: number; streak: number; last_played: string | null }

// As the games open: the settings, and my ratings (signed in)
export async function loadSkill() {
  window.setTimeout(done, WAIT)
  try {
    if (!supabase) return
    const [{ data: set }, { data: session }] = await Promise.all([supabase.from('skill_settings').select('*').maybeSingle(), supabase.auth.getSession()])
    if (set) {
      const next = { ...SETTINGS }
      for (const key of Object.keys(SETTINGS) as (keyof Settings)[]) {
        const v = (set as Record<string, unknown>)[key]
        if (typeof v === typeof SETTINGS[key]) (next as Record<string, unknown>)[key] = v
      }
      settings = next
    }
    signedIn = !!session.session
    if (signedIn) await refreshSkill()
  } catch {
    // (no network, or no tables yet: the ratings kept from last time, or new ones)
  } finally {
    done()
  }
}

// Again, after a game's been rated
export async function refreshSkill() {
  if (!supabase) return
  const { data, error } = await supabase.from('player_skill').select('mode, rating, games, streak, last_played')
  if (error || !data) return
  skills = {}
  for (const row of data as Row[]) skills[row.mode] = { rating: row.rating, games: row.games, streak: row.streak, lastPlayed: row.last_played }
  keep()
  changed()
}

// Whether they've been read (or given up on), for the games to wait on before the bots are made
export function useSkillReady() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => ready,
  )
}

// ---------------------------------------------------------------------------------------------------------
// Not signed in: rated here, just as supabase/skill.sql does it (keep the two the same)

const showFaced = new Map<string, number[]>() // each show's rounds' difficulties so far

export type Played = {
  mode: SkillMode
  outcome: 'through' | 'out' | 'won' | 'lost'
  show_id?: string | null
  round?: number | null
  rounds?: number | null
  place?: number | null
  field?: number | null
  kills?: number | null
  deaths?: number | null
  difficulty?: number | null
  left_early?: boolean
}

export function rateLocally(game: Played) {
  let score: number
  let faced: number | null
  let good: boolean
  let bad: boolean
  const left = !!game.left_early
  if (game.mode === 'party-games') {
    if (game.show_id && game.difficulty != null) showFaced.set(game.show_id, [...(showFaced.get(game.show_id) ?? []), game.difficulty])
    if (game.outcome !== 'out' && game.outcome !== 'won') return
    const final = game.round != null && game.round === game.rounds
    const share = game.field && game.field > 1 && game.place != null ? clamp(1 - (game.place - 1) / (game.field - 1), 0, 1) : 0.5
    score = left ? 0 : game.outcome === 'won' ? 1 : final ? 0.6 + 0.2 * share : (game.round ?? 1) > 1 ? 0.35 + 0.15 * share : 0.1 + 0.2 * share
    const all = game.show_id ? (showFaced.get(game.show_id) ?? []) : []
    faced = all.length ? all.reduce((a, b) => a + b, 0) / all.length : (game.difficulty ?? null)
    if (game.show_id) showFaced.delete(game.show_id)
    good = final && !left
    bad = !final && !left
  } else {
    score = left ? 0 : 0.7 * (game.outcome === 'won' ? 1 : 0) + (0.3 * Math.min((game.kills ?? 0) / Math.max(game.deaths ?? 0, 1), 2)) / 2
    faced = game.difficulty ?? null
    good = game.outcome === 'won' && !left
    bad = game.outcome === 'lost' && !left
  }
  const s = settings
  const had = skillOf(game.mode)
  const at = faced ?? had.rating
  const expected = 1 / (1 + Math.exp(-(had.rating - at) / s.scale))
  let k = s.k_settled + (s.k_new - s.k_settled) * Math.exp(-had.games / s.settle_games)
  if (had.lastPlayed && Date.now() - Date.parse(had.lastPlayed) > s.rusty_days * 86_400_000) k = Math.max(k, s.k_rusty)
  skills[game.mode] = {
    rating: clamp(had.rating + k * (score - expected), 0, s.max_rating),
    games: had.games + 1,
    streak: good ? Math.max(had.streak, 0) + 1 : bad ? Math.min(had.streak, 0) - 1 : had.streak,
    lastPlayed: new Date().toISOString(),
  }
  keep()
  changed()
}
