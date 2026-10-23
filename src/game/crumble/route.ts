import type { BotView, P3, Route, Waypoint } from '../race/bots/route'
import { CROWN, CROWN_STAIRS, FLOOR_Y, GUSTS, PENDULUMS, PILLARS, PLAYER_SLOT, RING, RING_KINDS, SPAWNS, STAIRS, STAIRS_X, TERRACE, around, helixPoint, ringY } from './course'
import { arenaHalf, nextGustIn, stageAt, survival } from './survival'

// The bots' way up the crumbling tower (see ../race/bots): round the courtyard on their own side of the tower
// (jumping the sweeper as it comes round), up to the gate terrace (on the left up the broken staircase,
// hopping onto it from the side and over its gaps; on the right up the broken pillars), in at the gate and up
// the spiral ramp (timing the pendulums), out round the ring (keeping inside the spinning bars' posts, and
// holding back before each spinner-and-bridge until a gust has blown over), up the crown stairs and onto the
// crown: and there, somewhere of its own to stand, just inside what'll still be standing a few seconds from
// now and out from under the rocks, jumping the beam as it comes round.

export const BOT_STARTS: P3[] = SPAWNS.filter((_, i) => i !== PLAYER_SLOT)
export const botLane = (start: P3) => start[0] / 8.2

const side = (v: BotView) => (v.bias >= 0 ? 1 : -1)
// A point on the bot's side of the tower (given for the +x side)
const mine = (x: number, y: number, z: number) => (v: BotView): P3 => [side(v) * x, y, z]

// 1. Round the courtyard, past the sweeper on that side, and up beside the staircase: along the narrow way
// between it and the statue there, to the foot of the stairs. (One that's ended up under the staircase,
// down a gap in it, gets out from under it first, straight out to the side.)
const BESIDE_STAIRS = STAIRS_X + STAIRS.width / 2 + 0.65
function footOfStairs(v: BotView): P3 {
  const under = v.y - 1 < 0.6 && Math.abs(v.x) > STAIRS_X - STAIRS.width / 2 - 0.4 && Math.abs(v.x) < BESIDE_STAIRS - 0.25
  if (under && v.z > STAIRS.topZ && v.z < 16.4) return [side(v) * (BESIDE_STAIRS + 0.4), 0, v.z]
  return [side(v) * (BESIDE_STAIRS + 0.05), 0, 17]
}
const COURTYARD: Waypoint[] = [
  { at: mine(7.4, 0, -6.6), spread: 1, resume: 0 },
  { at: mine(7.8, 0, 5.6), spread: 1.2, r: 1.6 },
  { at: mine(9, 0, 9), r: 1.2 },
  { at: mine(BESIDE_STAIRS, 0, 13), r: 0.6, tight: true },
  { at: footOfStairs, r: 0.6, tight: true },
]

// 2. Up to the gate terrace, and in at the gate. On the left, up the staircase: on from the side at the
// bottom, then over its two gaps. On the right the stone hammer swings across the staircase's whole middle
// flight, so they go up the other way: across the foot of the stairs, down into the yard between the two
// staircases, and up the broken pillars.
const STEP_RISE = 0.25
const STEPS = Math.round(4 / STEP_RISE)
const RUN = (STAIRS.bottomZ - STAIRS.topZ) / STEPS
const treadZ = (k: number) => STAIRS.bottomZ - (k + 0.5) * RUN // the middle of step k
const tread = (k: number) => (k + 1) * STEP_RISE
const stair = (k: number, x = -STAIRS_X): P3 => [x, tread(k), treadZ(k)]
const pillar = (n: number): P3 => [0, PILLARS[n].top, PILLARS[n].z]
const TERRACE_LEFT: P3 = [-4.6, FLOOR_Y, 8]
// Where a point is for a bot on the left, and for one on the right
const twoWays = (left: P3, right: P3) => (v: BotView): P3 => (side(v) < 0 ? left : right)
const STAIRS_UP: Waypoint[] = [
  { at: twoWays(stair(3), stair(1, STAIRS_X)), r: 0.6, drop: 0.6 },
  { at: twoWays(stair(7), [3.4, 0, 17]), r: 0.6, drop: 0.6, back: true },
  { at: twoWays(stair(9), pillar(0)), r: 0.6, drop: 1, back: true },
  { at: twoWays(stair(13), pillar(1)), r: 0.6, drop: 0.6, back: true },
  { at: twoWays(TERRACE_LEFT, pillar(2)), r: 0.6, drop: 0.6, back: true },
  { at: twoWays(TERRACE_LEFT, [0, FLOOR_Y, TERRACE.r1 - 1.2]), r: 0.8, drop: 0.6, back: true },
  { at: mine(1.4, 4, 7.6), r: 1 },
  { at: mine(0.4, 4, 5.4), r: 0.9 },
]

// 3. Up the spiral ramp, keeping to its own lane: a point every few metres, but none where a pendulum swings
// (nowhere to stand): instead one either side of it, to wait at for a gap and to make for through it
const CLEAR_OF_PENDULUM = 0.035 // of the way up (about 2.8 m)
const RAMP_AT = [
  ...Array.from({ length: 24 }, (_, i) => (i + 1) / 24).filter((s) => PENDULUMS.every((p) => Math.abs(s - p) >= CLEAR_OF_PENDULUM)),
  ...PENDULUMS.flatMap((p) => [p - CLEAR_OF_PENDULUM, p + CLEAR_OF_PENDULUM]),
].sort((a, b) => a - b)
const RAMP: Waypoint[] = RAMP_AT.map((s, i) => ({ at: helixPoint(s), spread: 0.7, back: true, ...(i === 0 ? { resume: 1 } : {}) }))

