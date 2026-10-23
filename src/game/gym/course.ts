import type { RaceCourse, Zone } from '../race/race'

// Jungle Gym layout. Units are metres; runners head towards -z, from the start grid over the monkey bars,
// across the bobbing elevator columns, up (or through) the climbing wall, through the shape storm, round the
// sweepers and up the bounce pads to the finish. Every section is as wide as the start grid, so a full
// lobby of 30 can race side by side.

type Point = [number, number, number]
export type Box = { min: Point; max: Point }

export const WIDTH = 24
export const HALF = WIDTH / 2
export const FALL_Y = -8 // under every deck: falling this far sends you back to your checkpoint
const DECK_BASE = -3 // decks are solid blocks from here up to their top

// Candy colours, like the playground
export const COLORS = {
  floor: '#ff8fd8',
  floorSide: '#9b5de5',
  trim: '#ffd23f',
  candy: ['#4dd4ac', '#7b61ff', '#3fa9f5', '#ff5a5f', '#ffa94d', '#b7e04a', '#ff9ec4', '#ffd23f'],
}

const deck = (z0: number, z1: number, top = 0): Box => ({ min: [-HALF, DECK_BASE, z1], max: [HALF, top, z0] })

// Start: 30 grid slots behind the line, 3 rows of 10
export const START_DECK = deck(14, 0)
export const START_SLOTS: [number, number][] = Array.from({ length: 30 }, (_, i) => [
  -9.9 + (i % 10) * 2.2,
  3 + Math.floor(i / 10) * 2.6,
])
export const PLAYER_SLOT = 4
export const SPAWN: Point = [START_SLOTS[PLAYER_SLOT][0], 1.3, START_SLOTS[PLAYER_SLOT][1]]

// 1. Monkey Bar Canyon: three racks of rungs spanning the canyon side by side. Rungs are a metre apart (a
// fling reaches the next) and 2.05 above the decks (a standing jump catches the first).
export const CANYON = { z0: 0, z1: -12 }
export const MONKEY_Y = 2.05
export const RACKS: [number, number][] = [
  [-11.5, -4.5],
  [-3.5, 3.5],
  [4.5, 11.5],
]
export const RUNG_Z = Array.from({ length: 12 }, (_, i) => -0.5 - i)
export const MONKEY_LANDING = deck(-12, -18)

// 2. Elevator Columns: five rows of five square columns over a pit, each bobbing up and down on its own
// beat. Every top edge is a moving ledge: catch one that's risen above you and pull yourself up.
export const COLUMN = { size: 2.8, rise: 2.2, period: 5, length: 22 }
const COLUMN_XS = [-9.6, -4.8, 0, 4.8, 9.6]
const COLUMN_ZS = [-21.2, -25.8, -30.4, -35, -39.6]
export const COLUMNS = COLUMN_ZS.flatMap((z, row) =>
  COLUMN_XS.map((x, col) => ({ x, z, phase: ((row * 1.9 + col * 2.6) % 6.283) - 3.14, color: COLORS.candy[(row * 5 + col) % 8] })),
)
// How high a column's top is at time t on the match clock, and how fast it's rising
const COLUMN_W = (Math.PI * 2) / COLUMN.period
export const columnTop = (c: { phase: number }, t: number) => COLUMN.rise * Math.sin(COLUMN_W * t + c.phase)
export const columnRise = (c: { phase: number }, t: number) => COLUMN.rise * COLUMN_W * Math.cos(COLUMN_W * t + c.phase)
export const WALL_APPROACH = deck(-42.8, -52)

// 3. Climbing Wall: a rainbow wall across the whole course with climbing holds all over its face, and four
// square holes at different heights, each a shortcut through: catch its bottom edge, pull up, walk through
// and drop down the far side. The lowest can be caught from a running jump, so it jams up.
export const WALL = { front: -52, back: -54.5, height: 12, band: 1.2 }
export const HOLE_SIZE = 2.4
export const HOLES = [
  { x: 4.2, y: 3.6 },
  { x: -7.8, y: 6 },
  { x: 9, y: 7.2 },
  { x: -1.8, y: 8.4 },
]
export const HOLD_ROWS = [2.4, 3.6, 4.8, 6, 7.2, 8.4, 9.6, 10.8]
export const HOLD_COLUMNS = Array.from({ length: 15 }, (_, i) => -11 + i * (22 / 14))
export const HOLD_HALF = 0.18
export const BACK_DECK = deck(-54.5, -64)

// 4. Shape Storm: a walled field where shapes rain from the sky, bounce, roll and knock you about
export const STORM = { z0: -64, z1: -100, wallHeight: 1.5, drop: { y0: 26, y1: 42 }, count: 72 }
export const STORM_FIELD = deck(-64, -100)
export const STORM_EXIT = deck(-100, -104)

// 5. Sweeper Spin: a round arena with two sweeper bars through its hub: a low one to jump over and a high
// one to crouch (C) under
export const SPIN = { z: -116, radius: 12, hub: 1.2 }
export const SWEEPERS = [
  { y: 0.35, height: 0.5, spin: 0.9, color: '#ff5a5f', offset: 0 }, // jump it
  { y: 1.72, height: 0.6, spin: -0.6, color: '#3fa9f5', offset: Math.PI / 2 }, // duck it
]

// 6. Bounce Garden: bounce pads launch you up two tiers to the finish deck; the tier edges catch short hops
export const BOUNCE_DECK = deck(-128, -137)
export const TIER_1 = deck(-137, -149, 4.5)
export const TIER_2 = deck(-149, -166, 9)
export const PAD = { radius: 1.5, launch: 15 }
// A row of five in front of the first tier, then six (staggered) in front of the second
export const PADS = [
  ...[-9.6, -4.8, 0, 4.8, 9.6].map((x) => ({ x, z: -134.4, y: 0 })),
  ...[-10, -6, -2, 2, 6, 10].map((x) => ({ x, z: -146.4, y: TIER_1.max[1] })),
]
export const FINISH_Z = -156

const onTop = (b: Box): Zone => ({ min: [b.min[0], b.max[1] - 0.5, b.min[2]], max: [b.max[0], b.max[1] + 4, b.max[2]] })
const respawnOn = (b: Box): Point => [0, b.max[1] + 1.3, (b.min[2] + b.max[2]) / 2]

export const GYM_COURSE: RaceCourse = {
  spawn: SPAWN,
  sections: ['Monkey Bar Canyon', 'Elevator Columns', 'Climbing Wall', 'Shape Storm', 'Sweeper Spin', 'Bounce Garden'],
  checkpoints: [
    { zone: onTop(MONKEY_LANDING), respawn: respawnOn(MONKEY_LANDING) },
    { zone: onTop(WALL_APPROACH), respawn: [0, 1.3, -45] },
    { zone: onTop(BACK_DECK), respawn: [0, 1.3, -58] },
    { zone: onTop(STORM_EXIT), respawn: respawnOn(STORM_EXIT) },
    { zone: onTop(BOUNCE_DECK), respawn: [0, 1.3, -130] },
  ],
  finish: { min: [-HALF, TIER_2.max[1] - 0.5, -Infinity], max: [HALF, Infinity, FINISH_Z] },
}
