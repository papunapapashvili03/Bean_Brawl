import type { GrabEdge } from '../grab'
import type { Pick, RackLayout } from '../experimental/guns/GunDisplay'
import { THROW_KINDS } from '../experimental/guns/throwables/catalog'
import { box, buildingPieces, door, pieceLedges, stairs, window, type Building, type Hull, type P3, type Piece, type Ramp, type Zone } from '../maps/kit'
import type { MatKey } from '../maps/textures'

// Hillside: a walled hillside compound for gunfights, laid out after a top-view sketch. North, a turning
// circle round a fountain with a rust-red spiral sculpture, hemmed by a curved low wall. In the middle, the
// villa: rooms you can run through, big glass openings on the court, outside stairs up to a roof terrace with
// a glass pavilion. West, the pool house and the garden (one team's start). East, a long two-storey brick
// building with stairs inside and windows over the centre lane, a garage, and a courtyard with a reflecting
// pool (the other team's start). South, a street of parked cars with a statue, lamp posts and power lines,
// and a stone gateway into the back alley. Crates, barriers, planters and dumpsters for cover; flat roofs
// you can reach by stairs or a jump.
//
// +x is east, +z south. Buildings are 3.4 m a floor.

// ---------------------------------------------------------------------------------------------------------
// The boundary: an irregular, stepped outline (walled all round)

export const OUTLINE: [number, number][] = [
  [-33, -17],
  [-24, -23],
  [-12, -23],
  [-12, -29],
  [-0.6, -37.4],
  [28, -37.4],
  [28, -20],
  [36, -20],
  [36, 5],
  [42.6, 5],
  [42.6, 13],
  [36, 13],
  [36, 17],
  [21, 17],
  [21, 36],
  [-7, 36],
  [-7, 30],
  [-32, 30],
  [-41.6, 13],
  [-41.6, -6],
]

// Ground: what's laid where (drawn in this order, each over the last)
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]
export const COURT = { centre: [3, -19] as [number, number], inner: 5, outer: 9.5 }
export const ZONES: Zone[] = [
  { mat: 'grass', outline: [[-40.8, -6.5], [-33, -16.3], [-28, -16.3], [-28, 13.2], [-40.8, 12.8]] },
  { mat: 'grass', outline: rect(-10, -36.5, 27.2, -32.5) },
  { mat: 'asphalt', outline: rect(10, -24.5, 28, -18.8) },
  { mat: 'asphalt', outline: rect(17, -25, 27, -18.8) },
  { mat: 'asphalt', outline: rect(7.2, -10, 19, 6.2) },
  { mat: 'asphalt', outline: rect(16.2, 6, 19, 23) },
  { mat: 'asphalt', outline: rect(-7, 22.5, 11, 35.8) },
  { mat: 'asphalt', outline: rect(-7, 33.2, 21, 35.8) },
  { mat: 'asphalt', ring: { centre: COURT.centre, r0: COURT.inner, r1: COURT.outer } },
  { mat: 'gravel', ring: { centre: COURT.centre, r0: 0, r1: COURT.inner } },
  { mat: 'stone', outline: rect(-32, 25.3, -8.5, 29.8) },
]

// ---------------------------------------------------------------------------------------------------------
// Buildings

