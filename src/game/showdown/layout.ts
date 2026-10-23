import type { Pick, RackLayout } from '../experimental/guns/GunDisplay'
import { THROW_KINDS } from '../experimental/guns/throwables/catalog'
import type { GrabEdge } from '../grab'
import { NEON } from '../neon/course'
import type { RaceCourse } from '../race/race'

// Neon Showdown: a gunfight in the neon city, built from Neon Circuit's pieces and laid on its glowing
// circuit-board floor, with the lit towers all round. The two teams start at either end, on start pads
// behind big billboard screens. North, the Neon Highway: an overpass that climbs to 4 m, with data pulses
// racing along it both ways. In the middle, the Blackout Grid: tiles 4 m up that black out in rings rippling
// from the centre, reached by a pink ladder from each side (glowing orbs bounce down them) onto solid decks.
// South, the Sky Stage (the finish deck and its arches), the highest ground, reached only by hopping clouds
// from the decks or from the balloon baskets that bob up and down beside it; one more balloon floats behind
// the highway. Circuit chips, capacitors, resistors and server stacks lie about for cover.
//
// +x is east, +z south. Mirror-symmetric across x = 0: west is the cyan team, east the pink team.

export type P3 = [number, number, number]
export type XZ = [number, number]

export const HALF_X = 50
export const HALF_Z = 32
export const FENCE_HEIGHT = 2.6
export const TEAM = { west: NEON.cyan, east: NEON.pink }
export const FALL_Y = -20

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------------------------------------
// Starts: a pad at each end with a neon arch over its exit, a billboard screen in front of it for cover

export const PAD = { x0: 38, x1: 46, half: 6 } // |x| from x0 to x1, z within ±half
export const SCREEN = { x: 31, half: 6, thick: 0.8, base: 1, top: 7 } // |x|; the screen's face looks inwards
const WEST_SPAWNS = [-44, -41].flatMap((x) => [-4.5, -1.5, 1.5, 4.5].map((z) => [x, 1.3, z] as P3))
export const SPAWNS = { west: WEST_SPAWNS, east: WEST_SPAWNS.map(([x, y, z]) => [-x, y, z] as P3) }
export const PLAYER_SPAWN: P3 = [-41, 1.3, 1.5]

const gun = (index: number, x: number) => ({ pick: { gun: index } as Pick, x })
const GUNS = [gun(0, -3.8), gun(2, -1.9), gun(7, 0), gun(11, 1.9), gun(9, 4.1)]
const EXPLOSIVES = [...THROW_KINDS.map((throwable, i) => ({ pick: { throwable } as Pick, x: (i - 1.5) * 1.5 })), gun(13, 1.5 * 1.5 + 1.75)]
export const RACKS: RackLayout[] = [
  { x: -48.6, z: 0, yaw: Math.PI / 2, items: GUNS },
  { x: -42, z: -8.8, yaw: 0, spacing: 1.5, items: EXPLOSIVES },
  { x: 48.6, z: 0, yaw: -Math.PI / 2, items: GUNS },
  { x: 42, z: -8.8, yaw: 0, spacing: 1.5, items: EXPLOSIVES },
]

// The match clock drives the moving pieces; there's no finish line (a gunfight ends some other way)
export const SHOWDOWN_COURSE: RaceCourse = {
  spawn: PLAYER_SPAWN,
  sections: [''],
  checkpoints: [],
  finish: { min: [0, -1e9, 0], max: [0, -1e9, 0] },
}

// ---------------------------------------------------------------------------------------------------------
// 1. Neon Highway: the overpass along the north, weaving gently, level at 4 m through the middle and running
// down to the ground at both ends. Data pulses race along it, eastbound on its south lane and westbound on
// its north lane.

export const ROAD = { x0: -36, x1: 36, width: 7, step: 2, top: 4, low: 0.08 }
export const roadZ = (x: number) => -21 + 2 * Math.cos((Math.PI * x) / 18)
export const roadY = (x: number) => ROAD.low + (ROAD.top - ROAD.low) * (1 - smoothstep(16, 34, Math.abs(x)))
export const roadPoint = (x: number): P3 => [x, roadY(x), roadZ(x)]
// Unit vector across the road (towards +z, the right of eastbound traffic)
export function roadAcross(x: number): XZ {
  const slope = -((2 * Math.PI) / 18) * Math.sin((Math.PI * x) / 18) // d(roadZ)/dx
  const len = Math.hypot(1, slope)
  return [-slope / len, 1 / len]
}
export const ROAD_PILLARS = [-12, -4, 4, 12]

