import { useSyncExternalStore } from 'react'
import type { Shooter, Target } from '../experimental/combat'
import type { Vec3 } from '../playerContact'
import { tuneShooters } from './difficulty'

// A team gunfight: two sides, the player on one with bots filling both. Eliminations score for the side that
// made them; the first side to SCORE_TO_WIN wins the round, and after a moment the score starts again. The
// player has shield and health like everyone else: eliminated, it waits a few seconds and comes back at its
// side's start. The HUD (./MatchHud) shows all this; the bots (./Bots) play it. How the player did in each
// round (its takedowns, and how often it was taken down) is told as the round's won (see ../record).

export type P3 = [number, number, number]
export type TeamSetup = { id: string; name: string; colour: string; spawns: P3[] }

export const SCORE_TO_WIN = 25
export const PLAYER_NAME = 'You'
export const MAX_HEALTH = 100
export const MAX_SHIELD = 100
export const RESPAWN_TIME = 4 // seconds out after being eliminated
export const SPAWN_PROTECTION = 1.5 // seconds untouchable after coming back
const FEED_TIME = 7 // seconds a line stays in the kill feed
const FEED_MAX = 6
const WIN_SHOW = 6 // seconds the winner is shown before the next round

export type FeedEntry = { id: number; killer: string | null; killerTeam: string | null; victim: string; victimTeam: string; headshot: boolean; at: number }

export type MatchView = {
  teams: TeamSetup[]
  playerTeam: string
  score: Record<string, number>
  feed: FeedEntry[]
  health: number
  shield: number
  down: boolean
  killer: string | null
  respawnIn: number // whole seconds left while out
  hits: number // counts hits taken (the HUD flashes on each)
  winner: string | null
  ready: boolean // the bots know their way round (see ./nav)
}

// Everyone on the field, for bots to look for: the player and each bot, by name
export type Combatant = { name: string; team: string; body: number; target: Target; position: () => Vec3 }
export const combatants = new Map<string, Combatant>()

export const now = () => performance.now() / 1000

const state = {
  teams: [] as TeamSetup[],
  playerTeam: '',
  score: {} as Record<string, number>,
  feed: [] as FeedEntry[],
  nextFeed: 0,
  health: MAX_HEALTH,
  shield: MAX_SHIELD,
  down: false,
  downAt: 0,
  killer: null as string | null,
  protectedUntil: 0,
  hits: 0,
  winner: null as string | null,
  winnerAt: 0,
  ready: false,
  // The player's round so far
  kills: 0,
  deaths: 0,
  roundStart: 0,
}

// Told as each round's won: who by, the score, and how the player did in it
export type MatchResult = { winner: string; playerTeam: string; score: Record<string, number>; kills: number; deaths: number; seconds: number }
const wonListeners = new Set<(result: MatchResult) => void>()
export function onMatchWon(listener: (result: MatchResult) => void) {
  wonListeners.add(listener)
  return () => {
    wonListeners.delete(listener)
  }
}

function newRound() {
  state.score = Object.fromEntries(state.teams.map((t) => [t.id, 0]))
  state.kills = state.deaths = 0
  state.roundStart = now()
  // (How hard the bots play this round: by how the player's been doing, ./difficulty)
  tuneShooters()
}

// The player's round so far (for leaving part way: see ../record)
export const roundSoFar = () => ({ kills: state.kills, deaths: state.deaths, seconds: now() - state.roundStart, score: state.score, playerTeam: state.playerTeam, over: state.winner !== null })

const listeners = new Set<() => void>()
let view = computeView()

function computeView(): MatchView {
  return {
    teams: state.teams,
    playerTeam: state.playerTeam,
    score: state.score,
    feed: state.feed,
    health: state.health,
    shield: state.shield,
    down: state.down,
    killer: state.killer,
    respawnIn: state.down ? Math.max(0, Math.ceil(state.downAt + RESPAWN_TIME - now())) : 0,
    hits: state.hits,
    winner: state.winner,
    ready: state.ready,
  }
}