const VILLA: Building = {
  min: [-12, -8.5],
  max: [7, 6.5],
  floors: 1,
  wall: 'stucco',
  floorMat: 'wood',
  roof: 'flat',
  parapet: 0.9,
  parapetGaps: [{ side: 'e', at: 6, width: 2 }],
  grabParapet: true,
  openings: [
    // Big glass openings onto the court, framed by mullions (below)
    { side: 'n', at: 11, width: 6, bottom: 0, top: 2.8 },
    window('n', 2.5),
    window('n', 16.5),
    door('s', 4),
    window('s', 9),
    window('s', 14),
    door('w', 6.5),
    window('w', 11.5),
    door('e', 3),
    window('e', 11.5),
  ],
  partitions: [{ a: [-5, -8.2], b: [-5, 6.2], doors: [3, 8.2] }],
}
// The glass pavilion on the villa's roof terrace
const PAVILION: Building = {
  min: [-4, -8.5],
  max: [6, -3.5],
  base: 3.6,
  height: 2.9,
  floors: 1,
  wall: 'wood',
  floorMat: 'paving',
  roof: 'flat',
  roofMat: 'concrete',
  openings: [
    { side: 'n', at: 5, width: 8, bottom: 0.9, top: 2.5 },
    door('s', 5),
    window('w', 2.5),
    door('e', 2.5),
  ],
}
const POOL_HOUSE: Building = {
  min: [-27, -11],
  max: [-16, 1],
  floors: 1,
  wall: 'stucco',
  roof: 'flat',
  parapet: 0.6,
  openings: [door('e', 4), window('e', 9), door('s', 2.5), window('n', 3), window('n', 8), door('w', 6), window('w', 2)],
}
const TOWER_BLOCK: Building = { min: [-22, 1], max: [-16, 12], floors: 2, solid: true, wall: 'concrete', roof: 'flat', parapet: 0.8 }
const WEST_BLOCK: Building = {
  min: [-26, 15],
  max: [-16, 25],
  floors: 1,
  solid: true,
  wall: 'stucco',
  roof: 'flat',
  parapet: 0.9,
  grabParapet: true,
  parapetGaps: [{ side: 'e', at: 1.5, width: 2 }],
}
const SHOP: Building = {
  min: [-12, 14],
  max: [-1, 21],
  floors: 1,
  wall: 'brick',
  roof: 'flat',
  parapet: 0.7,
  openings: [door('n', 5.5), window('n', 2), window('n', 9), door('s', 5.5), window('s', 2), window('s', 9), window('w', 3.5), window('e', 3.5)],
}
const WORKSHOP: Building = { min: [8, 6.5], max: [16, 19], floors: 1, solid: true, wall: 'concrete', roof: 'flat', parapet: 0.8, grabParapet: true, windowsEvery: 2.8 }
const BRICK_HALL: Building = {
  min: [19, -18.5],
  max: [30, 6],
  floors: 2,
  wall: 'brick',
  floorMat: 'wood',
  roof: 'pitched',
  openings: [
    door('w', 6.5),
    door('w', 19.5),
    window('w', 2.5),
    window('w', 12.5),
    window('w', 16),
    door('n', 5.5),
    door('s', 3),
    window('s', 8),
    window('e', 8.5),
    window('e', 18.5),
    window('w', 3.5, 1),
    window('w', 9.5, 1),
    window('w', 15.5, 1),
    window('w', 21.5, 1),
    window('n', 5.5, 1),
    window('s', 5.5, 1),
    window('e', 6.5, 1),
    window('e', 16.5, 1),
  ],
  stairwells: [{ floor: 1, min: [27.8, -10.7], max: [29.7, -1.8] }],
  partitions: [
    { a: [19.3, -6], b: [27.7, -6], doors: [3.2] },
    { a: [19.3, -6], b: [27.7, -6], floor: 1, doors: [3.2] },
  ],
}
const GARAGE: Building = {
  min: [17, -35],
  max: [27, -25],
  floors: 1,
  height: 3.6,
  wall: 'concrete',
  roof: 'flat',
  parapet: 0.6,
  openings: [{ side: 's', at: 5, width: 8, bottom: 0, top: 3 }, door('w', 5), window('n', 3), window('n', 7)],
}
const BRICK_HOUSE: Building = { min: [11, 22.5], max: [21, 33], floors: 2, solid: true, wall: 'brick', roof: 'pitched', windowsEvery: 2.6 }
const BELL_TOWER: Building = { min: [16.5, 22.5], max: [20.5, 26.5], floors: 3, solid: true, wall: 'brick', roof: 'pitched', windowsEvery: 2 }

const BUILDINGS = [VILLA, PAVILION, POOL_HOUSE, TOWER_BLOCK, WEST_BLOCK, SHOP, WORKSHOP, BRICK_HALL, GARAGE, BRICK_HOUSE, BELL_TOWER]

// ---------------------------------------------------------------------------------------------------------
// Everything made of blocks: buildings, stairs, the walls round the edge, low walls and cover

const pieces: Piece[] = []
const ramps: Ramp[] = []
const hulls: Hull[] = []
for (const b of BUILDINGS) {
  const built = buildingPieces(b)
  pieces.push(...built.pieces)
  hulls.push(...built.hulls)
}
const addStairs = (s: ReturnType<typeof stairs>) => {
  pieces.push(...s.pieces)
  ramps.push(s.ramp)
}

