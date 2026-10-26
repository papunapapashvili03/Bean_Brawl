// Fallguy's online play server, over WebSockets. Two ways to play together:
//
// - The Playground: one room anyone can drop into. Each player sends where its bean is and what it's doing
//   about 20 times a second, and the server passes that on to everyone else there straight away.
// - Party Games: players queue for a show. Up to PARTY_MAX of them wait together in a lobby for LOBBY_WAIT
//   (less, once it's full), then play the show's three rounds together, the rest of the field bots. Every
//   player's screen works out the show (its maps, its bots) from the seed the server gives it, the same for
//   all of them. One player, the host, runs the bots for everyone and sends where they are. The server keeps
//   the show's timetable (when each round's clock starts, by the server's clock), is told of every finish
//   (each player tells of its own, the host of the bots'), and decides who goes through each round: the
//   first so many home. A player who drops out can come back (with the ticket it was given) for a while.
//   Each player says how hard it needs the bots (its difficulty: src/game/bots/difficulty.ts), and each
//   round the server sets the field from the players in it: the bulk of the bots as hard as the one who
//   needs it easiest, the best few as hard as the one who needs it hardest.
// - Shows played for stakes (./wallet.mjs): each stake tier has its own lobby. As the show starts, each
//   signed-in player's stake comes off their balance; when it ends, the pot (less the site's fee) goes to
//   the players who came top, ranked among the players only (bots never win money). With fewer than two
//   players staking, the show's played free and nothing's taken.
//
// It also tells each room who's joined (name, colour, outfit) and who's left, and answers pings (with the
// server's clock, so players can see their lag and time things by it). Each player is trusted with its own
// bean and its own finish: fine for playing together, NOT YET for real money (see WALLET.md). The wallet's
// own requests (deposits, withdrawals) are HTTP: /wallet/... (./wallet.mjs).
//
// Runs anywhere Node does: `npm start` (port 2567, or $PORT, as on Railway). GET / answers "ok", for health checks.

import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { FEE, TIERS, handleWallet, moneyOn, payoutsFor, splitFor, stakes } from './wallet.mjs'

const PORT = Number(process.env.PORT) || 2567
const PLAYGROUND = 'playground'
const ROOM_SIZE = 30
const NAME_MAX = 24
const STATE_LENGTH = 12 // numbers in a state message (see src/game/net/protocol.ts)
const BOT_STATE = 10 // numbers for each bot in the host's bots message (after its stamp)
const MAX_BOTS = 32
const MAX_MESSAGES_PER_SECOND = 60
const HEARTBEAT_MS = 10_000

// Party Games. (The round numbers match the game's: src/game/show.ts and src/game/race/race.ts.)
const PARTY_MAX = 10 // players in a show, at most
const LOBBY_WAIT = 30_000 // ms the lobby waits for players
const FULL_WAIT = 3_000 // and how soon it starts once it's full
const FIRST_ROUND_IN = 4_000 // from the show starting to its first round's clock starting (loading the map)
const QUOTAS = [16, 10, null] // how many go through each round (null: the final)
const COUNTDOWN = 4_000
const ROUND_CAP = 300_000 // a qualifying round closes after this, with whoever's home
const FINAL_CAP = 360_000
const GRACE = 700 // once the quota's home, ms to wait for word of anyone who got there first
const BREAK = 7_000 // from a round being decided to the next one's clock starting (the break, then loading)
const REJOIN_WITHIN = 20_000 // ms a player who's dropped out of a show can come back in
const TICK = 250

// Colours for the beans (every player sees their own bean orange, so not that)
const COLOURS = ['#4f7dff', '#36c2a0', '#8f6bff', '#ff5c8a', '#ffd23f', '#3fb5ff', '#b7e04a', '#ff9ec4', '#7df9ff', '#c77dff', '#4dd4ac', '#e23b4e']
// What can be worn, slot by slot (anything else is dropped)
const OUTFIT_KEYS = ['hat', 'face', 'shades', 'back', 'flag']

