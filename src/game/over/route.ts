import type { BotView, P3, Route, Waypoint } from '../race/bots/route'
import { FINISH_Z, GATES, GATE_DECK, HURDLES, PLANK, PLANK_X, PLAYER_SLOT, ROW_WIDTHS, SEESAWS, START_SLOTS, WALL, WAVE, WAVE_DECK } from './course'
import { openFor } from './wallTimes'

// The bots' way down Over & Under (see ../race/bots): straight down the track, jumping the hurdles and
// rolling under the gates as their pilots see fit; across the seesaws plank by plank (each keeps to the line
// of planks on its own side, near end to far end, and jumps the gap to the next row); down the tidal wave
// deck, timing the beams; and through the wall, only when it's down with time enough to get across. Each
// keeps to its own part of the width, as it started.

export const BOT_STARTS: P3[] = START_SLOTS.filter((_, i) => i !== PLAYER_SLOT).map(([x, z]) => [x, 1.3, z])
export const botLane = (start: P3) => start[0] / 5.85

const lane = (v: BotView, half = 5) => v.bias * half
// The line of planks on its side: the nearest of the three to its lane
const plankX = (bias: number) => PLANK_X.reduce((best, x) => (Math.abs(x - bias * 4.6) < Math.abs(best - bias * 4.6) ? x : best))
// Keeping to the middle of a narrow plank
const onPlank = (bias: number, row: number) => {
  const x = plankX(bias)
  const width = ROW_WIDTHS[row][PLANK_X.indexOf(x)]
  return x + bias * Math.max(0, width / 2 - 0.7) * 0.3
}

const SEESAW_WAY: Waypoint[] = [0, 1, 2].flatMap((row): Waypoint[] => {
  const z = SEESAWS[row * 3].z
  return [
    { at: (v: BotView): P3 => [onPlank(v.bias, row), 0, z + PLANK.length / 2 - 1.1], r: 1, tight: true, drop: 3 },
    { at: (v: BotView): P3 => [onPlank(v.bias, row), 0, z - PLANK.length / 2 + 1.1], r: 1, tight: true, drop: 3 },
  ]
})

// Through the wall only while it's down, with long enough left to get across
const shut = (v: BotView) => openFor(v.t) < 1.4

export const OVER_ROUTE: Route = [
  // 1. The hurdles
  { at: (v: BotView): P3 => [lane(v), 0, -1], r: 1.6 },
  ...HURDLES.map((h): Waypoint => ({ at: (v: BotView): P3 => [lane(v), 0, h.z - h.reach - 1.5], r: 1.6, through: true })),
  // 2. The gates
  { at: (v: BotView): P3 => [lane(v), 0, GATE_DECK.max[2] - 2], r: 1.6, resume: 1 },
  // (Under a gate's a squeeze: no berth to spare for it)
  ...GATES.map((g): Waypoint => ({ at: (v: BotView): P3 => [lane(v), 0, g.z - 1.6], r: 1.4, through: true, tight: true })),
  { at: (v: BotView): P3 => [plankX(v.bias), 0, GATE_DECK.min[2] + 1], r: 1.2, resume: 2 },
  // 3. The seesaws
  ...SEESAW_WAY,
  // 4. The tidal wave
  { at: (v: BotView): P3 => [lane(v), 0, WAVE_DECK.max[2] - 1.5], r: 1.4, resume: 3 },
  { at: (v: BotView): P3 => [lane(v), 0, (WAVE.near + WAVE.far) / 2], r: 1.6, through: true },
  { at: (v: BotView): P3 => [lane(v), 0, WAVE.far - 2], r: 1.6 },
  // 5. The wall: wait for it to go down, then through
  { at: (v: BotView): P3 => [lane(v), 0, WALL.z + 2.2], r: 1.4, wait: shut, resume: 4 },
  { at: (v: BotView): P3 => [lane(v), 0, WALL.z - 2.5], r: 1.6 },
  // Over the line, and on to the back of the deck
  { at: (v: BotView): P3 => [lane(v, 6), 0, FINISH_Z - 1.5], r: 1.4 },
  { at: (v: BotView): P3 => [lane(v, 6), 0, FINISH_Z - 8], r: 1.4 },
]
