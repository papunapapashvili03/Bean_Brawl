import type { BotView, P3, Route, Waypoint } from '../race/bots/route'
import {
  CLIMB,
  DISC,
  DISCS,
  FAN_DECK,
  FINISH_Z,
  HOLD_COLUMNS,
  HOPS,
  ISLANDS,
  PLANKS,
  PLAYER_SLOT,
  ROTOR,
  ROTOR_ENTRY,
  ROTOR_EXIT,
  START_SLOTS,
  STAIRS_TOP,
  TOP_1,
  TOP_2,
  TOP_3,
  TOP_4,
  WALL_TOP,
  WHIRLYGIGS,
  WINDMILL_WALL,
  gustAt,
  nextGustIn,
  stairsY,
} from './course'

// The bots' way round Spin Cycle (see ../race/bots): over the bridge; across the discs (wide of each hub,
// by way of the bits of base between them), jumping the arms as they come round; up the climbing wall hold
// by hold (or, the ones that started in the middle, up the ramp); through the fans, timing the blades; over
// the blower bridge plank by plank, waiting for a lull before each; on to the rotor, in to its hub and out
// along another arm; up the windmill wall; up the stairs round the whirlygigs; and across the little discs
// to the line. Each keeps to its own part of the width, as it started.

export const BOT_STARTS: P3[] = START_SLOTS.filter((_, i) => i !== PLAYER_SLOT).map(([x, z]) => [x, 1.3, z])
export const botLane = (start: P3) => start[0] / 9.9

const side = (bias: number) => (bias < 0 ? -1 : 1)
const nearest = (xs: readonly number[], x: number) => xs.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best))

// --- 1. The discs ---
type Disc = (typeof DISCS)[number]
// Across a disc in the middle: to one side of its hub, further out the further out the bot keeps
const acrossDisc = (bias: number, d: Disc): P3 => [d.x + side(bias) * (2.2 + Math.abs(bias) * 2), DISC.top, d.z]
// A side disc (the one on the bot's side, of a pair): on its inner half, or (out wide) its outer
const sideDisc = (bias: number, d: Disc): P3 => [d.x + side(bias) * (Math.abs(bias) > 0.5 ? 2.5 : -2.5), DISC.top, d.z]
// The bit of the base between two discs (halfway between their middles: they're the same size)
const between = (a: Disc, b: Disc): P3 => [(a.x + b.x) / 2, 0, (a.z + b.z) / 2]
// Of a pair of side discs (the left one at `left`), the one on the bot's side
const pair = (bias: number, left: number) => DISCS[bias < 0 ? left : left + 1]

const DISC_WAY: Waypoint[] = [
  { at: (v: BotView) => acrossDisc(v.bias, DISCS[0]), r: 1.8, through: true },
  { at: (v: BotView) => between(DISCS[0], pair(v.bias, 1)), r: 1.2 },
  { at: (v: BotView) => sideDisc(v.bias, pair(v.bias, 1)), r: 1.8, through: true },
  { at: (v: BotView) => between(pair(v.bias, 1), DISCS[3]), r: 1.2 },
  { at: (v: BotView) => acrossDisc(v.bias, DISCS[3]), r: 1.8, through: true },
  { at: (v: BotView) => between(DISCS[3], pair(v.bias, 4)), r: 1.2 },
  { at: (v: BotView) => sideDisc(v.bias, pair(v.bias, 4)), r: 1.8, through: true },
  { at: (v: BotView) => between(pair(v.bias, 4), DISCS[6]), r: 1.2 },
  { at: (v: BotView) => acrossDisc(v.bias, DISCS[6]), r: 1.8, through: true },
]

// --- 2. The climb: the middle few take the ramp; the rest climb, under the column of holds nearest them ---
const RAMP_SHARE = 0.4
const climbs = (bias: number) => Math.abs(bias) > RAMP_SHARE
const holdX = (bias: number) => nearest(HOLD_COLUMNS, side(bias) * (3.7 + ((Math.abs(bias) - RAMP_SHARE) / (1 - RAMP_SHARE)) * 7.8))
const rampX = (bias: number) => (bias / RAMP_SHARE) * 1.6

// --- 3. Between the bumpers on the fan deck ---
const FAN_LANES = [-9.6, -3.25, 3.25, 9.6]
const fanLane = (bias: number) => nearest(FAN_LANES, bias * 9.6)

// --- 4. The blower bridge: on to each plank only in a lull long enough to get across it ---
const CROSSING = 1.8 // seconds from a plank's near end to its far end, give or take
const lull = (v: BotView) => gustAt(v.t) !== 0 || nextGustIn(v.t) < CROSSING
const PLANK_WAY: Waypoint[] = PLANKS.flatMap((p, i): Waypoint[] => [
  { at: [0, TOP_1, p.z0 + 0.8], r: 1, wait: lull, tight: true, ...(i === 0 ? { resume: 3 } : {}) },
  { at: [0, TOP_1, p.z1 + 0.3], r: 1, tight: true },
  ...(i < ISLANDS.length ? [{ at: (v: BotView): P3 => [v.bias * 1.6, TOP_1, ISLANDS[i]], r: 1.4 }] : []),
])

