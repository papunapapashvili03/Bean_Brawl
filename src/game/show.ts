import { COLOURS, NAMES } from './race/bots/roster'

// A party show: three rounds in a row, each on a different map, the field cut down round by round. 24 to 30
// start (you and the rest bots); the first 16 home in the first round go through, the first 10 home in the
// second; the final is a last-one-standing map with its own winner(s). The same bots carry on from round to
// round (the ones that got through), so the best of them tend to reach the final. Kept for the browser tab
// (sessionStorage): it carries from round to round, and survives a reload. Plain data, so the landing page
// can start one without loading the games.

export type ShowBot = { name: string; colour: string; level: number; quickness: number } // how good: 0..1
export type ShowRound = { map: string; quota: number | null } // how many go through (null: the final)
export type Show = { rounds: ShowRound[]; round: number; bots: ShowBot[] } // `round`: the one being played

// What each round can be: races first (the first round's need room for the whole field at the start), and
// a map made for the last round to finish
export const ROUND_POOLS: string[][] = [
  ['sky', 'gym', 'whirly'],
  ['tower', 'neon', 'sky', 'gym', 'whirly'],
  ['hex', 'ice', 'color', 'jump', 'panic', 'crumble', 'tilt'],
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

export function loadShow(): Show | null {
  if (current) return current
  try {
    const show = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Show | null
    if (!show || !Array.isArray(show.rounds) || show.rounds.length !== ROUND_POOLS.length || !Array.isArray(show.bots)) return null
    if (!(show.round >= 0 && show.round < show.rounds.length)) return null
    current = show
    return show
  } catch {
    return null
  }
}

// A new show: its three maps (no map twice), and its field
export function startShow(random = Math.random): Show {
  const maps: string[] = []
  for (const pool of ROUND_POOLS) {
    const left = pool.filter((m) => !maps.includes(m))
    maps.push(left[Math.floor(random() * left.length)])
  }
  const size = FIELD.min + Math.floor(random() * (FIELD.max - FIELD.min + 1))
  const names = [...NAMES].sort(() => random() - 0.5).slice(0, size - 1)
  const show: Show = {
    rounds: maps.map((map, i) => ({ map, quota: QUOTAS[i] })),
    round: 0,
    bots: names.map((name, i) => ({ name, colour: COLOURS[i % COLOURS.length], level: random(), quickness: random() })),
  }
  save(show)
  return show
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

// The bots for the round being played on this map: the show's, or null (no show on, or it's another map)
export function showBotsFor(map: string): ShowBot[] | null {
  if (!inShow()) return null
  const show = loadShow()
  return show && show.rounds[show.round].map === map ? show.bots : null
}
