import * as THREE from 'three'
import type { GrabEdge } from '../grab'
import type { Pick, RackLayout } from '../experimental/guns/GunDisplay'
import { THROW_KINDS } from '../experimental/guns/throwables/catalog'

// Brick Fort: a gun-fight arena on a floating island. Two bases face each other down its length (north +z,
// south -z), each a rounded lobe where its team starts behind cover: thick walls with a doorway, a hut to
// hide in, a tall tower to climb (by handholds) for a view over the whole island, a medium tower and the
// team's gun racks. The middle is left open, with the playground's small shapes scattered about to duck
// behind and a few medium pieces: arches with a bar to hang from, block platforms with a step up, low walls.
//
// Everything is laid out for the north half and turned half a turn round the middle for the south, so both
// sides are the same. Every top edge is taped and can be caught and climbed, like the Hang Lab.

export type P3 = [number, number, number]

// ---------------------------------------------------------------------------------------------------------
// The island's outline: an S-ish shape, the same when turned half a turn. Half of it, from the north tip down
// the +x side; the rest is that turned round. A smooth curve runs through the points.

const HALF_OUTLINE: [number, number][] = [
  [0, 38.8],
  [9, 37.5],
  [15, 33],
  [16, 26],
  [12, 20.5],
  [13.5, 15.5],
  [20, 10.5],
  [24.5, 3.5],
  [23.5, -3.5],
  [18.5, -9],
  [16.5, -15],
  [19, -21],
  [19.5, -28],
  [14, -34.5],
  [6, -38],
]
export const OUTLINE: [number, number][] = (() => {
  const points = [...HALF_OUTLINE, ...HALF_OUTLINE.map(([x, z]) => [-x, -z] as [number, number])]
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  )
  return curve.getSpacedPoints(160).slice(0, 160).map((p) => [p.x, p.z])
})()
export const THICKNESS = 2.5
export const FALL_Y = -15

// ---------------------------------------------------------------------------------------------------------
// Pieces

export type Box = { min: P3; max: P3; color: string; grab?: boolean } // grab: its top edges are taped ledges
export type Hold = { at: P3; out: [number, number]; color: string } // a handhold on a wall face
export type Bar = { a: P3; b: P3; posts?: boolean } // a bar to hang from (on posts of its own, or between walls)

// Colours: candy, with each team's own colour on its walls and pads (blue north, coral south)
const BLUE = '#3fa9f5'
const CORAL = '#ff5a5f'
const TEAM = BLUE

