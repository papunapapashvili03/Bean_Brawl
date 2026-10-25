import { COLOURS, NAMES } from './race/bots/roster'
import { shuffle } from './roundSeed'

// A party show: three rounds in a row, each on a different map, the field cut down round by round. 24 to 30
// start (you and the rest bots); the first 16 home in the first round go through, the first 10 home in the
// second; the final is a last-one-standing map with its own winner(s). The same bots carry on from round to
// round (the ones that got through), so the best of them tend to reach the final. Kept for the browser tab
// (sessionStorage): it carries from round to round, and survives a reload. Plain data, so the landing page
// can start one without loading the games.
//
// Played online (./net/party), a show has its players too (`humans`, up to 10 of them, the field's rest bots):
// every one of their screens makes the same show from the show's seed, and the server says who goes through.

export type ShowBot = { name: string; colour: string; level: number; quickness: number } // how good: 0..1
export type ShowRound = { map: string; quota: number | null } // how many go through (null: the final)
export type ShowHuman = { id: number; name: string; colour: string } // a player, online (by its server id)
// `round`: the one being played; `id`: which show this is, for the results kept of it (see ./record);
// `humans`: online, the players still in it (by id), and `seed`, the server's for it
export type Show = { id: string; rounds: ShowRound[]; round: number; bots: ShowBot[]; humans?: ShowHuman[]; seed?: number }

// What each round can be: races first (the first round's need room for the whole field at the start), and
// a map made for the last round to finish
export const ROUND_POOLS: string[][] = [
  ['sky', 'gym', 'whirly', 'over'],
  ['tower', 'neon', 'sky', 'gym', 'whirly', 'over'],
  ['hex', 'ice', 'color', 'jump', 'panic', 'lava', 'rush', 'crumble', 'tilt'],
]
export const QUOTAS: (number | null)[] = [16, 10, null]
export const FIELD = { min: 24, max: 30 }

const KEY = 'fallguy.show'

function save(show: Show) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(show))
  } catch {
    // storage unavailable: the show only lasts as long as the page
  }
  current = show
}

let current: Show | null = null

// A random id (a v4 UUID, as the game_results table keeps them). crypto.randomUUID only works on https or
// localhost, and the games get tried from phones on the local network too.
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function loadShow(): Show | null {
  if (current) return current
  try {
    const show = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Show | null
    if (!show || !Array.isArray(show.rounds) || show.rounds.length !== ROUND_POOLS.length || !Array.isArray(show.bots)) return null
    if (!(show.round >= 0 && show.round < show.rounds.length)) return null
    if (typeof show.id !== 'string') save({ ...show, id: newId() }) // (one kept from before shows had ids)
    else current = show
    return current
  } catch {
    return null
  }
}

// A new show: its three maps (no map twice), and its field
export function startShow(random = Math.random): Show {
  const show = makeShow(random, 1)
  save(show)
  return show
}

// The show, from `random`, with `players` of the field not bots
function makeShow(random: () => number, players: number): Show {
  const maps: string[] = []
  for (const pool of ROUND_POOLS) {
    const left = pool.filter((m) => !maps.includes(m))
    maps.push(left[Math.floor(random() * left.length)])
  }
  const size = FIELD.min + Math.floor(random() * (FIELD.max - FIELD.min + 1))
  const names = shuffle(NAMES, random).slice(0, Math.max(0, size - players))
  return {
    id: newId(),
    rounds: maps.map((map, i) => ({ map, quota: QUOTAS[i] })),
    round: 0,
    bots: names.map((name, i) => ({ name, colour: COLOURS[i % COLOURS.length], level: random(), quickness: random() })),
  }
}

// An online show (the same on every player's screen: from the server's seed, and its players)
export function startOnlineShow(id: string, seed: number, humans: ShowHuman[], random: () => number): Show {
  const show: Show = { ...makeShow(random, humans.length), id, seed, humans }
  save(show)
  return show
}

// The first map an online show will have, from its seed, while its lobby fills (the maps come first, so it's
// the same however many players it ends up with)
export const firstMapOf = (random: () => number) => makeShow(random, 1).rounds[0].map

// Online: on to the next round with whoever the server says got through ('p:<id>' players, 'b:<name>' bots)
export function nextOnlineRound(show: Show, through: string[]): Show {
  const next: Show = {
    ...show,
    round: show.round + 1,
    bots: show.bots.filter((b) => through.includes(`b:${b.name}`)),
    humans: (show.humans ?? []).filter((h) => through.includes(`p:${h.id}`)),
  }
  save(next)
  return next
}

// On to the next round, with the bots that got through
export function nextRound(show: Show, through: string[]): Show {
  const next: Show = { ...show, round: show.round + 1, bots: show.bots.filter((b) => through.includes(b.name)) }
  save(next)
  return next
}

export function endShow() {
  current = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // (nothing kept, nothing to clear)
  }
}

// Whether this page is playing a show (the games app, opened from the party lobby)
export const inShow = () => new URLSearchParams(window.location.search).has('show')

// Where a show's played: online, with whoever else is looking for one (./net/party), or on your own with bots
export const ONLINE_SHOW_URL = '/games/?mode=party-games&show=1&online=1'
export const OFFLINE_SHOW_URL = '/games/?mode=party-games&show=1'

// The bots for the round being played on this map: the show's, or null (no show on, or it's another map)
export function showBotsFor(map: string): ShowBot[] | null {
  if (!inShow()) return null
  const show = loadShow()
  return show && show.rounds[show.round].map === map ? show.bots : null
}
