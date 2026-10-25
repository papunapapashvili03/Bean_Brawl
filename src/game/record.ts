import { supabase } from '../landing/supabase'
import { adaptive, difficultyFaced, rateLocally, refreshSkill } from './bots/difficulty'
import { botPreset } from './bots/presets'
import { onMatchWon, roundSoFar } from './bots/match'

// Every game played, kept in Supabase (the game_results table: see supabase/game_results.sql) for whoever's
// signed in (a guest too: registering keeps a guest's account, so their games carry over), and shown on
// the account page (../landing/Stats). Two kinds are kept: each round of a Party Games show (through, out,
// or the final won), and each Shoot Out match (won or lost). Kept with each, the difficulty the bots played
// at for the player; and each finished game moves the player's skill rating, which the bots go by
// (supabase/skill.sql, ./bots/difficulty). Leaving part way through counts: as out (or lost), left early.
// Nobody signed in, no Supabase, no table yet, or no connection: it's not kept, but still rated, here.

export type GameMode = 'party-games' | 'shoot-out'
export type Outcome = 'through' | 'out' | 'won' | 'lost'

// A row of the table, as it's kept
export type GameResult = {
  id: number
  played_at: string
  mode: GameMode
  map: string
  outcome: Outcome
  show_id: string | null // Party Games: the show the round was in
  round: number | null // and which of its rounds (1..)
  rounds: number | null // out of how many
  place: number | null // where you came (in a race, where you were as the round closed, if you didn't finish)
  field: number | null // out of how many
  seconds: number | null // how long it lasted for you
  kills: number | null // Shoot Out: your takedowns
  deaths: number | null // and how often you were taken down
  team_score: number | null // your side's score
  enemy_score: number | null // and the other side's
  bot_preset: string | null // the bots' difficulty preset (./bots/presets), or 'adaptive'
  difficulty: number | null // the difficulty the bots played at for you (0 Easy .. 0.5 Normal .. 1 Hard)
  left_early: boolean // you left part way through
}

type NewResult = Partial<Omit<GameResult, 'id' | 'played_at' | 'mode' | 'map' | 'outcome' | 'bot_preset'>> & Pick<GameResult, 'mode' | 'map' | 'outcome'>

// (A game over: the show, for Party Games, or the match)
const ends = (r: NewResult) => r.mode === 'shoot-out' || r.outcome === 'out' || r.outcome === 'won'

export async function recordGame(result: NewResult) {
  const stage = result.mode === 'shoot-out' ? 'match' : result.round != null && result.round === result.rounds ? 'final' : 'qualifier'
  const seconds = result.seconds == null ? null : Math.round(result.seconds * 10) / 10
  const row = { ...result, seconds, difficulty: result.difficulty ?? difficultyFaced(result.mode, stage), bot_preset: adaptive() ? 'adaptive' : botPreset().name }
  try {
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
    if (!supabase || !data.session) {
      rateLocally(row)
      return
    }
    let { error } = await supabase.from('game_results').insert(row)
    // (Before supabase/skill.sql's been run the table hasn't the columns for the difficulty and leaving early:
    // kept without them)
    if (error?.code === 'PGRST204') {
      const { difficulty: _difficulty, left_early: _left, ...plain } = row
      ;({ error } = await supabase.from('game_results').insert(plain))
    }
    // (Rated as it's kept: the new rating, for the next game's bots)
    if (!error && ends(row)) await refreshSkill()
  } catch {
    // (not kept: see above)
  }
}

// ---------------------------------------------------------------------------------------------------------
// Leaving part way through: what to keep if the player leaves now (each game in progress says), kept as the
// leave button's pressed (../GameMenu)

let leaving: (() => NewResult | null) | null = null
export function whileLeaving(game: () => NewResult | null) {
  leaving = game
  return () => {
    if (leaving === game) leaving = null
  }
}

const GIVE_UP_AFTER = 1500 // ms the leave button waits for it to be kept
export async function recordLeaving() {
  const game = leaving?.()
  leaving = null
  if (!game) return
  await Promise.race([recordGame({ ...game, left_early: true }), new Promise((done) => window.setTimeout(done, GIVE_UP_AFTER))])
}

// ---------------------------------------------------------------------------------------------------------

// Shoot Out: each match on this map as it's won (by either side), until the returned function's called
const NOTHING_YET = 20 // s: a match left this soon, with nothing happened, isn't counted
export function recordMatches(map: string) {
  const unhear = onMatchWon(({ winner, playerTeam, score, kills, deaths, seconds }) => {
    const enemy = Object.keys(score).find((team) => team !== playerTeam)
    void recordGame({
      mode: 'shoot-out',
      map,
      outcome: winner === playerTeam ? 'won' : 'lost',
      kills,
      deaths,
      seconds,
      team_score: score[playerTeam] ?? 0,
      enemy_score: enemy ? (score[enemy] ?? 0) : null,
    })
  })
  const unleave = whileLeaving(() => {
    const now = roundSoFar()
    if (now.over) return null
    const enemy = Object.keys(now.score).find((team) => team !== now.playerTeam)
    const mine = now.score[now.playerTeam] ?? 0
    const theirs = enemy ? (now.score[enemy] ?? 0) : 0
    if (now.seconds < NOTHING_YET && !mine && !theirs) return null
    return { mode: 'shoot-out', map, outcome: 'lost', kills: now.kills, deaths: now.deaths, seconds: now.seconds, team_score: mine, enemy_score: theirs }
  })
  return () => {
    unhear()
    unleave()
  }
}