/**
 * @typedef {{ id: number, ws: import('ws').WebSocket, name: string, colour: string, outfit: Record<string, string>, room: string | null, party: Party | null, alive: boolean, window: number, count: number }} Player
 * @typedef {{ reached: number, finish: number | null }} Result how far a player got, if it went out before the final
 * @typedef {{ id: number, p: Player | null, name: string, colour: string, outfit: Record<string, string>, ticket: string, state: 'in' | 'out', goneAt: number, away: boolean, skill: { q: number, f: number }, user: string | null, result: Result | null }} Member
 * @typedef {{ id: string, room: string, seed: number, tier: number, staked: boolean, stake: number, pot: number, freed: boolean, startAt: number, starting: boolean, started: boolean, over: boolean, members: Map<number, Member>, round: number, at: number, quota: number | null, ends: Map<string, { how: string, clock: number }>, decideAt: number | null, host: number | null, emptySince: number | null }} Party
 */

/** @type {Map<string, Map<number, Player>>} who's in each room */
const rooms = new Map()
/** @type {Set<Player>} everyone connected, in a room or not */
const connected = new Set()
/** @type {Map<string, Party>} lobbies and shows, by id */
const parties = new Map()
/** @type {Map<number, Party>} the lobby taking players now, for each stake tier */
const open = new Map()
/** @type {Map<string, Party>} the lobby or show each account's staking in */
const staking = new Map()
let nextId = 1

const http = createServer((req, res) => {
  if (handleWallet(req, res)) return
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' })
  const playground = rooms.get(PLAYGROUND)?.size ?? 0
  const shows = [...parties.values()].filter((p) => p.started && !p.over).length
  res.end(`ok (playground: ${playground}, lobbies: ${parties.size - shows}, shows: ${shows})\n`)
})
const wss = new WebSocketServer({ server: http, maxPayload: 8192 })

const send = (ws, message) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}
function broadcast(room, message, except) {
  const players = rooms.get(room)
  if (!players) return
  const data = JSON.stringify(message)
  for (const p of players.values()) if (p !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(data)
}
const describe = (p) => ({ id: p.id, name: p.name, colour: p.colour, outfit: p.outfit })

function cleanName(name) {
  // (No control characters or angle brackets)
  const n = typeof name === 'string' ? [...name].filter((c) => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('').trim().slice(0, NAME_MAX) : ''
  return n || 'Bean'
}
function cleanOutfit(outfit) {
  const out = {}
  if (outfit && typeof outfit === 'object') {
    for (const key of OUTFIT_KEYS) {
      const v = outfit[key]
      if (typeof v === 'string' && v.length <= 24 && /^[A-Za-z0-9_-]+$/.test(v)) out[key] = v
    }
  }
  return out
}
function freeColour(taken) {
  const used = new Set(taken)
  return COLOURS.find((c) => !used.has(c)) ?? COLOURS[used.size % COLOURS.length]
}
const numbers = (d, length) => Array.isArray(d) && d.length === length && d.every((v) => typeof v === 'number' && Number.isFinite(v))
// How hard a player needs the bots: in the qualifying rounds (q) and the final (f), 0 Easy .. 1.25 Elite
const level = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1.25, Math.max(0, v)) : 0.5)
const cleanSkill = (skill) => ({ q: level(skill?.q), f: level(skill?.f) })

function enter(p, room) {
  let players = rooms.get(room)
  if (!players) rooms.set(room, (players = new Map()))
  players.set(p.id, p)
  p.room = room
}
function exit(p) {
  if (!p.room) return
  const players = rooms.get(p.room)
  players?.delete(p.id)
  if (players && players.size === 0) rooms.delete(p.room)
  p.room = null
}

// ---------------------------------------------------------------------------------------------------------
// The Playground

