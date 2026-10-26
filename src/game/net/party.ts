import { useSyncExternalStore } from 'react'
import { accessToken } from '../../landing/money'
import { difficultyFor, setField, type Field } from '../bots/difficulty'
import { currentOutfit } from '../outfit'
import type { Racer } from '../race/race'
import { seeded, setRoundSeed } from '../roundSeed'
import { endShow, loadShow, startOnlineShow, type Show, type ShowHuman } from '../show'
import { connect, heard, myName, net, onMessage, send, serverNow } from './client'

// Party Games, online (the server's side: ../../../server/index.mjs). Playing a show queues for one: the
// lobby waits up to 30 seconds for players (up to 10 of them), then the show starts, and every player's
// screen makes the same show from the seed the server gives it (../show): the same maps, the same bots, and
// in each round the same things left to chance (../roundSeed). Each round's clock starts at the same moment
// on every screen, by the server's clock.
//
// In a round, each player runs its own bean and sends where it is (./Online); one of them, the host, runs the
// bots and sends where they are (../race/bots/RaceBots), and everyone else draws them from that (./puppet). Each
// player tells the server when its own round's over (home, out, or won), and the host tells it about the
// bots'; the server passes that on to everyone, and decides who goes through. Each player says how hard it
// needs the bots (../bots/difficulty) as it queues, and the server sets each round's field from them.
//
// Dropping out (a reload, or the connection going), a player comes back in where it was, if it can: with the
// ticket it was given, kept for the tab.
//
// A show can be played for a stake (&stake=<tier> on the address: see server/wallet.mjs): the player queues
// signed in (with its sign-in token, for the server to check its balance), in that tier's own lobby. As the
// show starts the server takes the stakes (or, with fewer than two staking, plays it free: `freed`), and when
// it's over, tells each player what they won from the pot.

export type PartyPhase = 'idle' | 'connecting' | 'lobby' | 'show' | 'failed'
export type Result = { round: number; through: string[]; at: number }
// What's at stake in the show (lamports): each player's stake and the pot, the site's fee and how the rest's
// shared out by place; or, meant to be staked, played free (too few staking)
export type Money = { stake: number; pot: number; fee: number; split: number[]; freed: boolean }
export type Paid = { place: number | null; lamports: number; pot: number; players: number }

// The stake tier this page plays for (0: free)
export const STAKE = Math.max(0, Math.floor(Number(new URLSearchParams(window.location.search).get('stake')) || 0))
type How = 'finish' | 'out' | 'won'

const KEY = 'fallguy.party' // { show, ticket }: the show this tab is in, to come back to after a reload

export const party = {
  phase: 'idle' as PartyPhase,
  lobby: null as { id: string; seed: number; startAt: number; max: number; stake: number } | null,
  show: null as Show | null, // the show, once it's started (made here; the director moves it on)
  ticket: null as string | null,
  host: null as number | null, // who runs the bots
  round: 0, // the round on the clock (the one being played, or about to be)
  at: 0, // when its clock starts, by the server's clock
  result: null as Result | null, // the last round decided
  problem: null as string | null,
  staking: false, // the problem's with staking (the show could be played free instead)
  stayedAsHost: null as boolean | null, // knocked out but the round left on the screen: whether I ran the bots
  money: null as Money | null,
  paid: null as Paid | null, // what I won, once the show's paid out
}

type View = {
  phase: PartyPhase
  seed: number | null
  startAt: number | null
  max: number
  stake: number // the lobby's (lamports)
  host: number | null
  show: Show | null
  result: Result | null
  problem: string | null
  staking: boolean
  money: Money | null
  paid: Paid | null
}
let view: View = { phase: 'idle', seed: null, startAt: null, max: 10, stake: 0, host: null, show: null, result: null, problem: null, staking: false, money: null, paid: null }
const listeners = new Set<() => void>()
function changed() {
  view = {
    phase: party.phase,
    seed: party.lobby?.seed ?? null,
    startAt: party.lobby?.startAt ?? null,
    max: party.lobby?.max ?? 10,
    stake: party.lobby?.stake ?? 0,
    host: party.host,
    show: party.show,
    result: party.result,
    problem: party.problem,
    staking: party.staking,
    money: party.money,
    paid: party.paid,
  }
  listeners.forEach((l) => l())
}
export function useParty() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => view,
  )
}

