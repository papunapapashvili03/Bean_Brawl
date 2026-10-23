import type { BotView, P3, Route } from '../race/bots/route'
import {
  BALLOONS,
  CLOUDS,
  FINISH_DECK,
  FINISH_Z,
  GRID,
  LADDER,
  LANDING,
  PAD1,
  PAD2,
  TOP_DECK,
  basketY,
  cloudX,
  gridPitch,
  roadPoint,
  tileX,
} from './course'

// The bots' way round the neon circuit (see ../race/bots): down the highway, over the blackout grid (a tile
// at a time, each kept to its own column), up the ladder, across the balloons' baskets and the clouds (they
// head for where those are now; when to jump, they work out from where each will be), and over the line.

// Twenty start spots on the pad, four rows of five (the player has the middle of the third row)
export const BOT_STARTS: P3[] = [0.2, 2.6, 5, 7.4].flatMap((z) => [-4.4, -2.2, 0, 2.2, 4.4].filter((x) => !(x === 0 && z === 5)).map((x): P3 => [x, 1.3, z]))
export const botLane = (start: P3) => start[0] / 4.4

// Over the grid: a few metres on down the column it's in (tiles go dark under you: there's no cutting across
// at a run), and off onto the pad at the far end
const GRID_FAR = (PAD2.z0 + PAD2.z1) / 2
function overGrid(v: BotView): P3 {
  const z = Math.min(v.z, GRID.z0) - 4
  if (z <= PAD2.z0 + 1) return [v.bias * 4, 0, GRID_FAR]
  const col = Math.max(0, Math.min(GRID.cols - 1, Math.round(v.x / gridPitch + (GRID.cols - 1) / 2)))
  return [tileX(col), 0, z]
}

// Up the ladder they keep right out at one edge or the other: the orbs bounce down three lanes, and out there
// is the one line none of them reaches
const RAIL = LADDER.width / 2 - 0.1

const deck = TOP_DECK.max[1]
const landing = LANDING.max[1]
const finish = FINISH_DECK.max[1]

export const NEON_ROUTE: Route = [
  ...[6, 12, 18, 24, 30, 36, 42].map((u, i) => ({ at: roadPoint(u), spread: 2.2, ...(i === 0 ? { resume: 0 } : {}) })),
  { at: [0, 0, (PAD1.z0 + PAD1.z1) / 2] as P3, spread: 3 },
  { at: overGrid, r: 1.2, resume: 1 },
  { at: (v: BotView): P3 => [Math.sign(v.bias || 1) * RAIL, LADDER.from[1], LADDER.from[2] - 0.6], r: 0.7, resume: 2 },
  { at: (v: BotView): P3 => [Math.sign(v.bias || 1) * RAIL, LADDER.to[1], LADDER.to[2] + 0.4], r: 0.9, tight: true },
  { at: [0, deck, LADDER.to[2] - 2.6], spread: 2 },
  ...BALLOONS.map((b, i) => ({ at: (v: BotView): P3 => [b.x, basketY(b, v.t), b.z], r: 0.9, ...(i === 0 ? { resume: 3 } : {}) })),
  { at: [0, landing, (LANDING.min[2] + LANDING.max[2]) / 2], r: 1.4 },
  ...CLOUDS.map((c, i) => ({ at: (v: BotView): P3 => [cloudX(c, v.t), c.top, c.z], r: 0.9, ...(i === 0 ? { resume: 4 } : {}) })),
  { at: [0, finish, FINISH_DECK.max[2] - 2.2], r: 1.6 },
  { at: [0, finish, FINISH_Z - 1.4], spread: 3.5 },
  // Over the line: on to the far end of the deck
  { at: [0, finish, FINISH_DECK.min[2] + 2.5], spread: 5, r: 1.2 },
]
