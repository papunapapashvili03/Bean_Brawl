import { BETWEEN, FIRST_WAVE, GONE, GRID, TILES, warnTime } from './course'
import { roundRandom, shuffle } from '../roundSeed'

// The strikes this round: every wave's, each a set of tiles that light up at `warnAt` and drop at `at` (for
// GONE: down, then coming back up). Waves are made one at a time, as the last one's finishing. Shared by the
// arena (which drops the tiles and draws them), the bots (which see what's lit up, and get out of the way)
// and the referee. Times are on the match clock.

export type Strike = { tiles: number[]; warnAt: number; at: number; applied: boolean }
export const strikes: Strike[] = []

export type Kind = 'lines' | 'checker' | 'rings' | 'quarters' | 'crosses' | 'sweep' | 'ripple' | 'scatter'
export const KIND_NAMES: Record<Kind, string> = {
  lines: 'Lines',
  checker: 'Checkerboard',
  rings: 'Rings',
  quarters: 'Quarters',
  crosses: 'Crosses',
  sweep: 'Sweep',
  ripple: 'Ripples',
  scatter: 'Scatter',
}

// The waves: how many so far, the latest (what it is, when it lit up and when it first strikes), and when
// the next lights up
export const waves = { n: 0, kind: null as Kind | null, litAt: 0, firstAt: 0, nextAt: FIRST_WAVE }

// How the round turned out: over (no more waves), and if so whether by being the last one standing, and who
export const round = { over: false, lastStanding: false, winner: null as string | null }

export function resetStrikes() {
  strikes.length = 0
  waves.n = 0
  waves.kind = null
  waves.litAt = 0
  waves.firstAt = 0
  waves.nextAt = FIRST_WAVE
  round.over = false
  round.lastStanding = false
  round.winner = null
}

// Makes the next wave once it's due; forgets strikes long gone
export function planWaves(t: number) {
  if (round.over) return
  while (t >= waves.nextAt) makeWave(waves.nextAt)
  while (strikes.length && strikes[0].at + GONE < t - 1) strikes.shift()
}

export function endRound(lastStanding: boolean, winner: string | null) {
  round.over = true
  round.lastStanding = lastStanding
  round.winner = winner
  // (Whatever's lit up and hasn't struck yet, doesn't)
  for (let k = strikes.length - 1; k >= 0; k--) if (!strikes[k].applied) strikes.splice(k, 1)
}

// ---------------------------------------------------------------------------------------------------------

// (Each wave's own numbers: see ../roundSeed)
let random = Math.random
const rand = (n: number) => Math.floor(random() * n)
const pick = <T>(from: T[]) => from[rand(from.length)]
const where = (test: (i: number, j: number) => boolean) => TILES.flatMap((t, k) => (test(t.i, t.j) ? [k] : []))
const shuffled = (n: number) => shuffle(Array.from({ length: n }, (_, k) => k), random)
// Between the two halves of a two-part wave: the first half's back up a moment before the second drops,
// long enough to get from one to the other (less long as it goes on)
const again = (n: number) => GONE + Math.max(0.85, 1.1 - 0.02 * n)

// What wave n can be: the simple ones first, the rest coming in as it goes on, and in the end mostly scatter
function kindFor(n: number, last: Kind | null): Kind {
  const pool: Kind[] =
    n < 2 ? ['lines', 'quarters', 'rings'] : n < 5 ? ['lines', 'quarters', 'rings', 'checker', 'crosses', 'sweep'] : ['lines', 'checker', 'rings', 'quarters', 'crosses', 'sweep', 'ripple', 'scatter']
  if (n >= 14) pool.push('scatter', 'scatter', 'crosses')
  const from = pool.filter((k) => k !== last)
  return pick(from)
}

// Each part of a wave: its tiles, how long after the wave lights up it lights up, and how much longer than
// the wave's warning it waits after that to strike. Every pattern's warning is enough to get clear of it
// from anywhere: most leave somewhere safe a tile away, and those that don't (quarters, where it can be six
// tiles to the nearest safe one; a sweep, with its gap anywhere along; a ripple, to be outrun) give longer,
// lighting up all at once and striking bit by bit.
type Part = { tiles: number[]; after: number; later?: number }

const QUARTER_LEAD = 1.6
const QUARTER_WARNING = 3.8
const SWEEP_LEAD = 2
const RIPPLE_LEAD = 0.6