// Up to the villa's roof: outside stairs along its east wall, and a landing at the top
addStairs(stairs([8.1, 6.2], [8.1, -1.5], 0, 3.6, 1.6, 'concrete'))
pieces.push(box([7, 0, -3.5], [8.9, 3.6, -1.5], 'concrete'))
// Mullions across the villa's glass openings (north front and the pavilion)
for (const x of [-2.5, -1, 0.5]) pieces.push(box([x - 0.05, 0, -8.5], [x + 0.05, 2.8, -8.2], 'darkFrame'))
pieces.push(box([-4, 2.75, -8.5], [2, 2.85, -8.2], 'darkFrame', { solid: false }))
for (const x of [-1, 1, 3]) pieces.push(box([x - 0.04, 4.5, -8.5], [x + 0.04, 6.1, -8.2], 'darkFrame'))
// Up to the west block's roof: stairs along its east side, and a landing
addStairs(stairs([-15.2, 24.8], [-15.2, 17.5], 0, 3.6, 1.6, 'concrete'))
pieces.push(box([-16, 0, 15.5], [-14.4, 3.6, 17.5], 'concrete'))
// Stairs inside the brick hall, up its east wall to the upper floor
addStairs(stairs([28.7, -2], [28.7, -10.5], 0, 3.4, 1.6, 'wood'))

// The walls round the edge, just outside it
const EDGE_WALL = { height: 3.2, thick: 0.6 }
export function insideOutline(x: number, z: number) {
  let hit = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, zi] = OUTLINE[i]
    const [xj, zj] = OUTLINE[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}
OUTLINE.forEach(([x0, z0], i) => {
  const [x1, z1] = OUTLINE[(i + 1) % OUTLINE.length]
  const len = Math.hypot(x1 - x0, z1 - z0)
  const dx = (x1 - x0) / len
  const dz = (z1 - z0) / len
  // Outward: whichever side of the edge is outside the outline
  let [nx, nz] = [dz, -dx]
  if (insideOutline((x0 + x1) / 2 + nx * 0.5, (z0 + z1) / 2 + nz * 0.5)) [nx, nz] = [-nx, -nz]
  const t = EDGE_WALL.thick / 2
  const centre: P3 = [(x0 + x1) / 2 + nx * t, EDGE_WALL.height / 2, (z0 + z1) / 2 + nz * t]
  const mat: MatKey = i % 3 === 0 ? 'stone' : i % 3 === 1 ? 'concrete' : 'stucco'
  pieces.push({ centre, size: [len + EDGE_WALL.thick, EDGE_WALL.height, EDGE_WALL.thick], rotY: -Math.atan2(dz, dx), mat })
  pieces.push({ centre: [centre[0], EDGE_WALL.height + 0.08, centre[2]], size: [len + EDGE_WALL.thick + 0.1, 0.16, EDGE_WALL.thick + 0.12], rotY: -Math.atan2(dz, dx), mat: 'concreteDark', solid: false })
})

// A wall bent round in segments: centre, radii across and along, angle range (degrees), gaps (degrees)
function curvedWall(centre: [number, number], rx: number, rz: number, a0: number, a1: number, height: number, thick: number, mat: MatKey, gaps: number[]) {
  const steps = Math.ceil(((a1 - a0) * Math.max(rx, rz) * Math.PI) / 180 / 1.6)
  for (let k = 0; k < steps; k++) {
    const u0 = a0 + ((a1 - a0) * k) / steps
    const u1 = a0 + ((a1 - a0) * (k + 1)) / steps
    const mid = (u0 + u1) / 2
    if (gaps.some((g) => Math.abs(g - mid) < 6)) continue
    const p0 = [centre[0] + rx * Math.cos((u0 * Math.PI) / 180), centre[1] + rz * Math.sin((u0 * Math.PI) / 180)]
    const p1 = [centre[0] + rx * Math.cos((u1 * Math.PI) / 180), centre[1] + rz * Math.sin((u1 * Math.PI) / 180)]
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    pieces.push({
      centre: [(p0[0] + p1[0]) / 2, height / 2, (p0[1] + p1[1]) / 2],
      size: [len + 0.1, height, thick],
      rotY: -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]),
      mat,
      grab: true,
    })
  }
}
// The low wall curving round the court's north and west
curvedWall(COURT.centre, 12.3, 12.3, 150, 345, 1.1, 0.5, 'concrete', [205, 300])
// The oval garden wall in the west
curvedWall([-35.5, -8], 4.5, 4, 0, 360, 1, 0.45, 'stone', [90, 270])