const NORTH_BOXES: Box[] = [
  // Walls across the front of the base, with a gap in the middle, and a low block in front of the gap
  { min: [-14, 0, 26.5], max: [-4, 2.6, 27.5], color: TEAM, grab: true },
  { min: [2.5, 0, 26.5], max: [8, 2.6, 27.5], color: TEAM, grab: true },
  { min: [-2.5, 0, 22.8], max: [1.5, 1.1, 23.8], color: '#ffd23f', grab: true },

  // The tall tower (climb its handholds from the spawn side), with a low wall round the edge facing the
  // middle to hide behind up there
  { min: [-18.2, 0, 23.5], max: [-14.4, 5.5, 27.3], color: '#9b7bff', grab: true },
  { min: [-18.2, 5.5, 23.5], max: [-14.4, 6.4, 23.9], color: '#ffffff' },

  // The medium tower, and a step up to it
  { min: [8.5, 0, 21.8], max: [12, 3.4, 25.3], color: '#4dd4ac', grab: true },
  { min: [6.6, 0, 21.8], max: [8.5, 1.6, 23.6], color: '#ffa94d', grab: true },

  // The hut: doorways front and back, a window on the side, a roof to climb onto
  { min: [-12.5, 0, 19.5], max: [-11.1, 2.6, 19.85], color: '#ff8fc8' },
  { min: [-9.5, 0, 19.5], max: [-8, 2.6, 19.85], color: '#ff8fc8' },
  { min: [-11.1, 2.2, 19.5], max: [-9.5, 2.6, 19.85], color: '#ff8fc8' },
  { min: [-12.5, 0, 23.65], max: [-11.1, 2.6, 24], color: '#ff8fc8' },
  { min: [-9.5, 0, 23.65], max: [-8, 2.6, 24], color: '#ff8fc8' },
  { min: [-11.1, 2.2, 23.65], max: [-9.5, 2.6, 24], color: '#ff8fc8' },
  { min: [-12.5, 0, 19.85], max: [-12.15, 2.6, 23.65], color: '#ff8fc8' },
  { min: [-8.35, 0, 19.85], max: [-8, 1.2, 23.65], color: '#ff8fc8' },
  { min: [-8.35, 2, 19.85], max: [-8, 2.6, 23.65], color: '#ff8fc8' },
  { min: [-8.35, 1.2, 19.85], max: [-8, 2, 21.1], color: '#ff8fc8' },
  { min: [-8.35, 1.2, 22.4], max: [-8, 2, 23.65], color: '#ff8fc8' },
  { min: [-12.7, 2.6, 19.3], max: [-7.8, 2.9, 24.2], color: '#ffd23f', grab: true },

  // Towards the middle: an arch (a bar underneath to hang from), a block platform with a step, a low wall
  { min: [-9.6, 0, 10.5], max: [-8.4, 3, 11.7], color: '#7b61ff' },
  { min: [-3.6, 0, 10.5], max: [-2.4, 3, 11.7], color: '#7b61ff' },
  { min: [-9.6, 3, 10.5], max: [-2.4, 3.5, 11.7], color: '#b7e04a', grab: true },
  { min: [10, 0, 2], max: [14, 2.4, 6], color: '#ffa94d', grab: true },
  { min: [14, 0, 2], max: [16, 1.2, 4], color: '#ffd23f', grab: true },
  { min: [-1.5, 0, 14], max: [1.5, 1.2, 14.8], color: '#4dd4ac', grab: true },
]

// Handholds up the tall tower's spawn-side face, then its top ledge
const NORTH_HOLDS: Hold[] = [
  { at: [-16.6, 2.2, 27.4], out: [0, 1], color: '#ff4fd8' },
  { at: [-16.0, 3.4, 27.4], out: [0, 1], color: '#ffd23f' },
  { at: [-16.6, 4.6, 27.4], out: [0, 1], color: '#3de8ff' },
]

const NORTH_BARS: Bar[] = [
  { a: [-8.4, 2.55, 11.1], b: [-3.6, 2.55, 11.1] }, // under the arch
  { a: [4.5, 2.8, 13], b: [7.5, 2.8, 13], posts: true }, // a pull-up bar
]

// Where the north team starts: two rows of four in front of its racks
const NORTH_SPAWNS: P3[] = [33, 35.2].flatMap((z) => [-6, -3.6, -1.2, 1.2].map((x) => [x, 1.3, z] as P3))

// ---------------------------------------------------------------------------------------------------------
// Turning the north half round for the south

const turn = ([x, y, z]: P3): P3 => [-x, y, -z]
const recolour = (c: string) => (c === BLUE ? CORAL : c)

export const BOXES: Box[] = [
  ...NORTH_BOXES,
  ...NORTH_BOXES.map((b) => ({ ...b, min: [-b.max[0], b.min[1], -b.max[2]] as P3, max: [-b.min[0], b.max[1], -b.min[2]] as P3, color: recolour(b.color) })),
]
export const HOLDS: Hold[] = [...NORTH_HOLDS, ...NORTH_HOLDS.map((h) => ({ ...h, at: turn(h.at), out: [-h.out[0], -h.out[1]] as [number, number] }))]
export const BARS: Bar[] = [...NORTH_BARS, ...NORTH_BARS.map((b) => ({ ...b, a: turn(b.a), b: turn(b.b) }))]
export const SPAWNS = { north: NORTH_SPAWNS, south: NORTH_SPAWNS.map(turn) }
export const TEAM_COLOURS = { north: BLUE, south: CORAL }
export const PLAYER_SPAWN: P3 = NORTH_SPAWNS[2]

// ---------------------------------------------------------------------------------------------------------
// What can be caught: every taped box's top edges, the handholds, the bars