function join(p, message) {
  if (message.room !== PLAYGROUND) return send(p.ws, { t: 'error', reason: 'no-such-room' })
  if (p.room) return
  const players = rooms.get(PLAYGROUND)
  if (players && players.size >= ROOM_SIZE) return send(p.ws, { t: 'error', reason: 'room-full' })
  p.name = cleanName(message.name)
  p.outfit = cleanOutfit(message.outfit)
  p.colour = freeColour(players ? [...players.values()].map((o) => o.colour) : [])
  enter(p, PLAYGROUND)
  send(p.ws, { t: 'welcome', id: p.id, colour: p.colour, players: [...rooms.get(PLAYGROUND).values()].filter((o) => o !== p).map(describe) })
  broadcast(PLAYGROUND, { t: 'join', player: describe(p) }, p)
  console.log(`${p.name} (#${p.id}) joined the playground: ${rooms.get(PLAYGROUND).size} there`)
}

// ---------------------------------------------------------------------------------------------------------
// Party Games: the lobby

const here = (party) => [...party.members.values()].filter((m) => m.p)

// (A player turned away from a staked show: why, for the game to say)
const refuse = (p, code, message) => send(p.ws, { t: 'error', reason: 'stake', code, message })

async function queue(p, message) {
  if (p.room || p.queueing) return
  const tier = Number.isInteger(message.stake) && message.stake > 0 && message.stake < TIERS.length ? message.stake : 0
  // Staking: signed in, with enough in the balance, and not staking on another show already
  let user = null
  if (tier > 0) {
    if (!moneyOn) return refuse(p, 'off', 'Staked shows aren’t on yet. Play a free one instead.')
    p.queueing = true
    try {
      user = await stakes.check(message.token, tier)
    } catch (e) {
      return refuse(p, e.code ?? 'server', e.code ? e.message : 'Couldn’t check your balance: try again.')
    } finally {
      p.queueing = false
    }
    if (p.room || p.ws.readyState !== p.ws.OPEN) return
    if (staking.has(user)) return refuse(p, 'busy', 'You’re in a staked show already (in another tab?).')
  }
  p.name = cleanName(message.name)
  p.outfit = cleanOutfit(message.outfit)
  let party = open.get(tier)
  if (!party || party.starting || party.started || party.members.size >= PARTY_MAX) {
    const id = randomUUID()
    party = {
      id,
      room: `party:${id}`,
      seed: Math.floor(Math.random() * 2 ** 31),
      tier,
      staked: false,
      stake: 0,
      pot: 0,
      freed: false,
      startAt: Date.now() + LOBBY_WAIT,
      starting: false,
      started: false,
      over: false,
      members: new Map(),
      round: 0,
      at: 0,
      quota: QUOTAS[0],
      ends: new Map(),
      decideAt: null,
      host: null,
      emptySince: null,
    }
    parties.set(id, party)
    open.set(tier, party)
  }
  p.colour = freeColour([...party.members.values()].map((m) => m.colour))
  party.members.set(p.id, { id: p.id, p, name: p.name, colour: p.colour, outfit: p.outfit, ticket: randomBytes(12).toString('hex'), state: 'in', goneAt: 0, away: false, skill: cleanSkill(message.skill), user, result: null })
  if (user) staking.set(user, party)
  p.party = party
  enter(p, party.room)
  if (party.members.size >= PARTY_MAX) {
    party.startAt = Math.min(party.startAt, Date.now() + FULL_WAIT)
    broadcast(party.room, { t: 'starts', at: party.startAt }, p)
  }
  send(p.ws, { t: 'lobby', id: party.id, seed: party.seed, startAt: party.startAt, max: PARTY_MAX, you: p.id, colour: p.colour, stake: TIERS[tier], players: here(party).filter((m) => m.p !== p).map(describe) })
  broadcast(party.room, { t: 'join', player: describe(p) }, p)
  console.log(`${p.name} (#${p.id}) queued for a ${tier ? `${TIERS[tier] / 1e9} SOL` : 'free'} show: ${party.members.size} in its lobby`)
}

// An account's free to stake on another show (it's out of this one, or this one's over)
function release(m) {
  if (m.user && staking.get(m.user)?.members.get(m.id) === m) staking.delete(m.user)
}