// Cover: concrete cube planters, crates, barriers, dumpsters, the pool's rim, garden planters, benches
const cube = (x: number, z: number, s = 1.3, mat: MatKey = 'concrete') => pieces.push(box([x - s / 2, 0, z - s / 2], [x + s / 2, s, z + s / 2], mat, { grab: true }))
const crate = (x: number, z: number, y = 0, s = 1.1) => pieces.push(box([x - s / 2, y, z - s / 2], [x + s / 2, y + s, z + s / 2], 'wood', { grab: true }))
export const PLANTERS: [number, number][] = [
  [-6, -12.5],
  [-4.5, -24.5],
  [11.5, -26],
  [13, -13.5],
  [-8.2, -10.2],
  [5.8, -10.2],
  [-32, 3],
  [-30, 10.5],
]
for (const [x, z] of PLANTERS) cube(x, z)
crate(10.2, 3.6)
crate(11.4, 3.6)
crate(10.8, 3.6, 1.1)
crate(-21.2, 27.8)
crate(-20, 28.4)
crate(38.2, 7.2)
crate(40.6, 11)
crate(40.6, 11, 1.1)
crate(24, -21.5)
crate(25.2, -21.2)
const barrier = (x: number, z: number, rotY: number) => pieces.push({ centre: [x, 0.42, z], size: [2.2, 0.84, 0.6], rotY, mat: 'concrete', grab: true })
barrier(11, -3.5, 0.3)
barrier(15.8, 1.8, -0.2)
barrier(3, 24.2, 0)
barrier(-26, 5, Math.PI / 2)
pieces.push(box([16.05, 0, 11], [17.45, 1.35, 13], 'metal', { grab: true })) // dumpster against the workshop
pieces.push(box([-13.2, 0, 26], [-11.8, 1.35, 28], 'metal', { grab: true }))
// The reflecting pool's rim (the water is drawn in ./Props)
export const POOL = { min: [21, 9.5] as [number, number], max: [27, 13], rim: 0.4 }
pieces.push(
  box([POOL.min[0], 0, POOL.min[1]], [POOL.max[0], POOL.rim, POOL.min[1] + 0.3], 'stone', { grab: true }),
  box([POOL.min[0], 0, POOL.max[1] - 0.3], [POOL.max[0], POOL.rim, POOL.max[1]], 'stone', { grab: true }),
  box([POOL.min[0], 0, POOL.min[1] + 0.3], [POOL.min[0] + 0.3, POOL.rim, POOL.max[1] - 0.3], 'stone', { grab: true }),
  box([POOL.max[0] - 0.3, 0, POOL.min[1] + 0.3], [POOL.max[0], POOL.rim, POOL.max[1] - 0.3], 'stone', { grab: true }),
)
pieces.push(box([22, 0, 14.2], [25, 0.45, 14.8], 'stone'), box([22, 0, 7.7], [25, 0.45, 8.3], 'stone'))
// The wall across the back alley, with the stone gateway in it (its arch is drawn in ./Props)
export const GATE = { x: -8.5, z0: 25.6, z1: 29.6, opening: [26.6, 28.6] as [number, number], height: 3.4 }
pieces.push(
  box([GATE.x - 0.4, 0, 21.2], [GATE.x + 0.4, 2.6, GATE.z0], 'stone'),
  box([GATE.x - 0.6, 0, GATE.z0], [GATE.x + 0.6, GATE.height, GATE.opening[0]], 'stone'),
  box([GATE.x - 0.6, 0, GATE.opening[1]], [GATE.x + 0.6, GATE.height, GATE.z1], 'stone'),
  box([GATE.x - 0.4, 0, GATE.z1], [GATE.x + 0.4, 2.6, 30.2], 'stone'),
  box([GATE.x - 0.6, GATE.height, GATE.z0], [GATE.x + 0.6, GATE.height + 0.7, GATE.z1], 'stone'),
)
// Furniture: cover indoors
pieces.push(
  // Villa: kitchen counter and island in the west room; sofa, coffee table and dining table in the east room
  box([-11.7, 0, -7.6], [-11, 0.95, -3.6], 'stone'),
  box([-9.6, 0, 1], [-7.6, 0.95, 3.4], 'stone'),
  box([-1.2, 0, 4.8], [3, 0.8, 5.9], 'fabric'),
  box([2.2, 0, 2.6], [3, 0.8, 5.9], 'fabric'),
  box([-0.2, 0, 2.3], [1.4, 0.45, 3.3], 'wood'),
  box([2, 0, -6.4], [5, 0.78, -4.6], 'wood'),
  // Pool house bar
  box([-21, 0, -10.4], [-17.5, 1.05, -9.6], 'wood'),
  // Shop: a display counter along the west wall, a till counter
  box([-11.6, 0, 15], [-11, 0.95, 20], 'wood'),
  box([-5, 0, 17], [-2, 1, 18], 'wood'),
  // Brick hall: tables and crates downstairs, a desk and cabinets upstairs by the windows
  box([21, 0, 0.2], [23, 0.8, 2.2], 'wood'),
  box([25.4, 0, 2.6], [26.5, 1.1, 3.7], 'wood'),
  box([19.4, 3.4, -14], [20.2, 4.4, -11.5], 'wood'),
  box([19.4, 3.4, -1.2], [20.2, 4.9, 0.3], 'metal'),
  // Garage workbench
  box([17.4, 0, -34.5], [18.1, 0.95, -31], 'metal'),
)

