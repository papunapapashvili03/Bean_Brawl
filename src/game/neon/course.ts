import type { RaceCourse, Zone } from '../race/race'

// Neon Circuit layout. Units are metres; runners head towards -z, far above a glowing circuit-board floor.

type Point = [number, number, number]

export const NEON = {
  road: '#1c1638',
  roadSide: '#2b1f5c',
  yellow: '#ffe14d',
  cyan: '#3de8ff',
  pink: '#ff4fd8',
  purple: '#8a3fd9',
}

export const FLOOR_Y = -40 // the circuit board far below
export const FALL_Y = -20

// Start pad
export const START = { zFront: -1, zBack: 9, width: 12 }

// 1. Neon Highway: one S-bend with gentle rises, from u = 0 (start) to u = HIGHWAY_LENGTH along -z
export const HIGHWAY_LENGTH = 48
export const ROAD_WIDTH = 7
export const roadX = (u: number) => 5 * Math.sin((u * Math.PI) / 24)
export const roadY = (u: number) => 0.6 * Math.sin((u * Math.PI) / 12)
export const roadPoint = (u: number): Point => [roadX(u), roadY(u), -u]
export const roadSlopeX = (u: number) => ((5 * Math.PI) / 24) * Math.cos((u * Math.PI) / 24) // d(roadX)/du

// Checkpoint pad between the highway and the grid
export const PAD1 = { z0: -HIGHWAY_LENGTH + 0.5, z1: -50.3 }

// 2. Blackout Grid: 5 x 7 tiles that switch off in a V-shaped wave moving down the grid
export const GRID = { cols: 5, rows: 7, tile: 3, gap: 0.35, z0: -50.3 }
export const gridPitch = GRID.tile + GRID.gap
export const tileX = (c: number) => (c - (GRID.cols - 1) / 2) * gridPitch
export const tileZ = (r: number) => GRID.z0 - GRID.tile / 2 - r * gridPitch
const GRID_END = tileZ(GRID.rows - 1) - GRID.tile / 2

// Landing pad before the ladder
export const PAD2 = { z0: GRID_END, z1: GRID_END - 2.2 }

// 3. Ladder Climb: a long pink ramp with glowing orbs bouncing down it
export const LADDER = { from: [0, 0, PAD2.z1] as Point, to: [0, 10, PAD2.z1 - 23.5] as Point, width: 6 }
export const TOP_DECK = { min: [-4, 8.8, LADDER.to[2] - 5.5] as Point, max: [4, 10, LADDER.to[2] + 0.2] as Point }

// 4. Balloon Lift: three basket platforms bobbing under hot-air balloons
export const BALLOONS = [
  { x: 0, z: TOP_DECK.min[2] - 4.5, phase: 0 },
  { x: 2.4, z: TOP_DECK.min[2] - 10, phase: 2.1 },
  { x: -2, z: TOP_DECK.min[2] - 15.5, phase: 4.2 },
]
export const BALLOON_BASE_Y = 11
export const BALLOON_BOB = 2.5
export const BALLOON_PERIOD = 6
// How high a basket's floor is at time t on the match clock, and how fast it's rising
const BOB_W = (Math.PI * 2) / BALLOON_PERIOD
export const basketY = (b: { phase: number }, t: number) => BALLOON_BASE_Y + BALLOON_BOB * Math.sin(BOB_W * t + b.phase)
export const basketVy = (b: { phase: number }, t: number) => BALLOON_BOB * BOB_W * Math.cos(BOB_W * t + b.phase)
export const LANDING = {
  min: [-4, 10.8, BALLOONS[2].z - 7.5] as Point,
  max: [4, 12, BALLOONS[2].z - 3] as Point,
}

// 5. Cloud Hop: flat-topped clouds climbing in a zigzag; two drift sideways
export const CLOUDS = [0, 2.6, -1.2, 1.8, -2.4, 0.5].map((x, i) => ({
  x,
  z: LANDING.min[2] - 2.5 - i * 3.6,
  top: 12.6 + i * 0.6,
  drift: i === 2 || i === 4 ? 2.2 : 0,
}))
// Where a cloud's middle is (side to side) at time t
export const cloudX = (c: { x: number; z: number; drift: number }, t: number) => c.x + c.drift * Math.sin(t * 0.8 + c.z)
const lastCloud = CLOUDS[CLOUDS.length - 1]
const finishFront = lastCloud.z - 2 // just past the last cloud's back edge
export const FINISH_DECK = {
  min: [-7, 15, finishFront - 16] as Point,
  max: [7, lastCloud.top + 0.6, finishFront] as Point,
}
export const FINISH_Z = finishFront - 7

export const SPAWN: Point = [0, 1.3, 5]

const box = (min: Point, max: Point): Zone => ({ min, max })
const onTop = (min: Point, max: Point): Zone => box([min[0], max[1] - 0.5, min[2]], [max[0], max[1] + 4, max[2]])

export const NEON_COURSE: RaceCourse = {
  spawn: SPAWN,
  sections: ['Neon Highway', 'Blackout Grid', 'Ladder Climb', 'Balloon Lift', 'Cloud Hop'],
  checkpoints: [
    { zone: box([-8, -1, PAD1.z1], [8, 3, PAD1.z0]), respawn: [0, 1.3, (PAD1.z0 + PAD1.z1) / 2] },
    { zone: box([-8, -1, PAD2.z1], [8, 3, PAD2.z0]), respawn: [0, 1.3, (PAD2.z0 + PAD2.z1) / 2] },
    { zone: onTop(TOP_DECK.min, TOP_DECK.max), respawn: [0, 11.3, (TOP_DECK.min[2] + TOP_DECK.max[2]) / 2] },
    { zone: onTop(LANDING.min, LANDING.max), respawn: [0, 13.3, (LANDING.min[2] + LANDING.max[2]) / 2] },
  ],
  finish: box([-6, FINISH_DECK.max[1] - 0.5, -Infinity], [6, Infinity, FINISH_Z]),
}