function partsOf(kind: Kind, n: number): Part[] {
  const later = n >= 8
  switch (kind) {
    case 'lines': {
      const k = Math.min(5, 2 + Math.floor(n / 3))
      const rows = shuffled(GRID)
      const cols = shuffled(GRID)
      const lines = (from: number) => {
        const r = rows.slice(from, from + Math.ceil(k / 2))
        const c = cols.slice(from, from + Math.floor(k / 2))
        return where((i, j) => r.includes(j) || c.includes(i))
      }
      return later ? [{ tiles: lines(0), after: 0 }, { tiles: lines(k), after: again(n) }] : [{ tiles: lines(0), after: 0 }]
    }
    case 'checker': {
      const p = rand(2)
      const size = later ? 1 : 2 // (squares of four tiles at first, single tiles later)
      const half = (q: number) => where((i, j) => (Math.floor(i / size) + Math.floor(j / size)) % 2 === q)
      return [
        { tiles: half(p), after: 0 },
        { tiles: half(1 - p), after: again(n) },
      ]
    }
    case 'rings': {
      const p = rand(2)
      const of = (q: number) => TILES.flatMap((t, k) => (t.ring % 2 === q ? [k] : []))
      return later
        ? [
            { tiles: of(p), after: 0 },
            { tiles: of(1 - p), after: again(n) },
          ]
        : [{ tiles: of(p), after: 0 }]
    }
    case 'quarters': {
      const order = shuffled(4)
      const quarter = (q: number) => where((i, j) => (i < GRID / 2 ? 0 : 1) + (j < GRID / 2 ? 0 : 2) === q)
      // (Half the floor: from the far side of it, it's six tiles to anywhere safe, so it gives time for that)
      return [{ tiles: [...quarter(order[0]), ...quarter(order[1])], after: 0, later: Math.max(QUARTER_LEAD, QUARTER_WARNING - warnTime(n)) }]
    }
    case 'crosses': {
      const count = later ? 4 : 3
      return Array.from({ length: count }, (_, k) => {
        const ci = rand(GRID)
        const cj = rand(GRID)
        const diagonal = later && k % 2 === 1
        return { tiles: where((i, j) => i === ci || j === cj || (diagonal && Math.abs(i - ci) === Math.abs(j - cj))), after: k * 0.75 }
      })
    }
    case 'sweep': {
      // A line of strikes marching across the floor, with a gap in it (wide at first, and later narrower and
      // wandering as it goes): all lit up at once, so you can see where the gap will be
      const across = rand(2) === 0
      const backwards = rand(2) === 0
      const step = Math.max(0.3, 0.5 - 0.012 * n)
      const width = n < 6 ? 4 : n < 10 ? 3 : 2
      const wanders = n >= 8
      // (Starting near the middle, so nobody's too far from it)
      let gap = Math.floor((GRID - width) / 2) + rand(3) - 1
      return Array.from({ length: GRID }, (_, k) => {
        const line = backwards ? GRID - 1 - k : k
        if (k && wanders) gap = Math.max(0, Math.min(GRID - width, gap + rand(3) - 1))
        const g = gap
        const along = (i: number, j: number) => (across ? i : j)
        return { tiles: where((i, j) => (across ? j : i) === line && (along(i, j) < g || along(i, j) >= g + width)), after: 0, later: SWEEP_LEAD + k * step }
      })
    }
    case 'ripple': {
      // Rings spreading out from a tile, out to three away: all lit up at once, struck from the middle out, a
      // little slower than you can run
      const ci = 2 + rand(GRID - 4)
      const cj = 2 + rand(GRID - 4)
      return Array.from({ length: 4 }, (_, d) => ({ tiles: where((i, j) => Math.max(Math.abs(i - ci), Math.abs(j - cj)) === d), after: 0, later: RIPPLE_LEAD + d * 0.4 }))
    }
    case 'scatter': {
      const share = Math.min(0.6, 0.3 + 0.02 * n)
      return [{ tiles: TILES.flatMap((_, k) => (random() < share ? [k] : [])), after: 0 }]
    }
  }
}

function makeWave(start: number) {
  const n = waves.n++
  random = roundRandom('panic', n)
  const kind = kindFor(n, waves.kind)
  const warn = warnTime(n)
  let last = start
  let firstAt = Infinity
  for (const part of partsOf(kind, n)) {
    if (!part.tiles.length) continue
    const warnAt = start + part.after
    const at = warnAt + warn + (part.later ?? 0)
    strikes.push({ tiles: part.tiles, warnAt, at, applied: false })
    last = Math.max(last, at)
    firstAt = Math.min(firstAt, at)
  }
  strikes.sort((a, b) => a.at - b.at)
  waves.kind = kind
  waves.litAt = start
  waves.firstAt = firstAt === Infinity ? start + warn : firstAt
  waves.nextAt = last + BETWEEN
}