// The lobby's waited long enough (or it's full): the show starts, with everyone there. Staked, their stakes
// are taken first: anyone whose balance can't cover it now is left out (told why); and with fewer than two
// staking, it's played free.
async function startShow(party) {
  party.starting = true
  if (open.get(party.tier) === party) open.delete(party.tier)
  let paid = []
  if (party.tier > 0) {
    const stakers = here(party).filter((m) => m.user)
    if (stakers.length >= 2) {
      try {
        paid = await stakes.start(party.id, party.tier, stakers.map((m) => m.user))
      } catch (e) {
        console.error(`Show ${party.id.slice(0, 8)}: couldn't take the stakes (${e.message}): played free`)
      }
      if (paid.length === 1) {
        await stakes.refund(party.id).catch((e) => console.error(`Show ${party.id.slice(0, 8)}: refund failed: ${e.message}`))
        paid = []
      }
    }
    if (paid.length >= 2) {
      party.staked = true
      party.stake = TIERS[party.tier]
      party.pot = party.stake * paid.length
      for (const m of stakers) {
        if (paid.includes(m.user)) continue
        if (m.p) {
          refuse(m.p, 'balance', 'Your balance couldn’t cover the stake by the time the show started.')
          exit(m.p)
          m.p.party = null
        }
        party.members.delete(m.id)
        release(m)
      }
    } else {
      party.freed = true
      for (const m of stakers) release(m)
    }
  }
  party.started = true
  const players = here(party)
    .sort((a, b) => a.id - b.id)
    .map(describe)
  // (Gone while the stakes were taken: out of it, but a staked player's still in the standings)
  for (const [id, m] of party.members) {
    if (m.p) continue
    if (party.staked && paid.includes(m.user)) out(party, m)
    else {
      party.members.delete(id)
      release(m)
    }
  }
  party.round = 0
  party.at = Date.now() + FIRST_ROUND_IN
  party.quota = QUOTAS[0]
  party.host = players[0]?.id ?? null
  const field = fieldFor(party, 0)
  const money = moneyOf(party)
  for (const m of party.members.values()) if (m.p) send(m.p.ws, { t: 'show', id: party.id, seed: party.seed, at: party.at, round: 0, host: party.host, players, ticket: m.ticket, field, ...money })
  console.log(`Show ${party.id.slice(0, 8)} started with ${players.length} player(s)${party.staked ? `, pot ${party.pot / 1e9} SOL` : party.freed ? ' (too few staking: free)' : ''}`)
}

// What's at stake in a show, for the players: the stake, the pot, how it's shared out (of what's left after
// the fee), and whether it was meant to be staked but turned free
function moneyOf(party) {
  if (!party.staked) return { stake: 0, freed: party.freed }
  const players = [...party.members.values()].filter((m) => m.user).length
  return { stake: party.stake, pot: party.pot, fee: FEE, split: splitFor(players) }
}

// The order the staked players came in, as groups of those who came equal (best first): how far into the
// show each got, then in the final, winning or how long they lasted, and in a round they went out of,
// whether (and how soon) they finished it
function standings(party) {
  const finalRound = QUOTAS.length - 1
  const keyOf = (m) => {
    if (m.result) return [m.result.reached, 0, m.result.finish === null ? -1 : 1e6 - m.result.finish]
    const e = party.round === finalRound ? party.ends.get(`p:${m.id}`) : undefined
    if (!e) return [party.round, 0, 0]
    return e.how === 'won' ? [party.round, 2, 0] : [party.round, 1, e.clock]
  }
  const keyed = [...party.members.values()].filter((m) => m.user).map((m) => ({ m, key: keyOf(m) }))
  keyed.sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2])
  const groups = []
  for (const k of keyed) {
    const last = groups[groups.length - 1]
    if (last && JSON.stringify(last.key) === JSON.stringify(k.key)) last.members.push(k.m)
    else groups.push({ key: k.key, members: [k.m] })
  }
  return groups.map((g) => g.members)
}

