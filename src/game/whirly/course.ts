import { COUNTDOWN_SECONDS, type RaceCourse, type Zone } from '../race/race'

// The Whirlygig layout. Units are metres; runners head towards -z, high in a pastel sky over the clouds:
//  1. Spinning Discs: over a narrow bridge and across seven turning discs, each with an arm sweeping round
//     its hub to jump (faster towards the end)
//  2. The Climb: up the ramp, or the climbing walls either side of it, to the fan deck
//  3. Fan Deck: two rows of giant fans turning upright across the way, the second quicker
//  4. Blower Bridge: three narrow planks with islands between, and gusts blowing across them from one side
//     and then the other
//  5. Rotor Ride: a giant four-armed walkway turning round a red pole: on to an arm as it sweeps past, in to
//     the hub, and out the other side
//  6. Windmill Wall: a tall climbing wall with windmills turning in front of its holds
//  7. Whirlygig Stairs: up a stairway under three whirlygigs, off to one side and then the other
//  8. Rotor Hop: across six little spinning discs, smaller and quicker one after another, up to the line
// The sweeping things get quicker as the course goes on.

type Point = [number, number, number]
export type Box = { min: Point; max: Point }

const RUN = COUNTDOWN_SECONDS
export const WIDTH = 24
export const HALF = WIDTH / 2
export const FALL_Y = -8 // under every deck: falling this far sends you back to your checkpoint
const DECK_BASE = -3 // decks are solid blocks from here up to their top (or from a little way below it, high up)

export const COLORS = {
  floor: '#4fc3ff',
  floorDark: '#2f8fe0',
  side: '#8a5cf6',
  trim: '#ffd23f',
  pink: '#ff3d9a',
  pinkLight: '#ff8cc6',
  red: '#ff4d5e',
  lane: '#ffffff',
}

const deck = (z0: number, z1: number, top = 0, half = HALF, base = DECK_BASE): Box => ({ min: [-half, base, z1], max: [half, top, z0] })

// The heights the course climbs to: the start, the fan deck (and on to the windmill wall), the top of the
// wall, the top of the stairs (and the finish, TOP_4, a little higher)
export const TOP_1 = 4.8
export const TOP_2 = 10.8
export const TOP_3 = 16.8

// Start: 30 grid slots behind the line, 3 rows of 10
export const START_DECK = deck(14, 0)
export const START_SLOTS: [number, number][] = Array.from({ length: 30 }, (_, i) => [-9.9 + (i % 10) * 2.2, 3 + Math.floor(i / 10) * 2.6])
export const PLAYER_SLOT = 4
export const SPAWN: Point = [START_SLOTS[PLAYER_SLOT][0], 1.3, START_SLOTS[PLAYER_SLOT][1]]

// ---------------------------------------------------------------------------------------------------------
// 1. Spinning Discs: a narrow bridge, then seven big discs zigzagging over a purple base (one in the middle,
// two to the sides, one in the middle...), turning alternate ways, each with an arm sweeping round its hub
// just off the disc, faster and the other way (and faster still towards the end). Two metres of base lie
// between each disc and the next; foam bumpers sit between each pair of side ones.
export const BRIDGE = deck(0, -8, 0, 5)
export const DISC_BASE = deck(-8, -64, 0, 15)
export const DISC = { radius: 5.5, top: 0.06, thickness: 0.3, hub: 0.7 } // (all but flush with the base)
export const DISCS = [
  { x: 0, z: -15, spin: 0.35, arm: -1.1, offset: 0.4 },
  { x: -7.8, z: -25.5, spin: -0.4, arm: 1, offset: 2.1 },
  { x: 7.8, z: -25.5, spin: 0.4, arm: -1, offset: 4.2 },
  { x: 0, z: -36, spin: -0.35, arm: 1.2, offset: 1.3 },
  { x: -7.8, z: -46.5, spin: 0.45, arm: -1.35, offset: 3.3 },
  { x: 7.8, z: -46.5, spin: -0.45, arm: 1.35, offset: 0.9 },
  { x: 0, z: -57, spin: 0.4, arm: -1.5, offset: 5.1 },
]
export const ARM = { y: DISC.top + 0.35, half: 0.25, reach: DISC.radius - 0.3 } // its middle, half its height
export const BUMPERS = [-25.5, -46.5].flatMap((z) => [
  { x: 0, z: z + 2.7, size: 2.2, turn: 0 },
  { x: 0, z: z - 2.7, size: 2.2, turn: Math.PI },
])