export const HOLD_HALF = 0.18
const v = ([x, y, z]: P3) => ({ x, y, z })
function boxLedges({ min, max }: Box): GrabEdge[] {
  const y = max[1]
  return [
    { kind: 'ledge', a: v([min[0], y, max[2]]), b: v([max[0], y, max[2]]), out: { x: 0, z: 1 } },
    { kind: 'ledge', a: v([min[0], y, min[2]]), b: v([max[0], y, min[2]]), out: { x: 0, z: -1 } },
    { kind: 'ledge', a: v([max[0], y, min[2]]), b: v([max[0], y, max[2]]), out: { x: 1, z: 0 } },
    { kind: 'ledge', a: v([min[0], y, min[2]]), b: v([min[0], y, max[2]]), out: { x: -1, z: 0 } },
  ]
}
export const EDGES: GrabEdge[] = [
  ...BOXES.filter((b) => b.grab).flatMap(boxLedges),
  ...HOLDS.map((h): GrabEdge => {
    const [x, y, z] = h.at
    const [ox, oz] = h.out
    // A short grip across the face (perpendicular to `out`)
    return { kind: 'hold', a: { x: x - oz * HOLD_HALF, y, z: z - ox * HOLD_HALF }, b: { x: x + oz * HOLD_HALF, y, z: z + ox * HOLD_HALF }, out: { x: ox, z: oz } }
  }),
  ...BARS.map((b): GrabEdge => ({ kind: 'bar', a: v(b.a), b: v(b.b), out: { x: 0, z: 1 } })),
]
// The taped lips along the ledges (each a rod along the edge)
export const LIPS = EDGES.filter((e) => e.kind === 'ledge').map((e) => ({
  a: [e.a.x, e.a.y, e.a.z] as P3,
  b: [e.b.x, e.b.y, e.b.z] as P3,
}))
export const BAR_RODS = BARS.map((b) => ({ a: b.a, b: b.b }))

// ---------------------------------------------------------------------------------------------------------
// Guns: each base has a rack of guns behind its spawn, and a rack of throwables and the bomb launcher down
// its side. The rack's front faces its spawn.

const gun = (index: number, x: number) => ({ pick: { gun: index } as Pick, x })
const NORTH_RACKS: RackLayout[] = [
  { x: 0, z: 37.1, yaw: Math.PI, items: [gun(0, -3.8), gun(1, -1.9), gun(4, 0), gun(10, 1.9), gun(9, 4.1)] },
  {
    x: 12,
    z: 28.8,
    yaw: -Math.PI / 2,
    spacing: 1.5,
    items: [...THROW_KINDS.map((throwable, i) => ({ pick: { throwable } as Pick, x: (i - 1.5) * 1.5 })), gun(13, 1.5 * 1.5 + 1.75)],
  },
]
export const RACKS: RackLayout[] = [
  ...NORTH_RACKS,
  ...NORTH_RACKS.map((r) => ({ ...r, x: -r.x, z: -r.z, yaw: (r.yaw ?? 0) + Math.PI })),
]

// ---------------------------------------------------------------------------------------------------------
// The small shapes loose in the middle (like the playground's), in pairs half a turn apart

type Shape =
  | { kind: 'ball'; at: P3; color: string }
  | { kind: 'prism'; sides: number; at: P3; color: string }
  | { kind: 'cylinder'; at: P3; color: string; lying?: boolean }
  | { kind: 'cone'; at: P3; color: string }
const NORTH_SHAPES: Shape[] = [
  { kind: 'ball', at: [-5, 1, 4], color: '#4dd4ac' },
  { kind: 'prism', sides: 3, at: [2, 1, 6], color: '#7b61ff' },
  { kind: 'prism', sides: 6, at: [7, 1, 7.5], color: '#3fa9f5' },
  { kind: 'prism', sides: 4, at: [-2, 1, 9], color: '#ffd23f' },
  { kind: 'cylinder', at: [-3, 1, 1], color: '#ff5a5f' },
  { kind: 'cylinder', at: [-12, 1, 8], color: '#ffa94d', lying: true },
  { kind: 'cone', at: [-8, 1.5, 1], color: '#b7e04a' },
]
export const SHAPES: Shape[] = [...NORTH_SHAPES, ...NORTH_SHAPES.map((s) => ({ ...s, at: turn(s.at) }))]