export const PULSE = {
  speed: 8,
  wave: 2.4, // seconds between waves in a lane
  from: 33, // pulses run from x = ∓from to ±from
  lanes: [
    { offset: 1.75, dir: 1 },
    { offset: -1.75, dir: -1 },
  ],
  pattern: [1, 1, 0, 1, 0, 1, 1, 0], // which waves carry a pulse
}
export const PULSE_TRAVEL = (2 * PULSE.from) / PULSE.speed
export const PULSE_POOL = Math.ceil(PULSE_TRAVEL / PULSE.wave) + 1

// ---------------------------------------------------------------------------------------------------------
// 2. Blackout Grid: 5 x 5 tiles 4 m up in the middle. Every CYCLE beats the tiles black out in rings, from the
// centre outwards (each ring for two beats), flashing white the beat before. Solid decks either side, and a
// narrow rail along the north and south edges to balance across on.

export const GRID = { n: 5, tile: 3, gap: 0.35, top: 4, thick: 0.5 }
export const gridPitch = GRID.tile + GRID.gap
export const tileAt = (i: number) => (i - (GRID.n - 1) / 2) * gridPitch
export const GRID_HALF = (GRID.n * GRID.tile + (GRID.n - 1) * GRID.gap) / 2
export const BEAT = 1
export const CYCLE = 8
const CYCLE_OFFSET = 5 // the first blackout comes a few seconds in
export const tileRing = (r: number, c: number) => Math.max(Math.abs(r - (GRID.n - 1) / 2), Math.abs(c - (GRID.n - 1) / 2))
// Beats until this tile blacks out: 0-1 = out, CYCLE-1 = warning
export function tilePhase(r: number, c: number, t: number) {
  const beat = Math.floor(t / BEAT)
  return (((beat - tileRing(r, c) - CYCLE_OFFSET) % CYCLE) + CYCLE) % CYCLE
}
export const tileOut = (phase: number) => phase <= 1

export const DECK = { x0: 8.4, x1: 12.4, top: 4, thick: 0.6 } // |x|; z within ±GRID_HALF
export const RAIL = { z0: GRID_HALF + 0.05, z1: GRID_HALF + 0.45, thick: 0.5 } // |z|; spans the gap between the decks

// ---------------------------------------------------------------------------------------------------------
// 3. Ladder Climb: a pink ramp up to each deck from the team's side, with orbs bouncing down it

export const LADDERS = [-1, 1].map((s) => ({ from: [s * 26, 0.05, 0] as P3, to: [s * DECK.x1, DECK.top, 0] as P3, width: 5 }))
export const ORB = { lanes: [-1.6, 0, 1.6], radius: 0.55, speed: 7, interval: 2.6, bounce: 1.2, hop: 0.55 }

// ---------------------------------------------------------------------------------------------------------
// 4. Balloon Lift: basket platforms bobbing under hot-air balloons. Low enough at the bottom of their bob to
// catch the rim from the ground; at the top, high enough to step onto the clouds.

export const BALLOON = { base: 5.5, bob: 2.5, period: 7, half: 1.6 }
export const BALLOONS = [
  { x: -17, z: 21, phase: 0 },
  { x: 17, z: 21, phase: 0 },
  { x: 0, z: -27.4, phase: Math.PI },
]

// ---------------------------------------------------------------------------------------------------------
// 5. Cloud Hop: flat-topped clouds up to the Sky Stage, from each balloon and from each deck; some drift

export const CLOUD_RADIUS = 1.8
const WEST_CLOUDS = [
  { x: -13, z: 22.4, top: 6.9, drift: 0 },
  { x: -9.2, z: 20.2, top: 6.5, drift: 1 },
  { x: -10, z: 10.8, top: 4.6, drift: 0 },
  { x: -8, z: 14, top: 5.3, drift: 0 },
]
export const CLOUDS = [...WEST_CLOUDS, ...WEST_CLOUDS.map((c) => ({ ...c, x: -c.x, drift: -c.drift }))]
export const cloudX = (c: (typeof CLOUDS)[number], t: number) => c.x + c.drift * Math.sin(t * 0.8 + c.z)

// The Sky Stage: the finish deck, standing on the ground in the south, under its three arches
export const STAGE = { half: 6, z0: 15, z1: 25, top: 6 }

// ---------------------------------------------------------------------------------------------------------
// Cover: circuit parts lying on the board (west half; mirrored, except what sits on the middle line)