// ---------------------------------------------------------------------------------------------------------
// 2. The Climb: a ramp up the middle to the fan deck, and either side of it the deck's front face is a
// climbing wall: holds up it, and its taped top edge a ledge to pull up over
export const WALL_FOOT = deck(-64, -72)
export const RAMP = { z0: -63.5, z1: -72.2, half: 2.6 }
export const CLIMB = { face: -72, rows: [2.4, 3.6], gap: RAMP.half + 0.5 } // holds clear of the ramp
export const HOLD_COLUMNS = Array.from({ length: 6 }, (_, i) => CLIMB.gap + 0.6 + i * 1.55).flatMap((x) => [-x, x])
export const HOLD_HALF = 0.18

// ---------------------------------------------------------------------------------------------------------
// 3. Fan Deck: two rows of giant four-bladed fans turning upright across the deck (a middle one, then two
// side ones behind it), their blades sweeping down to just off the deck and between them covering the whole
// width; the second row quicker than the first. Foam bumpers in front of each row; nets along both sides.
export const FAN_DECK = deck(-72, -116, TOP_1)
export const FAN = { radius: 4.6, hubHeight: 4.8, blade: 0.9, thick: 0.4 }
export const FANS = [
  { x: 0, z: -85, spin: 1.5, offset: 0 },
  { x: -7.8, z: -92, spin: -1.4, offset: 0.4 },
  { x: 7.8, z: -92, spin: 1.4, offset: 1.2 },
  { x: 0, z: -103, spin: -1.8, offset: 0.7 },
  { x: -7.8, z: -110, spin: 1.7, offset: 1.9 },
  { x: 7.8, z: -110, spin: -1.7, offset: 0.2 },
]
export const DECK_BUMPERS = [-78.5, -97].flatMap((z) => [-6.5, 0, 6.5].map((x) => ({ x, z, size: 2.2, turn: 0 })))
export const NET_HEIGHT = 1.6

// ---------------------------------------------------------------------------------------------------------
// 4. Blower Bridge: three narrow planks, no rails, with a round island between each and the next. Banks of
// blowers either side: every few seconds a gust blows across the planks from one side, then (the next time)
// from the other. Stood on a plank in a gust, you're pushed sideways (walk into it, or be blown off); on an
// island you're out of it.
export const BLOWER = { y: TOP_1, plankHalf: 1.5, islandRadius: 3.6, blowerX: 5.5 }
export const PLANKS = [
  { z0: -116, z1: -123 },
  { z0: -130, z1: -137 },
  { z0: -144, z1: -151 },
]
export const ISLANDS = [-126.5, -140.5]
// The gusts: a calm, then a gust, over and over, the gusts coming from alternate sides
export const GUST = { calm: 2.4, blow: 2.2, speed: 4.6, from: RUN + 2 }
const GUST_CYCLE = GUST.calm + GUST.blow
// Which way the wind's blowing at t (-1: towards -x, 1: towards +x, 0: it isn't)
export function gustAt(t: number) {
  if (t < GUST.from) return 0
  const s = t - GUST.from
  const k = Math.floor(s / GUST_CYCLE)
  return s - k * GUST_CYCLE < GUST.calm ? 0 : k % 2 ? -1 : 1
}
// How long until the next gust starts (0 while one's blowing)
export function nextGustIn(t: number) {
  if (t < GUST.from) return GUST.from - t + GUST.calm
  if (gustAt(t)) return 0
  return GUST.calm - ((t - GUST.from) % GUST_CYCLE)
}

// ---------------------------------------------------------------------------------------------------------
// 5. Rotor Ride: a hub round a tall red pole, and four broad arms turning round it, their ends sweeping past
// a landing on each side (each landing's edge an arc the arms' ends follow). On to an arm as it comes past,
// along it to the hub, and out along another to the far landing.
export const ROTOR = { x: 0, z: -166.5, spin: 0.32, arms: 4, armHalf: 1.7, reach: 11.4, hub: 2.6, edge: 11.5, span: 0.7, thickness: 0.5 }
export const ROTOR_ENTRY = { back: -151, front: ROTOR.z + ROTOR.edge } // (its front at its middle: its edge is the arc)
export const ROTOR_EXIT = { front: ROTOR.z - ROTOR.edge, back: -182 }

// ---------------------------------------------------------------------------------------------------------
// 6. Windmill Wall: a tall wall (from the fan deck's height up to TOP_2) right across the course: holds up
// its face and a taped ledge along its top. Over its top, three windmills turn just in front of it, their
// sails sweeping down across the top rows of holds and the ledge: the climb up's safe, but time the last hop
// and the pull over the top, or be knocked off the wall to the deck below.
export const WINDMILL_FOOT = deck(-182, -190, TOP_1)
export const WINDMILL_WALL = {
  face: -190,
  rows: [TOP_1 + 2.4, TOP_1 + 3.6, TOP_1 + 4.8],
  columns: Array.from({ length: 15 }, (_, i) => -11 + i * (22 / 14)),
}
export const WINDMILLS = [
  { x: -8, spin: 0.6, offset: 0.3 },
  { x: 0, spin: -0.7, offset: 1.9 },
  { x: 8, spin: 0.6, offset: 0.9 },
]
export const WINDMILL = { radius: 3.6, hubY: TOP_2 + 1.2, out: 0.8, sail: 0.6, thick: 0.35, sails: 2 }
export const WALL_TOP = deck(-190, -198, TOP_2, HALF, TOP_2 - 8)

