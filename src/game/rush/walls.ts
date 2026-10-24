import { COUNTDOWN_SECONDS } from '../race/race'
import {
  APART_FIRST,
  APART_LATE,
  BACK,
  CELLS,
  END,
  RISE,
  ROUND,
  SPAWN_Z,
  SPEED_END,
  SPEED_START,
  SPEED_UP,
  WALL_DEPTH,
  WALL_HEIGHT,
} from './course'

// The round's walls: when each comes up, what it's made of, and where it is at any time on the match clock.
// They all slide at the same speed (quickening through the round), so they keep their distance. Worked out
// when the round starts (different every round), so the bots know what's coming too. A block that's been
// smashed or blasted is gone for good; a TNT block that's been touched has its fuse lit.

const RUN = COUNTDOWN_SECONDS

export type Kind = 'solid' | 'cracked' | 'spike' | 'tnt'
export type Block = { kind: Kind | null; alive: boolean; litAt: number } // kind null: a gap
export type Wall = { n: number; comesAt: number; s0: number; blocks: Block[] }
export const walls: Wall[] = []

// How fast the walls are sliding at time t, and how far they've slid in all by then
export const speedAt = (t: number) => SPEED_START + (SPEED_END - SPEED_START) * Math.min(1, Math.max(0, (t - RUN) / SPEED_UP))
export function slidAt(time: number) {
  const t = Math.min(time, round.at) // (once the round's over, they stop where they are)
  const u = Math.max(0, Math.min(t - RUN, SPEED_UP))
  const a = (SPEED_END - SPEED_START) / SPEED_UP
  return SPEED_START * u + 0.5 * a * u * u + Math.max(0, t - RUN - SPEED_UP) * SPEED_END
}

// Where a wall is (its middle) at time t: coming up out of the slot, then sliding; and once it's off the back
// of the stage, dropping into the slime
export function wallZ(w: Wall, t: number) {
  return SPAWN_Z + slidAt(t) - w.s0
}
export function wallY(w: Wall, time: number) {
  const t = Math.min(time, round.at)
  const up = Math.min(1, Math.max(0, (t - w.comesAt) / RISE))
  const off = Math.max(0, wallZ(w, t) - WALL_DEPTH / 2 - BACK)
  return -WALL_HEIGHT * (1 - up * up * (3 - 2 * up)) - off * off * 0.35
}
// Whether a wall's about: come up, and not yet sunk away
export const active = (w: Wall, t: number) => t >= w.comesAt - 0.05 && wallZ(w, t) < BACK + 9

// Whether a block lets you through: a gap, or a block that's gone
export const open = (b: Block) => b.kind === null || !b.alive

function seeded(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// What a wall coming up `late` of the way through the round (0..1) is made of: plenty of gaps at first; later
// fewer, and then often none (only cracked blocks to smash), with spikes beside the gaps, and more and more
// often TNT
function pattern(late: number, random: () => number): (Kind | null)[] {
  const cells: (Kind | null)[] = Array(CELLS).fill('solid')
  const free = () => {
    const left = cells.map((c, k) => (c === 'solid' ? k : -1)).filter((k) => k >= 0)
    return left[Math.floor(random() * left.length)]
  }
  // (The middle eight are likelier than the two by the lasers)
  const place = (kind: Kind | null) => {
    let k = free()
    if ((k === 0 || k === CELLS - 1) && random() < 0.6) k = free()
    if (k !== undefined) cells[k] = kind
    return k
  }
  const none = late >= 0.75 ? 0.85 : late >= 0.45 ? 0.5 : 0
  const gaps = late < 0.1 ? 3 : late < 0.3 ? 2 : random() < none ? 0 : late < 0.45 && random() < 0.3 ? 2 : 1
  // (With no gaps, a couple of cracked blocks to smash; at the very end, just the one)
  const cracked = gaps === 0 ? (late >= 0.85 ? 1 : 2) : 1 + Math.floor(late * 2.99)
  const holes: number[] = []
  for (let g = 0; g < gaps; g++) holes.push(place(null))
  for (let c = 0; c < cracked; c++) place('cracked')
  if (late >= 0.15) {
    // Spikes, right beside a gap if there is one
    const spikes = late < 0.45 ? 1 : late < 0.75 ? 2 : 3
    for (let s = 0; s < spikes; s++) {
      const by = holes[s % Math.max(1, holes.length)]
      const side = by !== undefined ? by + (random() < 0.5 ? -1 : 1) : -1
      if (side >= 0 && side < CELLS && cells[side] === 'solid') cells[side] = 'spike'
      else place('spike')
    }
  }
  if (late >= 0.25 && random() < (late >= 0.6 ? 0.7 : 0.45)) place('tnt')
  return cells
}

export function planWalls(seed = Math.floor(Math.random() * 1e9)) {
  const random = seeded(seed)
  walls.length = 0
  let s = 0
  let t = RUN - 2.5 // the first is coming up as the countdown ends
  for (let n = 0; t < END + 5; n++) {
    // When it's slid far enough behind the one before: found by stepping on till the walls have slid that far
    const late = Math.max(0, Math.min(1, (t - RUN) / ROUND))
    if (n > 0) {
      s += APART_FIRST + (APART_LATE - APART_FIRST) * late
      while (slidAt(t) < s) t += 0.02
    } else s = slidAt(t)
    walls.push({ n, comesAt: t, s0: s, blocks: pattern(Math.max(0, Math.min(1, (t - RUN) / ROUND)), random).map((kind) => ({ kind, alive: true, litAt: Infinity })) })
  }
}

// ---------------------------------------------------------------------------------------------------------
// The round: whether it's over, and who won

export const round = { over: false, at: Infinity, lastStanding: false, winner: null as string | null }

export function resetWalls() {
  round.over = false
  round.at = Infinity
  round.lastStanding = false
  round.winner = null
  planWalls()
}

export function endRound(lastStanding: boolean, winner: string | null, at: number) {
  round.over = true
  round.at = at
  round.lastStanding = lastStanding
  round.winner = winner
}