// A staked show's over: the pot paid out, and each player still here told what they won
async function settle(party) {
  const ranked = standings(party)
  const payouts = payoutsFor(
    party.pot,
    ranked.map((group) => group.map((m) => m.user)),
  )
  try {
    await stakes.settle(party.id, payouts)
  } catch (e) {
    // (Left live: refunded as the server next starts)
    console.error(`Show ${party.id.slice(0, 8)}: couldn't pay out (${e.message})`)
    return
  }
  for (const group of ranked) {
    for (const m of group) {
      const pay = payouts.find((x) => x.user === m.user)
      if (m.p) send(m.p.ws, { t: 'paid', place: pay?.place ?? null, lamports: pay?.lamports ?? 0, pot: party.pot, players: payouts.length })
    }
  }
  console.log(`Show ${party.id.slice(0, 8)}: paid out ${payouts.filter((x) => x.lamports > 0).map((x) => `${x.place}: ${x.lamports / 1e9}`).join(', ')} SOL`)
}

// ---------------------------------------------------------------------------------------------------------
// Party Games: the show

// A round's field: how hard its bots play, from the bulk of them (low) to the best few (high), by the
// players still in the show
function fieldFor(party, round) {
  const final = QUOTAS[round] === null
  const wants = [...party.members.values()].filter((m) => m.state === 'in').map((m) => (final ? m.skill.f : m.skill.q))
  if (!wants.length) return { low: 0.5, high: 0.5 }
  return { low: Math.min(...wants), high: Math.max(...wants) }
}

// The host runs the bots: whoever has been (while it's still in the show, connected, and not away: its page
// hidden, or too slow to keep them going), or else the first in the show (by id) who is. (With everyone
// away, whoever's connected.)
function pickHost(party) {
  const able = (m) => !!m && m.state === 'in' && !!m.p
  const current = party.host === null ? undefined : party.members.get(party.host)
  if (able(current) && !current.away) return
  const members = [...party.members.values()].filter(able).sort((a, b) => a.id - b.id)
  const host = (members.find((m) => !m.away) ?? (able(current) ? current : members[0]))?.id ?? null
  if (host === party.host) return
  party.host = host
  broadcast(party.room, { t: 'host', id: host })
}

// Someone's round is over: home, out, or (the final) won. Each runner's told of once a round.
function done(p, message) {
  const party = p.party
  if (!party?.started || party.over) return
  const member = party.members.get(p.id)
  if (!member || member.state !== 'in') return
  const { how, bot } = message
  const clock = message.clock
  if (how !== 'finish' && how !== 'out' && how !== 'won') return
  if (typeof clock !== 'number' || !Number.isFinite(clock) || clock < 0 || clock > 3600) return
  if (bot !== undefined && (p.id !== party.host || typeof bot !== 'string' || bot.length > NAME_MAX)) return
  const key = bot !== undefined ? `b:${bot}` : `p:${p.id}`
  if (party.ends.has(key)) return
  party.ends.set(key, { how, clock })
  broadcast(party.room, bot !== undefined ? { t: 'done', bot, how, clock } : { t: 'done', id: p.id, how, clock }, p)
  if (party.quota !== null) {
    const home = [...party.ends.values()].filter((e) => e.how === 'finish').length
    if (home >= party.quota && party.decideAt === null) party.decideAt = Date.now() + GRACE
  } else if (bot === undefined) {
    finalOver(party)
  }
}

// A qualifying round's over: the first home (by their clocks) go through, the rest of the players are out
function decide(party) {
  const through = [...party.ends]
    .filter(([, e]) => e.how === 'finish')
    .sort((a, b) => a[1].clock - b[1].clock)
    .slice(0, party.quota)
    .map(([key]) => key)
  const round = party.round
  const out = [...party.members.values()].filter((m) => m.state === 'in' && !through.includes(`p:${m.id}`))
  for (const m of out) {
    const e = party.ends.get(`p:${m.id}`)
    m.state = 'out'
    m.result = { reached: round, finish: e?.how === 'finish' ? e.clock : null }
    release(m)
  }
  party.round++
  party.at = Date.now() + BREAK
  party.quota = QUOTAS[party.round] ?? null
  party.ends.clear()
  party.decideAt = null
  broadcast(party.room, { t: 'result', round, through, at: party.at, field: fieldFor(party, party.round) })
  for (const m of out) {
    if (m.p) {
      exit(m.p)
      m.p.party = null
    }
    broadcast(party.room, { t: 'leave', id: m.id })
  }
  console.log(`Show ${party.id.slice(0, 8)}: round ${round + 1} decided, ${through.length} through`)
  if (![...party.members.values()].some((m) => m.state === 'in')) return endShow(party)
  pickHost(party)
}

