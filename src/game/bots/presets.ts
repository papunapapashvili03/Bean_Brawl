import { useSyncExternalStore } from 'react'
import { supabase } from '../../landing/supabase'

// How good the bots are: a difficulty preset (Easy, Normal, Hard, or any other you make), each a few numbers
// that every bot's mind goes by: how good the Party Games bots are (each one somewhere in a range), how quick
// off the line, and on top of that how fast they run, how often they slip up and how long they take to react;
// and how good the Shoot Out bots are. Normal is how the bots have always played.
//
// The presets live in Supabase (the bot_presets table: see supabase/bot_presets.sql), so they can be changed
// there, in the dashboard, with no change to the code and no new deploy: they're read as the games open, and
// whichever row's marked the default is the one used (or, to try one out, ?bots=<name> on the address). Kept
// in the browser too, for next time; and without Supabase, the ones written here are used.
//
// Bots that adapt to the player (./difficulty) play somewhere between the presets instead: Easy, Normal, Hard
// and Elite stand at difficulties 0, 0.5, 1 and 1.25, and a difficulty in between blends the two either side.

export type BotPreset = {
  name: string
  label: string
  level: [number, number] // how good each Party Games bot is, 0 (slow, careless) .. 1 (quick, sharp): somewhere in here
  quickness: [number, number] // how quick off the line each is, 0 (slow to start) .. 1: somewhere in here
  speed: number // times their running speed (1: as their level says)
  mistakes: number // times how often they slip up, misjudge or let their mind wander (0: never)
  reaction: number // times how long they take to react to what's coming (above 1: slower)
  shooterSkill: [number, number] // how good each Shoot Out bot is, 0.6 (slow, wild) .. 1 (quick, steady)
}

export const BUILT_IN: BotPreset[] = [
  { name: 'easy', label: 'Easy', level: [0, 0.55], quickness: [0, 0.6], speed: 0.92, mistakes: 1.8, reaction: 1.5, shooterSkill: [0.6, 0.78] },
  { name: 'normal', label: 'Normal', level: [0, 1], quickness: [0, 1], speed: 1, mistakes: 1, reaction: 1, shooterSkill: [0.65, 1] },
  { name: 'hard', label: 'Hard', level: [0.5, 1], quickness: [0.4, 1], speed: 1.03, mistakes: 0.4, reaction: 0.7, shooterSkill: [0.85, 1] },
  { name: 'elite', label: 'Elite', level: [0.75, 1], quickness: [0.6, 1], speed: 1.06, mistakes: 0.15, reaction: 0.55, shooterSkill: [0.92, 1] },
]
// Where each stands on the difficulty scale
const ANCHORS: [string, number][] = [
  ['easy', 0],
  ['normal', 0.5],
  ['hard', 1],
  ['elite', 1.25],
]
const DEFAULT = 'normal'
const KEY = 'fallguy.botPresets'
const WAIT = 1200 // ms the games wait for the presets before going on without them

type Row = {
  name: string
  label: string
  is_default: boolean
  level_min: number
  level_max: number
  quickness_min: number
  quickness_max: number
  speed: number
  mistakes: number
  reaction: number
  shooter_skill_min: number
  shooter_skill_max: number
}

// (Whatever's in the table, kept within what makes sense)
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
const range = (a: unknown, b: unknown, lo: number, hi: number, fallback: [number, number]): [number, number] => {
  const x = clamp(a, lo, hi, fallback[0])
  const y = clamp(b, lo, hi, fallback[1])
  return [Math.min(x, y), Math.max(x, y)]
}
function fromRow(r: Row): BotPreset {
  const base = BUILT_IN.find((p) => p.name === r.name) ?? BUILT_IN[1]
  return {
    name: String(r.name),
    label: String(r.label || r.name),
    level: range(r.level_min, r.level_max, 0, 1, base.level),
    quickness: range(r.quickness_min, r.quickness_max, 0, 1, base.quickness),
    speed: clamp(r.speed, 0.5, 1.15, base.speed),
    mistakes: clamp(r.mistakes, 0, 5, base.mistakes),
    reaction: clamp(r.reaction, 0.2, 4, base.reaction),
    shooterSkill: range(r.shooter_skill_min, r.shooter_skill_max, 0.4, 1, base.shooterSkill),
  }
}