export type Chip = { at: XZ; size: P3; y?: number; color: string }
export type Capacitor = { at: XZ; r: number; h: number; color: string }
export type Resistor = { at: XZ; along: 'x' | 'z' }
export type Server = { at: XZ; size: P3; color: string }

const mirror = <T extends { at: XZ }>(list: T[]): T[] => [...list, ...list.filter((i) => i.at[0] !== 0).map((i) => ({ ...i, at: [-i.at[0], i.at[1]] as XZ }))]

export const CHIPS: Chip[] = mirror<Chip>([
  { at: [-35, -11.5], size: [3, 1.4, 2.4], color: NEON.cyan },
  { at: [-35, 11.5], size: [3, 1.4, 2.4], color: NEON.cyan },
  { at: [-26, -28.6], size: [3.2, 1.3, 2], color: NEON.purple },
  { at: [-20, -12], size: [4, 1.5, 2.6], color: NEON.yellow },
  { at: [-26, 14], size: [3.6, 1.5, 3], color: NEON.pink },
  { at: [-31, 24], size: [2.6, 1.2, 2.6], color: NEON.purple },
  { at: [-10, 28.6], size: [3, 1.3, 2], color: NEON.yellow },
  { at: [0, 0], size: [5, 1.2, 5], color: NEON.yellow }, // under the grid
  { at: [0, -12], size: [3, 1.2, 2], color: NEON.purple },
  // On the Sky Stage
  { at: [0, 21.6], size: [3, 1.1, 1.2], y: STAGE.top, color: NEON.cyan },
  { at: [-3.8, 17], size: [1.6, 1, 1.2], y: STAGE.top, color: NEON.pink },
])
export const CAPACITORS: Capacitor[] = mirror<Capacitor>([
  { at: [-28, -7], r: 0.7, h: 2, color: NEON.pink },
  { at: [-6, -12.6], r: 0.6, h: 1.8, color: NEON.cyan },
  { at: [-4.7, -13.6], r: 0.45, h: 1.3, color: NEON.yellow },
  { at: [-20, 6.5], r: 0.7, h: 2, color: NEON.yellow },
  { at: [-13.5, 17.5], r: 0.6, h: 1.8, color: NEON.cyan },
  { at: [-4.6, -4.6], r: 0.6, h: 1.8, color: NEON.pink }, // under the grid
  { at: [-4.6, 4.6], r: 0.6, h: 1.8, color: NEON.cyan },
  { at: [-40, 13], r: 0.65, h: 1.9, color: NEON.purple },
])
export const RESISTORS: Resistor[] = mirror<Resistor>([
  { at: [-30, 18], along: 'z' },
  { at: [-22, -4.5], along: 'x' },
  { at: [-12, -28.6], along: 'x' },
  { at: [-41, -20], along: 'z' },
])
export const SERVERS: Server[] = mirror<Server>([
  { at: [-22, 26.5], size: [2, 2.8, 2], color: NEON.cyan },
  { at: [-30, -27.4], size: [1.8, 2.8, 2.4], color: NEON.pink },
  { at: [-15, -4.5], size: [1.6, 2.4, 1.6], color: NEON.purple },
])

// ---------------------------------------------------------------------------------------------------------
// What can be caught and climbed: the tops of the cover and the decks, the stage, the grid's rails

function boxLedges(min: P3, max: P3): GrabEdge[] {
  const y = max[1]
  const at = (x: number, z: number) => ({ x, y, z })
  return [
    { kind: 'ledge', a: at(min[0], min[2]), b: at(max[0], min[2]), out: { x: 0, z: -1 } },
    { kind: 'ledge', a: at(min[0], max[2]), b: at(max[0], max[2]), out: { x: 0, z: 1 } },
    { kind: 'ledge', a: at(min[0], min[2]), b: at(min[0], max[2]), out: { x: -1, z: 0 } },
    { kind: 'ledge', a: at(max[0], min[2]), b: at(max[0], max[2]), out: { x: 1, z: 0 } },
  ]
}
const boxOf = (at: XZ, size: P3, y = 0): [P3, P3] => [
  [at[0] - size[0] / 2, y, at[1] - size[2] / 2],
  [at[0] + size[0] / 2, y + size[1], at[1] + size[2] / 2],
]