// The final's over once every player still in it has said how it went for them (or been gone too long)
function finalOver(party) {
  const waiting = [...party.members.values()].some((m) => m.state === 'in' && !party.ends.has(`p:${m.id}`))
  if (!waiting) endShow(party)
}

function endShow(party) {
  if (party.over) return
  party.over = true
  // (Paid out before the players are let go, so those still here hear what they won)
  const paying = party.staked ? settle(party) : Promise.resolve()
  void paying.finally(() => {
    for (const m of party.members.values()) {
      release(m)
      if (!m.p) continue
      exit(m.p)
      m.p.party = null
    }
    parties.delete(party.id)
    console.log(`Show ${party.id.slice(0, 8)} over`)
  })
}

// Back into a show after dropping out of it (a reload, or the connection going), with the ticket it was given
function rejoin(p, message) {
  if (p.room) return
  const party = typeof message.show === 'string' ? parties.get(message.show) : undefined
  const member = party?.started && !party.over ? [...party.members.values()].find((m) => m.ticket === message.ticket) : undefined
  if (!party || !member || member.state !== 'in') return send(p.ws, { t: 'error', reason: 'show-gone' })
  // (Its old connection may not have been noticed as gone yet)
  const old = member.p
  if (old) {
    exit(old)
    old.party = null
    old.ws.terminate()
  }
  p.id = member.id
  p.name = member.name
  p.colour = member.colour
  p.outfit = member.outfit
  p.party = party
  member.p = p
  member.goneAt = 0
  member.away = false
  enter(p, party.room)
  const players = [...party.members.values()].filter((m) => m.state === 'in').sort((a, b) => a.id - b.id)
  send(p.ws, { t: 'rejoined', id: p.id, colour: p.colour, round: party.round, at: party.at, host: party.host, players: players.filter((m) => m !== member && m.p).map(describe), field: fieldFor(party, party.round), ...moneyOf(party) })
  broadcast(party.room, { t: 'join', player: describe(p) }, p)
  pickHost(party)
  console.log(`${p.name} (#${p.id}) is back in show ${party.id.slice(0, 8)}`)
}

// Gone from a lobby or a show: from a lobby, that's that; from a show, it can come back for a while (unless
// it said it was leaving)
function leaveParty(p, forGood) {
  const party = p.party
  if (!party) return
  const member = party.members.get(p.id)
  exit(p)
  p.party = null
  broadcast(party.room, { t: 'leave', id: p.id })
  if (!member || member.p !== p) return
  if (!party.started) {
    // (While the stakes are being taken: whether this one's was is settled as the show starts)
    if (party.starting) {
      member.p = null
      member.goneAt = Date.now()
      return
    }
    party.members.delete(p.id)
    release(member)
    if (party.members.size === 0 && !party.starting) {
      parties.delete(party.id)
      if (open.get(party.tier) === party) open.delete(party.tier)
    }
    return
  }
  member.p = null
  member.goneAt = Date.now()
  if (forGood) out(party, member)
  pickHost(party)
  if (party.quota === null) finalOver(party)
}

// Out of the show part way (left, or gone too long): it got as far as the round it's in
function out(party, m) {
  if (m.state !== 'in') return
  m.state = 'out'
  m.result ??= { reached: party.round, finish: null }
  release(m)
}