// 4. Round the ring: past the spinners on the inside of their posts (through, not stopping: there's nowhere
// in a spinner's reach to stand), along the middle of the bridges. Each bridge comes straight after a
// spinner; the gusts come every few seconds, and a bridge in a gust is no place to be: so it holds back
// before the spinner while a gust's due before it would be over the bridge (or one's still blowing).
const SEG = (Math.PI * 2) / RING.segments
const gustDue = (v: BotView) => {
  const next = nextGustIn(v.t)
  return next < 2 || next > GUSTS.every - GUSTS.last + 0.9
}
const onRing = (phi: number, r: number, s: number): P3 => around(phi, r, ringY(s))
// (A plain stretch, or a tilting slab: anywhere across the middle of it will do, it's somewhere to pass)
const across = (i: number): Waypoint => ({
  at: onRing((i + 0.5) * SEG, RING_KINDS[i] === 'tilt' ? 8.3 : 8.4, (i + 0.5) / RING.segments),
  r: 1.8,
  spread: 0.5,
})
const RING_WAY: Waypoint[] = []
RING_KINDS.forEach((kind, i) => {
  if (RING_KINDS[i + 1] === 'spinner' && RING_KINDS[i + 2] === 'bridge') {
    RING_WAY.push(across(i))
    RING_WAY.push({ at: onRing((i + 1) * SEG - 0.12, 8.6, (i + 1) / RING.segments), r: 1.1, spread: 0.9, wait: gustDue })
  } else if (kind === 'spinner') RING_WAY.push({ at: onRing((i + 0.5) * SEG, 7.75, (i + 0.5) / RING.segments), r: 1, through: true })
  else if (kind === 'bridge') {
    // (On to the bridge clear of the spinner's reach, to stop there if it has to)
    RING_WAY.push({ at: onRing(i * SEG + 0.12, RING.r, i / RING.segments), r: 0.7, tight: true })
    RING_WAY.push({ at: onRing((i + 1) * SEG - 0.06, RING.r, (i + 1) / RING.segments), r: 0.8, tight: true })
  } else RING_WAY.push(across(i))
})

// 5. Up the crown stairs: the flight out from the ring's end, across the landing, and back up one of the two
// flights to the crown (most take the right one; the left is broken, with a gap to jump)
const { up: UP, back: BACK } = CROWN_STAIRS
const right = (v: BotView) => (v.bias > -0.35 ? 1 : -1)
const BACK_RUN = (BACK[0].from[2] - BACK[0].to[2]) / STEPS
const backZ = (k: number) => BACK[0].from[2] - (k + 0.5) * BACK_RUN
const backY = (k: number) => BACK[0].from[1] + tread(k)
const CROWN_STAIRS_UP: Waypoint[] = [
  { at: [0.3, UP.from[1], 9.4], r: 1 },
  { at: [0, UP.to[1], 19.2], r: 1 },
  { at: (v: BotView): P3 => [right(v) * 3.5, UP.to[1], 20.1], r: 0.8 },
  // (On the left, over the gap)
  { at: (v: BotView): P3 => (right(v) > 0 ? [3.5, backY(10), backZ(10)] : [-3.5, backY(6), backZ(6)]), r: 0.9 },
  { at: (v: BotView): P3 => (right(v) > 0 ? [3.5, backY(12), backZ(12)] : [-3.5, backY(9), backZ(9)]), r: 0.9 },
  { at: (v: BotView): P3 => [right(v) * 3.5, CROWN.top, 10.8], r: 1.2 },
]

// 6. On the crown: a spot of its own (its own way round from the middle) out towards the edge of what'll
// still be standing three seconds from now (the further out, the faster the beam comes by, and the less
// time it takes to jump), and out from under any rock about to land: if a rock's coming down on its spot,
// the next spot round that isn't under one
const SAFE_FROM_ROCKS = 2.9
const ROUND = [0, 0.7, -0.7, 1.4, -1.4, 2.4, -2.4, Math.PI]
function refuge(v: BotView): P3 {
  const edge = arenaHalf(stageAt(v.t + 3)) - 1.1
  const spot: P3 = [0, CROWN.top, 0]
  for (const turn of ROUND) {
    const a = v.bias * 9 + turn
    // (On the square that far in: scaled out until it meets it)
    const k = edge / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)))
    spot[0] = k * Math.sin(a)
    spot[2] = k * Math.cos(a)
    if (survival.drops.every((d) => d.done || d.land > v.t + 2.4 || Math.hypot(spot[0] - d.x, spot[2] - d.z) >= SAFE_FROM_ROCKS)) break
  }
  return spot
}

export const CRUMBLE_ROUTE: Route = [
  ...COURTYARD,
  ...STAIRS_UP,
  ...RAMP,
  ...RING_WAY,
  ...CROWN_STAIRS_UP,
  { at: refuge, hold: true, resume: 3 },
]