function publish() {
  const next = computeView()
  const changed = (Object.keys(next) as (keyof MatchView)[]).some((key) => next[key] !== view[key])
  if (!changed) return
  view = next
  listeners.forEach((l) => l())
}

export function startMatch(teams: TeamSetup[], playerTeam: string) {
  state.teams = teams
  state.playerTeam = playerTeam
  newRound()
  state.feed = []
  state.health = MAX_HEALTH
  state.shield = MAX_SHIELD
  state.down = false
  state.killer = null
  state.protectedUntil = 0
  state.winner = null
  state.ready = false
  publish()
}

export const teamOf = (id: string) => state.teams.find((t) => t.id === id)
export const playerTeam = () => state.playerTeam
export const playerShooter = (): Shooter => ({ name: PLAYER_NAME, team: state.playerTeam })
export const playerCanMove = () => !state.down
export const playerAlive = () => !state.down && now() >= state.protectedUntil

export function setReady(ready: boolean) {
  state.ready = ready
  publish()
}

// The player is hit: the shield takes it first, then health. Out of health, the player is out for a while.
export function damagePlayer(amount: number, headshot: boolean, from?: Shooter) {
  if (state.down || now() < state.protectedUntil) return
  if (from && from.team === state.playerTeam && from.name !== PLAYER_NAME) return // a teammate's stray shot
  const toShield = Math.min(state.shield, amount)
  state.shield -= toShield
  state.health = Math.max(0, state.health - (amount - toShield))
  state.hits++
  if (state.health <= 0) {
    state.down = true
    state.downAt = now()
    const by = from ?? playerShooter()
    state.killer = by.name
    recordKill(by, playerShooter(), headshot)
  }
  publish()
}

// Out long enough: true once, when it's time to put the player back at its start
export function playerRespawnDue() {
  return state.down && now() >= state.downAt + RESPAWN_TIME
}

export function respawnPlayer() {
  state.down = false
  state.killer = null
  state.health = MAX_HEALTH
  state.shield = MAX_SHIELD
  state.protectedUntil = now() + SPAWN_PROTECTION
  publish()
}

// Someone eliminated: a point to the killer's side (none for knocking out your own side, or falling off)
export function recordKill(killer: Shooter | null, victim: Shooter, headshot: boolean) {
  if (state.winner === null) {
    if (killer?.name === PLAYER_NAME && killer.team !== victim.team) state.kills++
    if (victim.name === PLAYER_NAME) state.deaths++
  }
  if (killer && killer.team !== victim.team && state.winner === null) {
    state.score = { ...state.score, [killer.team]: (state.score[killer.team] ?? 0) + 1 }
    if (state.score[killer.team] >= SCORE_TO_WIN) {
      state.winner = killer.team
      state.winnerAt = now()
      const result = { winner: killer.team, playerTeam: state.playerTeam, score: state.score, kills: state.kills, deaths: state.deaths, seconds: now() - state.roundStart }
      wonListeners.forEach((l) => l(result))
    }
  }
  const self = killer?.name === victim.name
  state.feed = [
    ...state.feed.slice(-(FEED_MAX - 1)),
    {
      id: state.nextFeed++,
      killer: killer && !self ? killer.name : null,
      killerTeam: killer && !self ? killer.team : null,
      victim: victim.name,
      victimTeam: victim.team,
      headshot,
      at: now(),
    },
  ]
  publish()
}

// Every frame: old lines leave the feed, the respawn countdown ticks, a won round starts over
export function updateMatch() {
  const t = now()
  if (state.feed.length && state.feed[0].at < t - FEED_TIME) state.feed = state.feed.filter((f) => f.at >= t - FEED_TIME)
  if (state.winner !== null && t > state.winnerAt + WIN_SHOW) {
    state.winner = null
    newRound()
  }
  publish()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useMatch() {
  return useSyncExternalStore(subscribe, () => view)
}