// ---------------------------------------------------------------------------------------------------------
// What the rest of the game asks

// This page is playing a show online (or waiting for one to start)
export const isOnline = () => party.phase !== 'idle'
// A round of it is on
export const inRound = () => party.phase === 'show'
// I run the bots
export const amHost = () => party.stayedAsHost ?? (party.host !== null && party.host === net.myId)
// Where I am among the show's players still in it (by id): the first gets the map's own start, the rest some
// of the bots' (see setStarts)
export const myIndex = () => Math.max(0, party.show?.humans?.findIndex((h) => h.id === net.myId) ?? 0)

// Seconds on the round's clock (online: the same on every screen), or null offline (the clock's the game's
// own). Below 0: wait (in the lobby, or still loading while the others are).
export function onlineClock() {
  if (!isOnline()) return null
  if (party.phase !== 'show') return -1
  return (serverNow() - party.at) / 1000
}

// Where the players other than the first start: the round's bots set these up as they're placed
let starts: ([number, number, number] | null)[] = []
export function setStarts(next: ([number, number, number] | null)[]) {
  starts = next
}
export const myStart = () => starts[myIndex()] ?? null

// A round's starting (being put on the screen): its clock, what's left to chance in it, and its map in the
// address (the bots go by it)
export function playing(show: Show, at: number) {
  party.show = show
  party.round = show.round
  party.at = at
  setRoundSeed(roundSeedOf(show))
  setField(fields.get(show.round) ?? null)
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${show.rounds[show.round].map}`)
  starts = []
  ends.clear()
  carry.clear()
  told.clear()
  botFeed.samples.length = 0
  botFeed.gaps.length = 0
  changed()
}
const roundSeedOf = (show: Show) => ((show.seed ?? 0) * 31 + show.round * 7919) >>> 0

// Each round's field, as the server sets it (how hard its bots play)
const fields = new Map<number, Field>()
function heardField(round: number, f: unknown) {
  const field = f as Field | null
  if (field && typeof field.low === 'number' && typeof field.high === 'number') fields.set(round, field)
}
const three = (v: number) => Math.round(v * 1000) / 1000

// ---------------------------------------------------------------------------------------------------------
// The field: everyone else in the round (the other players, and the bots when someone else runs them), as the
// race sees them, kept up to date with what's said about how their round ends

const field = new Map<string, Racer>() // 'p:<id>', 'b:<name>'
const ends = new Map<string, { how: How; clock: number }>() // whose round's over, how and when (this round)

function end(racer: Racer, how: How, clock: number) {
  if (how === 'out') racer.outClock ??= clock
  else racer.finishClock ??= clock
}
// Into the field (and told at once if its round's over already)
export function inField(key: string, racer: Racer) {
  field.set(key, racer)
  const was = ends.get(key)
  if (was) end(racer, was.how, was.clock)
  return () => {
    if (field.get(key) === racer) field.delete(key)
  }
}

// Where each bot was last, as drawn from the host's word: if the host goes and this player takes over running
// them, they carry on from there
export type Carried = { x: number; y: number; z: number; checkpoint: number; finishClock: number | null; outClock: number | null }
export const carry = new Map<string, Carried>()

// The bots, from the host: their last states (drawn by ../race/bots/PuppetBots)
export const botFeed = { samples: [] as number[][], gaps: [] as number[], offset: 0 }

// ---------------------------------------------------------------------------------------------------------
// Away: a page that's hidden (another tab, another app) or barely being drawn can't keep the bots going, so
// while it's like that it says so, and the server has someone else run them. (Its own bean waits for it.)

const AWAY_AFTER = 600 // ms without a frame
const BACK_AFTER = 2000 // ms of frames coming steadily again
let lastFrame = 0
let steadySince = 0
let away = false

// Each frame, from a round on the screen
export function framed() {
  const now = performance.now()
  if (now - lastFrame > 100) steadySince = now
  lastFrame = now
}

function checkAway() {
  if (party.phase !== 'show') return
  const now = performance.now()
  const slow = document.hidden || now - lastFrame > AWAY_AFTER
  const next = away ? slow || now - steadySince < BACK_AFTER : slow
  if (next === away) return
  away = next
  send({ t: away ? 'away' : 'here' })
}
window.setInterval(checkAway, 250)
document.addEventListener('visibilitychange', checkAway)

// ---------------------------------------------------------------------------------------------------------
// Telling the server

const told = new Map<string, object>() // this round's ends told (told again on coming back in, in case)

// My round's over (or, as host, a bot's): home, out, or (the final) won, at `clock` on the round's clock
export function tellDone(how: How, clock: number, bot?: string) {
  const key = bot === undefined ? 'me' : `b:${bot}`
  if (told.has(key)) return
  const message = { t: 'done', how, clock: Math.round(clock * 1000) / 1000, ...(bot === undefined ? {} : { bot }) }
  told.set(key, message)
  send(message)
}

// Off the show (or out of the lobby) for good: the server's told, and nothing's kept to come back to. With
// `stay`, the round stays on the screen as it was (knocked out of the show: the card's over it), only
// without anyone else's word of it any more.
export function leaveParty({ stay = false } = {}) {
  send({ t: 'leave' })
  if (stay) party.stayedAsHost = amHost()
  forget()
  stop?.()
  stop = null
  if (stay) return
  party.phase = 'idle'
  changed()
}

function keep(show: string, ticket: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ show, ticket }))
  } catch {
    // (not kept: a reload can't come back in)
  }
}
function kept(): { show: string; ticket: string } | null {
  try {
    const k = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return k && typeof k.show === 'string' && typeof k.ticket === 'string' ? k : null
  } catch {
    return null
  }
}
function forget() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // (nothing kept)
  }
  endShow()
}
// My show's over (the final played out): nothing to come back to on a reload, but still here to watch
export const showOver = forget

// ---------------------------------------------------------------------------------------------------------
// Joining

let stop: (() => void) | null = null
let unhear: (() => void) | null = null

// Into a show: queued for one, or back into the one this tab was in. Until the returned function's called.
export function joinParty() {
  if (stop) return stop
  const back = kept()
  // (Not coming back to one: no show left over from before in the tab)
  if (!back) endShow()
  party.phase = 'connecting'
  party.problem = null
  party.staking = false
  changed()
  let cancelled = false
  let quit: (() => void) | null = null
  const begin = (token: string | null) => {
    if (cancelled) return
    unhear = onMessage(hear)
    stop = quit = connect(() => {
      // (Back into the show it's in, coming back after the connection went; or after a reload)
      if (party.show && party.ticket) return { t: 'rejoin', show: party.show.id, ticket: party.ticket }
      if (back && party.phase === 'connecting') return { t: 'rejoin', show: back.show, ticket: back.ticket }
      if (party.phase === 'failed') return null
      const skill = { q: three(difficultyFor('party-games', 'qualifier')), f: three(difficultyFor('party-games', 'final')) }
      return { t: 'queue', name: myName(), outfit: currentOutfit(), skill, ...(STAKE ? { stake: STAKE, token } : {}) }
    })
  }
  // (Staking, the server checks who it is: the sign-in's token goes with the queue)
  if (STAKE && !back) {
    void accessToken()
      .then(begin)
      .catch(() => begin(null))
  } else begin(null)
  return () => {
    cancelled = true
    unhear?.()
    unhear = null
    quit?.()
    if (stop === quit) stop = null
    party.phase = 'idle'
  }
}

// What's at stake, as the server says as the show starts (or as I come back to it)
function moneyOf(m: Record<string, unknown>): Money | null {
  if (typeof m.stake !== 'number') return null
  return { stake: m.stake, pot: (m.pot as number) ?? 0, fee: (m.fee as number) ?? 0, split: (m.split as number[]) ?? [], freed: !!m.freed }
}

function fail(problem: string) {
  party.phase = 'failed'
  party.problem = problem
  forget()
  changed()
}

function hear(m: Record<string, unknown> & { t: string }) {
  switch (m.t) {
    case 'lobby':
      party.phase = 'lobby'
      party.lobby = { id: m.id as string, seed: m.seed as number, startAt: m.startAt as number, max: m.max as number, stake: (m.stake as number) ?? 0 }
      changed()
      break
    case 'starts':
      if (party.lobby) party.lobby = { ...party.lobby, startAt: m.at as number }
      changed()
      break
    case 'show': {
      const humans = (m.players as ShowHuman[]).map(({ id, name, colour }) => ({ id, name, colour }))
      const show = startOnlineShow(m.id as string, m.seed as number, humans, seeded(m.seed as number))
      party.ticket = m.ticket as string
      party.host = m.host as number
      party.money = moneyOf(m)
      heardField(0, m.field)
      keep(show.id, party.ticket)
      party.phase = 'show'
      playing(show, m.at as number)
      break
    }
    case 'rejoined': {
      party.host = m.host as number
      party.money = moneyOf(m)
      heardField(m.round as number, m.field)
      away = false
      if (party.show) {
        // (Back after the connection went: tell again how my round ended, in case that didn't get there)
        party.phase = 'show'
        told.forEach((message) => send(message))
        changed()
        break
      }
      // After a reload: carry on from the show kept for the tab, if it's still on the round the server is
      const back = kept()
      const show = loadShow()
      if (!back || !show || show.id !== back.show || show.round !== m.round) {
        send({ t: 'leave' })
        fail('You missed a round while you were away.')
        break
      }
      party.ticket = back.ticket
      party.phase = 'show'
      playing(show, m.at as number)
      break
    }
    case 'host':
      party.host = m.id as number
      botFeed.samples.length = 0
      botFeed.gaps.length = 0
      changed()
      break
    case 'result':
      heardField((m.round as number) + 1, m.field)
      party.result = { round: m.round as number, through: m.through as string[], at: m.at as number }
      changed()
      break
    case 'done': {
      const key = m.bot !== undefined ? `b:${m.bot as string}` : `p:${m.id as number}`
      const how = m.how as How
      const clock = m.clock as number
      if (ends.has(key)) break
      ends.set(key, { how, clock })
      const racer = field.get(key)
      if (racer) end(racer, how, clock)
      break
    }
    case 'b': {
      const d = m.d as number[]
      if (m.id === party.host && Array.isArray(d)) heard(botFeed, d)
      break
    }
    case 'closed':
      // (In the lobby: queued again once it's back. In the show: back in, with the ticket.)
      if (party.phase === 'lobby') party.phase = 'connecting'
      changed()
      break
    case 'paid':
      party.paid = { place: (m.place as number | null) ?? null, lamports: m.lamports as number, pot: m.pot as number, players: m.players as number }
      changed()
      break
    case 'error':
      if (m.reason === 'stake') {
        party.staking = true
        fail(String(m.message))
        break
      }
      if (m.reason !== 'show-gone') break
      if (party.show) {
        fail('That show’s over.')
        break
      }
      // (A ticket kept from a show that's over, or that this tab left: find a new one instead)
      try {
        sessionStorage.removeItem(KEY)
      } catch {
        // (nothing kept)
      }
      window.setTimeout(() => {
        unhear?.()
        unhear = null
        stop?.()
        stop = null
        joinParty()
      })
      break
  }
}