// Every so often: lobbies whose time is up start, rounds close, and those gone too long are out
setInterval(() => {
  const now = Date.now()
  for (const party of [...parties.values()]) {
    if (!party.started) {
      if (!party.starting && now >= party.startAt) void startShow(party)
      continue
    }
    if (party.over) continue
    for (const m of party.members.values()) if (m.state === 'in' && !m.p && now - m.goneAt > REJOIN_WITHIN) out(party, m)
    const anyone = [...party.members.values()].some((m) => m.state === 'in')
    if (!anyone) {
      endShow(party)
      continue
    }
    if (party.quota !== null) {
      if ((party.decideAt !== null && now >= party.decideAt) || now >= party.at + COUNTDOWN + ROUND_CAP) decide(party)
    } else if (now >= party.at + COUNTDOWN + FINAL_CAP) endShow(party)
    else finalOver(party)
  }
}, TICK)

// ---------------------------------------------------------------------------------------------------------

wss.on('connection', (ws) => {
  /** @type {Player} */
  const p = { id: nextId++, ws, name: 'Bean', colour: COLOURS[0], outfit: {}, room: null, party: null, alive: true, window: Date.now(), count: 0 }
  connected.add(p)
  ws.on('pong', () => (p.alive = true))

  ws.on('message', (raw) => {
    // (No more than so many messages a second from anyone)
    const now = Date.now()
    if (now - p.window > 1000) {
      p.window = now
      p.count = 0
    }
    if (++p.count > MAX_MESSAGES_PER_SECOND) return
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!message || typeof message !== 'object') return
    switch (message.t) {
      case 'join':
        join(p, message)
        break
      case 'queue':
        void queue(p, message)
        break
      case 'rejoin':
        rejoin(p, message)
        break
      case 'leave':
        if (p.party) leaveParty(p, true)
        break
      case 's':
        // Where its bean is and what it's doing: passed on as it is, if it's the right shape
        if (!p.room || !numbers(message.d, STATE_LENGTH)) return
        broadcast(p.room, { t: 's', id: p.id, d: message.d }, p)
        break
      case 'b': {
        // The bots, from the show's host: passed on likewise
        const d = message.d
        const party = p.party
        if (!party?.started || party.host !== p.id || !Array.isArray(d)) return
        const bots = (d.length - 1) / BOT_STATE
        if (!Number.isInteger(bots) || bots > MAX_BOTS || !numbers(d, d.length)) return
        broadcast(p.room, { t: 'b', id: p.id, d }, p)
        break
      }
      case 'done':
        done(p, message)
        break
      case 'away':
      case 'here': {
        // Its page hidden, or too slow to run the bots (or back to normal): someone else runs them meanwhile
        const member = p.party?.started ? p.party.members.get(p.id) : undefined
        if (!member || member.p !== p) return
        member.away = message.t === 'away'
        pickHost(p.party)
        break
      }
      case 'outfit':
        if (!p.room) return
        p.outfit = cleanOutfit(message.outfit)
        broadcast(p.room, { t: 'outfit', id: p.id, outfit: p.outfit }, p)
        break
      case 'ping':
        send(ws, { t: 'pong', c: message.c, s: now })
        break
    }
  })

  const gone = () => {
    if (!connected.has(p)) return
    connected.delete(p)
    if (p.party) leaveParty(p, false)
    else if (p.room) {
      const room = p.room
      exit(p)
      broadcast(room, { t: 'leave', id: p.id })
      console.log(`${p.name} (#${p.id}) left ${room}: ${rooms.get(room)?.size ?? 0} there`)
    }
  }
  ws.on('close', gone)
  ws.on('error', gone)
})

// Drop anyone who's stopped answering
const heartbeat = setInterval(() => {
  for (const p of connected) {
    if (!p.alive) {
      p.ws.terminate()
      continue
    }
    p.alive = false
    p.ws.ping()
  }
}, HEARTBEAT_MS)
wss.on('close', () => clearInterval(heartbeat))

// (Shows this server was running before it stopped are gone: their stakes go back)
await stakes.recover()
http.listen(PORT, () => console.log(`Fallguy server listening on port ${PORT}`))