// ---------------------------------------------------------------------------------------------------------
// 7. Whirlygig Stairs: a stairway up to TOP_3 with three whirlygigs over it: long two-bladed bars turning
// upright across the stairs, low enough at the bottom of their turn to sweep you off your feet, off to the
// left, then the right, then the left, each sweeping all but the far side from it: weave round them, or time
// it under them. Each quicker than the last.
export const STAIRS = { z0: -198, z1: -224, y0: TOP_2, y1: TOP_3, half: 8 }
export const stairsY = (z: number) => STAIRS.y0 + ((STAIRS.z0 - z) / (STAIRS.z0 - STAIRS.z1)) * (STAIRS.y1 - STAIRS.y0)
export const WHIRL = { radius: 7.5, hubHeight: 7.8, blade: 1, thick: 0.45 }
export const WHIRLYGIGS = [
  { x: -3.5, z: -204, spin: 1, offset: 0 },
  { x: 3.5, z: -211, spin: -1.15, offset: Math.PI / 2 },
  { x: -3.5, z: -218, spin: 1.3, offset: 0.8 },
]
export const STAIRS_TOP = deck(-224, -230, TOP_3, HALF, TOP_3 - 8)

// ---------------------------------------------------------------------------------------------------------
// 8. Rotor Hop: six little spinning discs to hop across, each a little higher, smaller and quicker than the
// last, turning alternate ways; and the finish deck beyond
const HOP_RADII = [2.6, 2.4, 2.25, 2.1, 2, 1.9]
const HOP_GAPS = [1.4, 1.5, 1.6, 1.7, 1.8]
const HOP_SPINS = [0.6, -0.75, 0.9, -1, 1.15, -1.3]
const HOP_X = [0, 1.2, -1.2, 1.2, -1.2, 0]
export const HOPS = HOP_RADII.map((radius, i) => {
  let z = STAIRS_TOP.min[2] - 1.4 - HOP_RADII[0]
  for (let k = 1; k <= i; k++) z -= HOP_RADII[k - 1] + HOP_GAPS[k - 1] + HOP_RADII[k]
  return { x: HOP_X[i], z, radius, top: TOP_3 + 0.3 * (i + 1), spin: HOP_SPINS[i] }
})
const lastHop = HOPS[HOPS.length - 1]
export const TOP_4 = lastHop.top + 0.3
export const FINISH_DECK = deck(lastHop.z - lastHop.radius - 1.6, lastHop.z - lastHop.radius - 18, TOP_4, HALF, TOP_4 - 8)
export const FINISH_Z = FINISH_DECK.max[2] - 6

// ---------------------------------------------------------------------------------------------------------

const onTop = (b: Box, from = b.max[2], to = b.min[2]): Zone => ({ min: [b.min[0], b.max[1] - 0.5, to], max: [b.max[0], b.max[1] + 4, from] })
const respawn = (y: number, z: number): Point => [0, y + 1.3, z]

export const WHIRLY_COURSE: RaceCourse = {
  spawn: SPAWN,
  sections: ['Spinning Discs', 'The Climb', 'Fan Deck', 'Blower Bridge', 'Rotor Ride', 'Windmill Wall', 'Whirlygig Stairs', 'Rotor Hop'],
  checkpoints: [
    { zone: onTop(WALL_FOOT), respawn: respawn(0, -67) },
    { zone: onTop(FAN_DECK, -72, -80), respawn: respawn(TOP_1, -75) },
    { zone: onTop(FAN_DECK, -112, -116), respawn: respawn(TOP_1, -114) },
    { zone: { min: [-8, TOP_1 - 0.5, ROTOR_ENTRY.front], max: [8, TOP_1 + 4, ROTOR_ENTRY.back] }, respawn: respawn(TOP_1, ROTOR_ENTRY.back - 1.5) },
    { zone: onTop(WINDMILL_FOOT), respawn: respawn(TOP_1, -185) },
    { zone: onTop(WALL_TOP), respawn: respawn(TOP_2, -195) },
    { zone: onTop(STAIRS_TOP), respawn: respawn(TOP_3, -227) },
  ],
  finish: { min: [-HALF, TOP_4 - 0.5, -Infinity], max: [HALF, Infinity, FINISH_Z] },
}