export const DECKS = [-1, 1].map((s) => ({
  min: [s > 0 ? DECK.x0 : -DECK.x1, DECK.top - DECK.thick, -GRID_HALF] as P3,
  max: [s > 0 ? DECK.x1 : -DECK.x0, DECK.top, GRID_HALF] as P3,
}))
export const RAILS = [-1, 1].map((s) => ({
  min: [-DECK.x0, GRID.top - RAIL.thick, s > 0 ? RAIL.z0 : -RAIL.z1] as P3,
  max: [DECK.x0, GRID.top, s > 0 ? RAIL.z1 : -RAIL.z0] as P3,
}))
export const STAGE_BOX: [P3, P3] = [
  [-STAGE.half, 0, STAGE.z0],
  [STAGE.half, STAGE.top, STAGE.z1],
]

export const EDGES: GrabEdge[] = [
  ...CHIPS.flatMap((c) => boxLedges(...boxOf(c.at, c.size, c.y))),
  ...SERVERS.flatMap((s) => boxLedges(...boxOf(s.at, s.size))),
  ...DECKS.flatMap((d) => boxLedges(d.min, d.max)),
  ...RAILS.flatMap((r) => boxLedges(r.min, r.max)).filter((e) => e.out.x === 0),
  ...boxLedges(...STAGE_BOX),
]

// ---------------------------------------------------------------------------------------------------------
// Lines of light on the floor: the border, the middle line, and traces like a circuit's between the pieces
// (west half; mirrored)

export type Trace = { points: XZ[]; color: string; pad?: boolean }
const WEST_TRACES: Trace[] = [
  {
    points: [
      [-37.6, -7],
      [-33, -7],
      [-29, -11],
      [-25, -11],
      [-21.5, -14.5],
      [-12, -14.5],
    ],
    color: NEON.cyan,
    pad: true,
  },
  {
    points: [
      [-37.6, 7],
      [-33, 7],
      [-29, 10.5],
      [-22, 10.5],
      [-19, 13.5],
      [-19, 16.5],
    ],
    color: NEON.purple,
    pad: true,
  },
  {
    points: [
      [-26.5, 3.4],
      [-14, 3.4],
      [-11.4, 6],
      [-11.4, 9.6],
    ],
    color: NEON.pink,
    pad: true,
  },
  {
    points: [
      [-26.5, -3.4],
      [-16.5, -3.4],
    ],
    color: NEON.yellow,
    pad: true,
  },
  {
    points: [
      [-49.2, -26.5],
      [-38, -26.5],
      [-34.7, -30.2],
      [-18, -30.2],
      [-15.5, -27.7],
      [-6, -27.7],
    ],
    color: NEON.yellow,
    pad: true,
  },
  {
    points: [
      [-49.2, 27],
      [-35, 27],
      [-31.6, 30.4],
      [-14, 30.4],
    ],
    color: NEON.cyan,
    pad: true,
  },
  {
    points: [
      [-44, 9],
      [-44, 16],
      [-36, 16],
      [-33, 19.5],
    ],
    color: NEON.pink,
    pad: true,
  },
  {
    points: [
      [-44, -10.5],
      [-44, -17],
      [-38, -17],
    ],
    color: NEON.purple,
    pad: true,
  },
  // The ring of the grid's shadow, and the border (inside the fence)
  {
    points: [
      [0, -10.2],
      [-7.2, -10.2],
      [-10.2, -7.2],
      [-10.2, 7.2],
      [-7.2, 10.2],
      [0, 10.2],
    ],
    color: NEON.yellow,
  },
  {
    points: [
      [0, -31.2],
      [-49.2, -31.2],
      [-49.2, 31.2],
      [0, 31.2],
    ],
    color: TEAM.west,
  },
]
const mirrorTrace = (t: Trace): Trace => ({
  ...t,
  points: t.points.map(([x, z]) => [-x, z] as XZ),
  color: t.color === TEAM.west ? TEAM.east : t.color,
})
export const TRACES: Trace[] = [...WEST_TRACES, ...WEST_TRACES.map(mirrorTrace)]
// The middle line, dashed
export const MID_DASHES: [XZ, XZ][] = Array.from({ length: 18 }, (_, i) => {
  const z = -31 + i * 3.5
  return [
    [0, z],
    [0, Math.min(z + 2, 31)],
  ]
})

// ---------------------------------------------------------------------------------------------------------
// The city round about (drawn in ../neon/scenery): kept clear of the arena

export const CITY_AREA: [number, number, number, number] = [-330, 330, -330, 330]
export const nearArena = (x: number, z: number, w: number) => Math.abs(x) - w / 2 < 64 && Math.abs(z) - w / 2 < 46
export const SKY_BALLOONS: P3[] = [
  [-62, 24, -70],
  [74, 30, -46],
  [-86, 32, 58],
  [52, 20, 88],
]