// Roof clutter: air conditioning units and a water tank
pieces.push(
  box([10, 3.6, 9], [11.4, 4.5, 10.2], 'metal'),
  box([12.5, 3.6, 14], [13.9, 4.5, 15.2], 'metal'),
  box([-20.5, 7, 3], [-18.5, 8.2, 5], 'metal'),
  box([-24, 3.6, -9], [-22.6, 4.4, -7.8], 'metal'),
)

export const PIECES = pieces
export const RAMPS = ramps
export const HULLS = hulls
export const EDGES: GrabEdge[] = pieces.filter((p) => p.grab).flatMap(pieceLedges)

// ---------------------------------------------------------------------------------------------------------
// Things drawn in ./Props: trees, palms, lamps, poles, the fountain, the statue, cars, solar panels

export const FOUNTAIN = { centre: COURT.centre, radius: 3, height: 1.3 }
export const STATUE: [number, number] = [-3, 26.2]
export const PALMS: [number, number][] = [
  [-8.5, -26.5],
  [15.5, -28],
  [1, -34.5],
  [-38.8, -3.5],
  [-30.5, -14.8],
  [-39.5, 14],
  [-29.5, 18],
  [-6, 34.2],
  [35.5, 14.2],
  [33.8, -18],
  [9.5, -34.5],
  [-18, -18.5],
]
export const TREES: [number, number][] = [
  [-26, -19.5],
  [23, -36],
  [-2, -30],
  [-12, 32.5],
  [19.7, 15.5],
]
export const LAMPS: [number, number][] = [
  [-5.8, 23.4],
  [9.8, 23.4],
  [19.8, 34.8],
  [9.2, -13],
  [-3.5, -27.5],
  [17.6, -2],
]
export const POLES: [number, number][] = [
  [-4.5, 35.3],
  [5.5, 35.3],
  [15.5, 35.3],
]
// Pink-flowered hedges along walls
export const HEDGES: { min: [number, number]; max: [number, number] }[] = [
  { min: [-13.1, -7], max: [-12.3, -3.5] },
  { min: [-13.1, 0], max: [-12.3, 3] },
  { min: [-1, -36.8], max: [9, -36] },
]
export type Parked = { model: 'yugo' | 'fiesta' | 'mustang' | 'jetta' | 'caravan'; at: [number, number]; yaw: number }
export const PARKED: Parked[] = [
  { model: 'caravan', at: [-3.8, -26.5], yaw: 0.9 },
  { model: 'mustang', at: [22, -30.5], yaw: -Math.PI / 2 },
  { model: 'jetta', at: [4, 31.8], yaw: 0 },
  { model: 'yugo', at: [13.6, -6.8], yaw: Math.PI / 2 },
  { model: 'fiesta', at: [-24, 27.5], yaw: Math.PI },
]
// Solar panels on the pool house roof
export const SOLAR = { min: [-26, -10] as [number, number], max: [-18, -5] as [number, number], y: 3.6 }

// ---------------------------------------------------------------------------------------------------------
// The two teams' starts and their gun racks

export const SPAWNS = {
  west: [3.5, 5.7, 7.9, 10.1].flatMap((z) => [-38.4, -36.2].map((x) => [x, 1.3, z] as P3)),
  east: [...[10, 11.8, 13.6].flatMap((z) => [31.5, 33.5].map((x) => [x, 1.3, z] as P3)), [38.6, 1.3, 9] as P3, [38.6, 1.3, 11] as P3],
}
export const PLAYER_SPAWN: P3 = SPAWNS.west[3]
export const TEAM_COLOURS = { west: '#3f7fd6', east: '#d6533f' }

const gun = (index: number, x: number) => ({ pick: { gun: index } as Pick, x })
const GUNS = [gun(0, -3.8), gun(2, -1.9), gun(7, 0), gun(11, 1.9), gun(9, 4.1)]
const EXPLOSIVES = [...THROW_KINDS.map((throwable, i) => ({ pick: { throwable } as Pick, x: (i - 1.5) * 1.5 })), gun(13, 1.5 * 1.5 + 1.75)]
export const RACKS: RackLayout[] = [
  { x: -40.4, z: 6.8, yaw: Math.PI / 2, items: GUNS },
  { x: -35.5, z: -1.2, yaw: 0, spacing: 1.5, items: EXPLOSIVES },
  { x: 30, z: 16.1, yaw: Math.PI, items: GUNS },
  { x: 31.4, z: 8.2, yaw: 0, spacing: 1.5, items: EXPLOSIVES },
]
