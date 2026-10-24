import type { RaceCourse, Zone } from '../race/race'

// Over & Under: a straight race down a red track high in the sky, between yellow rails, under teal posts and
// green bars. Units are metres; runners head towards -z:
//  1. Hurdles: green bars sliding up and down the track at knee height: jump them as they come at you
//  2. Gates: bars across the track just too low to run under: slide (roll) under them, some bobbing up and
//     down, with a hurdle to jump just before two of them
//  3. Seesaws: off the end of the track and across three rows of planks over the sky, thin to wide, each
//     tipping on an axle across its middle under the weight of whoever's on it, one end or the other
//  4. Tidal Wave: two long green beams rolling up and down a wide deck, speeding up and slowing down as they
//     please: watch them, and time the jump
//  5. The Wall: green walls come up across the way, stay up ten seconds, and go down for five: get through
// And the finish line beyond.

type Point = [number, number, number]
export type Box = { min: Point; max: Point }

export const WIDTH = 14
export const HALF = WIDTH / 2
export const FALL_Y = -10 // under every deck: falling this far sends you back to your checkpoint
const DECK_BASE = -2.5

export const COLORS = {
  track: '#ff5d7e',
  trackDark: '#e8406a',
  side: '#7a4fd8',
  rail: '#ffd23f',
  post: '#1fb5a8',
  bar: '#3ddc62',
  barDark: '#22a845',
  lane: '#ffffff',
  plank: '#ffb347',
  plankSide: '#d9832a',
}

const deck = (z0: number, z1: number, half = HALF): Box => ({ min: [-half, DECK_BASE, z1], max: [half, 0, z0] })

// Start: 30 grid slots behind the line, 3 rows of 10
export const START_DECK = deck(14, 0)
export const START_SLOTS: [number, number][] = Array.from({ length: 30 }, (_, i) => [-5.85 + (i % 10) * 1.3, 3 + Math.floor(i / 10) * 2.6])
export const PLAYER_SLOT = 4
export const SPAWN: Point = [START_SLOTS[PLAYER_SLOT][0], 1.3, START_SLOTS[PLAYER_SLOT][1]]

// The bars: round green rods across the track (end to end over it, held by posts outside the rails)
export const BAR = { radius: 0.22, reach: HALF + 0.4 }
export const POST_X = HALF + 0.75

// ---------------------------------------------------------------------------------------------------------
// 1. Hurdles: four bars at knee height, each sliding to and fro along its own stretch of the track
export const HURDLE_DECK = deck(0, -42)
export const HURDLE_Y = 0.48 // the bar's middle
export const HURDLES = [
  { z: -8, reach: 4.5, period: 5.2, offset: 0 },
  { z: -18, reach: 4.5, period: 4.6, offset: 1.7 },
  { z: -28, reach: 5, period: 4.2, offset: 0.6 },
  { z: -37, reach: 3.5, period: 3.6, offset: 2.3 },
]

// ---------------------------------------------------------------------------------------------------------
// 2. Gates: bars just too low to run under (their underside at GATE_GAP: under that, only a roll fits), some
// bobbing up out of the way and back down, two with a hurdle to jump just before them
export const GATE_DECK = deck(-42, -82)
export const GATE_GAP = 1.35 // from the track to a gate bar's underside (crouching, you need 1.6)
export const GATE_TOP = 2.6 // a bobbing gate's underside, at the top of its bob
export const GATES = [
  { z: -49, bob: 0, offset: 0 },
  { z: -57.5, bob: 3.4, offset: 0.4, hurdle: -55 },
  { z: -65, bob: 2.8, offset: 1.6 },
  { z: -72, bob: 0, offset: 0 },
  { z: -78.5, bob: 3, offset: 0.9, hurdle: -76 },
]

// ---------------------------------------------------------------------------------------------------------
// 3. Seesaws: three rows of three planks out over the sky, each tipping on an axle across its middle
export const PLANK = { length: 10, thickness: 0.5, maxTilt: 0.38 }
const ROW_GAP = 1.6
export const SEESAW_FROM = GATE_DECK.min[2] // the track ends here
export const PLANK_X = [-4.6, 0, 4.6]
export const ROW_WIDTHS = [
  [2.6, 3.2, 2.6],
  [1.8, 2.8, 1.8],
  [1.4, 2.2, 1.4],
]
export const SEESAWS = ROW_WIDTHS.flatMap((widths, row) =>
  widths.map((width, k) => ({ row, x: PLANK_X[k], z: SEESAW_FROM - ROW_GAP - PLANK.length / 2 - row * (PLANK.length + ROW_GAP), width })),
)
const lastRow = SEESAWS[SEESAWS.length - 1]

// ---------------------------------------------------------------------------------------------------------
// 4. Tidal Wave: a long deck, two beams rolling up and down it
export const WAVE_DECK = deck(lastRow.z - PLANK.length / 2 - ROW_GAP, lastRow.z - PLANK.length / 2 - ROW_GAP - 42)
export const WAVE = {
  near: WAVE_DECK.max[2] - 4, // the beams roll between these
  far: WAVE_DECK.min[2] + 4,
  y: 0.5, // the beam's middle
  radius: 0.32,
  slowest: 2.5, // m/s
  fastest: 9.5,
}

// ---------------------------------------------------------------------------------------------------------
// 5. The Wall: across the way, up ten seconds and down five
export const WALL_DECK = deck(WAVE_DECK.min[2], WAVE_DECK.min[2] - 18)
export const WALL = { z: WALL_DECK.max[2] - 7, thickness: 0.8, height: 4.5, up: 10, down: 5, move: 0.6 }

// ---------------------------------------------------------------------------------------------------------
// The finish
export const FINISH_DECK = deck(WALL_DECK.min[2], WALL_DECK.min[2] - 16)
export const FINISH_Z = FINISH_DECK.max[2] - 5

// ---------------------------------------------------------------------------------------------------------

const onTop = (b: Box, from = b.max[2], to = b.min[2]): Zone => ({ min: [b.min[0], b.max[1] - 0.5, to], max: [b.max[0], b.max[1] + 4, from] })
const respawn = (z: number): Point => [0, 1.3, z]

export const OVER_COURSE: RaceCourse = {
  spawn: SPAWN,
  sections: ['Hurdles', 'Gates', 'Seesaws', 'Tidal Wave', 'The Wall'],
  checkpoints: [
    { zone: onTop(GATE_DECK, -42, -46), respawn: respawn(-44) },
    { zone: onTop(GATE_DECK, -80, -82), respawn: respawn(-80.8) },
    { zone: onTop(WAVE_DECK, WAVE_DECK.max[2], WAVE_DECK.max[2] - 3), respawn: respawn(WAVE_DECK.max[2] - 1.5) },
    { zone: onTop(WALL_DECK, WALL_DECK.max[2], WALL.z + 1.5), respawn: respawn(WALL_DECK.max[2] - 2) },
  ],
  finish: { min: [-HALF, -0.5, -Infinity], max: [HALF, Infinity, FINISH_Z] },
}