// ---------------------------------------------------------------------------------------------------------
// Which presets there are, and which is in use

type Known = { presets: BotPreset[]; byDefault: string }
let known: Known = (() => {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Known | null
    if (kept && Array.isArray(kept.presets) && kept.presets.length) return kept
  } catch {
    // (nothing kept, or not readable: the built-in ones)
  }
  return { presets: BUILT_IN, byDefault: DEFAULT }
})()
const asked = new URLSearchParams(window.location.search).get('bots')

// The preset the bots go by now
export function botPreset(): BotPreset {
  const { presets, byDefault } = known
  return presets.find((p) => p.name === asked) ?? presets.find((p) => p.name === byDefault) ?? presets.find((p) => p.name === DEFAULT) ?? BUILT_IN[1]
}

// Somewhere in a range, `u` (0..1) of the way along it
export const within = ([lo, hi]: [number, number], u: number) => lo + (hi - lo) * u

// Bots chosen for testing (?bots=<name>): they don't adapt
export const presetAsked = () => (asked ? (known.presets.find((p) => p.name === asked) ?? null) : null)

// The bots at difficulty `d` (0 Easy .. 0.5 Normal .. 1 Hard .. 1.25 Elite): between the presets either side
export function presetAt(d: number): BotPreset {
  const at = known.presets.length ? known.presets : BUILT_IN
  const stops = ANCHORS.map(([name, x]) => ({ x, p: at.find((p) => p.name === name) ?? BUILT_IN.find((p) => p.name === name)! }))
  // (Without an Elite row, Hard is as hard as it gets)
  if (!at.some((p) => p.name === 'elite')) stops.pop()
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (d <= first.x) return first.p
  if (d >= last.x) return last.p
  const k = stops.findIndex((s) => s.x >= d)
  const a = stops[k - 1]
  const b = stops[k]
  const u = (d - a.x) / (b.x - a.x)
  const mix = (x: number, y: number) => x + (y - x) * u
  const mixRange = (x: [number, number], y: [number, number]): [number, number] => [mix(x[0], y[0]), mix(x[1], y[1])]
  return {
    name: `adaptive`,
    label: `Adaptive (${Math.round(d * 1000)})`,
    level: mixRange(a.p.level, b.p.level),
    quickness: mixRange(a.p.quickness, b.p.quickness),
    speed: mix(a.p.speed, b.p.speed),
    mistakes: mix(a.p.mistakes, b.p.mistakes),
    reaction: mix(a.p.reaction, b.p.reaction),
    shooterSkill: mixRange(a.p.shooterSkill, b.p.shooterSkill),
  }
}

// ---------------------------------------------------------------------------------------------------------
// Reading them from Supabase, once, as the games open

let ready = false
const listeners = new Set<() => void>()
function done() {
  if (ready) return
  ready = true
  listeners.forEach((l) => l())
}

export async function loadBotPresets() {
  window.setTimeout(done, WAIT)
  try {
    if (!supabase) return
    const { data, error } = await supabase.from('bot_presets').select('*')
    if (error || !data?.length) return
    const rows = data as Row[]
    const presets = rows.map(fromRow)
    const byDefault = rows.find((r) => r.is_default)?.name ?? DEFAULT
    known = { presets, byDefault }
    try {
      localStorage.setItem(KEY, JSON.stringify(known))
    } catch {
      // (not kept: read again next time)
    }
  } catch {
    // (no network, or no table yet: the ones kept from last time, or the built-in ones)
  } finally {
    done()
  }
}

// Whether they've been read (or given up on), for the games to wait on before the bots are made
export function useBotPresetsReady() {
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
