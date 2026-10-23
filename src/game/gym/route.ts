import type { BotView, P3, Route } from '../race/bots/route'
import {
  BACK_DECK,
  BOUNCE_DECK,
  COLUMNS,
  FINISH_Z,
  HOLD_COLUMNS,
  MONKEY_LANDING,
  PADS,
  PLAYER_SLOT,
  RACKS,
  SPIN,
  START_SLOTS,
  STORM_EXIT,
  TIER_1,
  TIER_2,
  WALL,
  WALL_APPROACH,
  columnTop,
} from './course'

// The bots' way round the jungle gym (see ../race/bots): they jump for the first rung of a rack and swing
// across; hop the columns (heading for where each top is now: when to jump they work out from where it will
// be); jump at the wall and climb it hold by hold (or through a hole, if that's what they catch); run the
// storm; round the sweepers (over the low bar, rolling under the high one); and off the bounce pads up the
// tiers to the line. Each keeps to its own part of the width, as it started.

export const BOT_STARTS: P3[] = START_SLOTS.filter((_, i) => i !== PLAYER_SLOT).map(([x, z]) => [x, 1.3, z])
export const botLane = (start: P3) => start[0] / 9.9

const nearest = (xs: readonly number[], x: number) => xs.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best))

// Under a rack, clear of its rails
function rackX(bias: number) {
  const x = bias * 10
  const [x0, x1] = RACKS.reduce((best, r) => (Math.abs((r[0] + r[1]) / 2 - x) < Math.abs((best[0] + best[1]) / 2 - x) ? r : best))
  return Math.max(x0 + 0.9, Math.min(x1 - 0.9, x))
}

// The column of each row nearest a bot's part of the width
const ROWS = [...new Set(COLUMNS.map((c) => c.z))]
const columnFor = (row: number, bias: number) => {
  const x = bias * 9.6
  return COLUMNS.filter((c) => c.z === ROWS[row]).reduce((best, c) => (Math.abs(c.x - x) < Math.abs(best.x - x) ? c : best))
}
const columnsX = (bias: number) => columnFor(0, bias).x

// At the wall: under a column of holds
const holdX = (bias: number) => nearest(HOLD_COLUMNS, bias * 10.2)

// The pads in front of each tier
const PAD_ROWS = [...new Set(PADS.map((p) => p.z))].map((z) => PADS.filter((p) => p.z === z))
const padX = (row: number, bias: number) => nearest(PAD_ROWS[row].map((p) => p.x), bias * 9.8)

const tier1 = TIER_1.max[1]
const tier2 = TIER_2.max[1]

export const GYM_ROUTE: Route = [
  // 1. The bars: jump for the first rung from the edge, and swing across
  { at: (v: BotView): P3 => [rackX(v.bias), 0, 0.42], r: 0.45, leap: true, resume: 0 },
  { at: (v: BotView): P3 => [rackX(v.bias), 0, (MONKEY_LANDING.min[2] + MONKEY_LANDING.max[2]) / 2], r: 1.8 },
  // 2. The columns, row by row
  ...ROWS.map((z, row) => ({
    at: (v: BotView): P3 => {
      const c = columnFor(row, v.bias)
      return [c.x, columnTop(c, v.t), z]
    },
    r: 0.9,
    ...(row === 0 ? { resume: 1 } : {}),
  })),
  { at: (v: BotView): P3 => [columnsX(v.bias), 0, WALL_APPROACH.max[2] - 2.2], r: 1.6 },
  // 3. The wall: jump at it under a column of holds, and climb
  { at: (v: BotView): P3 => [holdX(v.bias), 0, WALL.front + 0.75], r: 0.45, leap: true, resume: 2 },
  { at: (v: BotView): P3 => [holdX(v.bias), 0, BACK_DECK.max[2] - 3.5], r: 2.2 },
  // 4. The storm
  { at: [0, 0, (STORM_EXIT.min[2] + STORM_EXIT.max[2]) / 2], spread: 8.5, resume: 3 },
  // 5. Round the hub, to one side or the other
  { at: (v: BotView): P3 => [Math.sign(v.bias || 1) * Math.max(3.6, Math.abs(v.bias) * 8.5), 0, SPIN.z], r: 1.6, resume: 4 },
  { at: [0, 0, BOUNCE_DECK.max[2] - 2], spread: 7 },
  // 6. Off a pad up each tier
  { at: (v: BotView): P3 => [padX(0, v.bias), 0.15, PAD_ROWS[0][0].z], r: 0.6, retry: true, resume: 5 },
  { at: (v: BotView): P3 => [padX(0, v.bias), tier1, TIER_1.max[2] - 3.4], r: 2.4 },
  { at: (v: BotView): P3 => [padX(1, v.bias), tier1 + 0.15, PAD_ROWS[1][0].z], r: 0.6, retry: true },
  { at: (v: BotView): P3 => [padX(1, v.bias), tier2, TIER_2.max[2] - 3.4], r: 2.4 },
  { at: (v: BotView): P3 => [padX(1, v.bias), tier2, FINISH_Z - 1.5], r: 1.4 },
  // Over the line: on to the back of the deck
  { at: (v: BotView): P3 => [v.bias * 10, tier2, FINISH_Z - 6.5], r: 1.4 },
]