// --- 5. The rotor: on to an arm, in to the hub (to one side of the pole), and out the far side ---
const ROTOR_WAY: Waypoint[] = [
  { at: (v: BotView): P3 => [v.bias * 3, TOP_1, ROTOR_ENTRY.front + 1.6], r: 1.4, resume: 4 },
  { at: (v: BotView): P3 => [ROTOR.x + side(v.bias) * 1.8, TOP_1, ROTOR.z], r: 0.9 },
  { at: (v: BotView): P3 => [v.bias * 3, TOP_1, ROTOR_EXIT.front - 1.6], r: 1.6 },
]

// --- 6. The windmill wall: under a column of holds ---
const wallX = (bias: number) => nearest(WINDMILL_WALL.columns, bias * 10.5)

// --- 7. The stairs: past each whirlygig on its far side, timing it where the way goes under ---
const STAIR_WAY: Waypoint[] = [
  { at: (v: BotView): P3 => [-side(WHIRLYGIGS[0].x) * 3.5 + v.bias * 2.5, stairsY(-199), -199], r: 1.8, resume: 6 },
  ...WHIRLYGIGS.map((w): Waypoint => ({ at: (v: BotView): P3 => [-side(w.x) * 4.6 + v.bias * 1.8, stairsY(w.z), w.z], r: 1.6, through: true })),
  { at: (v: BotView): P3 => [v.bias * 5, stairsY(STAIRS_TOP.max[2] + 1), STAIRS_TOP.max[2] + 1], r: 1.8 },
]

export const WHIRLY_ROUTE: Route = [
  // 1. Over the bridge, and across the discs
  { at: (v: BotView): P3 => [v.bias * 3.5, 0, -0.6], r: 1.6 },
  { at: (v: BotView): P3 => [v.bias * 3, 0, -7], r: 1.6 },
  ...DISC_WAY,
  { at: (v: BotView): P3 => [v.bias * 6, 0, -65.5], r: 1.6 },
  // 2. The climb: jump for the first hold from the foot of the wall (or hop on up the ramp), and on up
  {
    at: (v: BotView): P3 => (climbs(v.bias) ? [holdX(v.bias), 0, CLIMB.face + 0.75] : [rampX(v.bias), 2.2, CLIMB.face + 4]),
    r: 0.45,
    leap: true,
    resume: 1,
  },
  { at: (v: BotView): P3 => [climbs(v.bias) ? holdX(v.bias) : rampX(v.bias), TOP_1, FAN_DECK.max[2] - 3], r: 2, resume: 2 },
  // 3. The fan deck: between the bumpers, under each row of fans, on to its far end
  { at: (v: BotView): P3 => [fanLane(v.bias), TOP_1, -80.5], r: 1.6 },
  { at: (v: BotView): P3 => [fanLane(v.bias), TOP_1, -88.5], r: 1.6, through: true },
  { at: (v: BotView): P3 => [fanLane(v.bias), TOP_1, -95], r: 1.6 },
  { at: (v: BotView): P3 => [fanLane(v.bias), TOP_1, -99.5], r: 1.6 },
  { at: (v: BotView): P3 => [fanLane(v.bias), TOP_1, -106.5], r: 1.6, through: true },
  { at: (v: BotView): P3 => [v.bias * 3, TOP_1, -113], r: 1.6 },
  // 4. The blower bridge
  ...PLANK_WAY,
  // 5. The rotor
  ...ROTOR_WAY,
  // 6. The windmill wall: jump for the first hold from its foot, and climb
  { at: (v: BotView): P3 => [wallX(v.bias), TOP_1, WINDMILL_WALL.face + 0.75], r: 0.45, leap: true, resume: 5 },
  { at: (v: BotView): P3 => [wallX(v.bias), TOP_2, WALL_TOP.max[2] - 3.5], r: 2.2 },
  // 7. The stairs
  ...STAIR_WAY,
  // 8. The little discs, one after another, and over the line
  { at: (v: BotView): P3 => [v.bias * 1.5, TOP_3, STAIRS_TOP.min[2] + 1.2], r: 1.2, resume: 7 },
  ...HOPS.map((h): Waypoint => ({ at: [h.x, h.top, h.z], r: 1 })),
  { at: (v: BotView): P3 => [v.bias * 9, TOP_4, FINISH_Z - 1.5], r: 1.4 },
  // Over the line: on to the back of the deck
  { at: (v: BotView): P3 => [v.bias * 10, TOP_4, FINISH_Z - 7], r: 1.4 },
]
