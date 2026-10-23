import type { Pick, RackLayout } from '../experimental/guns/GunDisplay'
import { THROW_KINDS } from '../experimental/guns/throwables/catalog'
import type { GrabEdge } from '../grab'
import { box, buildingPieces, door, pieceLedges, placed, stairs, window, type Building, type Hull, type P3, type Piece, type Ramp, type Zone } from '../maps/kit'
import type { MatKey } from '../maps/textures'

// Suburb: a little desert cul-de-sac for gunfights, laid out after a top-view sketch. The teams start in the
// back yards at the west and east ends. In front of each start, a two-storey house, set at an angle to the
// street: west, a yellow stucco house with an orange deck up its side to a balcony door, a garage on its south
// side; east, a teal house in lap siding with a chimney, a deck and stairs up its back, a one-storey room on
// its south side. Both have rooms on two floors (stairs inside), a porch roof over the front door you can
// climb onto, and flat roofs on the side rooms you can climb onto from the ground. In the middle, the turning
// circle with its street lamps and the cars: a bus across the mouth of the street, a pickup, a minivan, a
// saloon and a muscle car, a little hatchback in the yellow house's drive. Sheds, low yard fences, barriers
// and air conditioners for cover; a tall board fence all round.
//
// +x is east, +z south. Floors are 3.4 m.

// ---------------------------------------------------------------------------------------------------------
// The boundary (fenced all round)

export const OUTLINE: [number, number][] = [
  [-34.8, -18.9],
  [-13.5, -11.1],
  [-7.8, -14.7],
  [-7.2, -12.9],
  [0.9, -17.1],
  [10.2, -13.2],
  [10.8, -14.7],
  [15.0, -12.9],
  [35.4, -18.3],
  [39.0, -6.9],
  [42.0, -7.8],
  [46.2, 4.5],
  [14.1, 12.6],
  [13.5, 10.8],
  [8.1, 12.3],
  [8.1, 20.7],
  [-5.7, 21.0],
  [-5.7, 13.2],
  [-12.3, 10.8],
  [-13.5, 13.8],
  [-40.8, 4.8],
  [-45.9, 3.3],
  [-41.4, -11.1],
  [-37.8, -11.4],
]

export function insideOutline(x: number, z: number) {
  let hit = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, zi] = OUTLINE[i]
    const [xj, zj] = OUTLINE[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

// A building's own frame (built round (0, 0)) to the world: turned by `turn`, moved to `at`
const frame = (at: [number, number], turn: number) => {
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  return (x: number, z: number): [number, number] => [at[0] + x * c + z * s, at[1] - x * s + z * c]
}
export const YELLOW = { at: [-15.3, -3] as [number, number], turn: -0.345 }
export const TEAL = { at: [18.6, -0.9] as [number, number], turn: 0.223 }
const yellow = frame(YELLOW.at, YELLOW.turn)
const teal = frame(TEAL.at, TEAL.turn)

// The turning circle at the end of the street, and the street running off south
export const CIRCLE = { centre: [1.2, -1.5] as [number, number], road: 8.5, walk: 10 }
export const STREET = { x0: -3.3, x1: 5.7, z1: 20.8, walk: 1.7 }

// ---------------------------------------------------------------------------------------------------------
// Ground: dry grass, dirt in the back yards, the street, pavements and drives

const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]
const quad = (to: (x: number, z: number) => [number, number], x0: number, z0: number, x1: number, z1: number) => rect(x0, z0, x1, z1).map(([x, z]) => to(x, z))

export const ZONES: Zone[] = [
  {
    mat: 'dirt',
    outline: [
      [-45.5, 3.1],
      [-41.3, -10.9],
      [-31, -10.9],
      [-27.5, -3],
      [-31, 5.5],
      [-40.7, 4.6],
    ],
  },
  {
    mat: 'dirt',
    outline: [
      [45.9, 4.4],
      [41.9, -7.4],
      [38.9, -6.5],
      [37.2, -12],
      [32, -11],
      [29.5, -3],
      [31, 7.6],
    ],
  },
  { mat: 'paving', ring: { centre: CIRCLE.centre, r0: CIRCLE.road, r1: CIRCLE.walk } },
  { mat: 'paving', outline: rect(STREET.x0 - STREET.walk, 6, STREET.x1 + STREET.walk, STREET.z1) },
  { mat: 'asphalt', outline: rect(STREET.x0, 5, STREET.x1, STREET.z1) },
  { mat: 'asphalt', ring: { centre: CIRCLE.centre, r0: 0, r1: CIRCLE.road } },
  // The yellow house's drive, and paths to both front doors
  { mat: 'concrete', outline: quad(yellow, 3, 7, 9.8, 11.5) },
  { mat: 'paving', outline: quad(yellow, 9, 0.9, 10.6, 2.1) },
  { mat: 'paving', outline: quad(teal, -10.8, -0.6, -9, 0.6) },
]

// ---------------------------------------------------------------------------------------------------------
// The houses, each in its own frame (+x towards its front for the yellow house, its back for the teal one)

// Yellow house: 14 x 12 m. Downstairs a living room (west) and kitchen (east, the front door onto the street);
// stairs up the north wall; upstairs two bedrooms, a door out onto the balcony on the west.
const YELLOW_HOUSE: Building = {
  min: [-7, -6],
  max: [7, 6],
  floors: 2,
  wall: 'stuccoYellow',
  floorMat: 'wood',
  roof: 'pitched',
  roofMat: 'roofTile',
  trim: 'trim',
  openings: [
    door('e', 7.5),
    window('e', 2.5),
    window('e', 10.5),
    door('w', 7),
    window('w', 2.5),
    window('n', 11),
    door('s', 5.5),
    window('s', 1.5),
    window('s', 11.5),
    window('e', 2.5, 1),
    window('e', 6.5, 1),
    window('e', 10.5, 1),
    door('w', 5.5, 1),
    window('w', 9.5, 1),
    window('n', 3, 1),
    window('n', 11, 1),
    window('s', 3, 1),
    window('s', 11, 1),
  ],
  stairwells: [{ floor: 1, min: [-4, -5.7], max: [0.5, -4.2] }],
  partitions: [
    { a: [1.5, -5.7], b: [1.5, 5.7], doors: [3.7, 9.2] },
    { a: [1.5, -5.7], b: [1.5, 5.7], floor: 1, doors: [5.7] },
  ],
}
// Its garage on the south side: a wide door onto the drive, a door into the house, one out the back
const YELLOW_GARAGE: Building = {
  min: [-4, 6],
  max: [3, 13],
  floors: 1,
  height: 3,
  wall: 'stuccoYellow',
  floorMat: 'concrete',
  roof: 'flat',
  roofMat: 'roofGravel',
  grabRoof: true,
  trim: 'trim',
  openings: [{ side: 'e', at: 3.5, width: 4.5, bottom: 0, top: 2.5 }, door('n', 2.5), door('w', 3.5), window('s', 3.5)],
}
const YELLOW_FLIGHTS = [
  stairs([-5.5, -4.95], [0.5, -4.95], 0, 3.4, 1.4, 'wood'), // inside, up the north wall
  stairs([-8.2, 9.2], [-8.2, 2], 0, 3.4, 1.6, 'deckWood'), // outside, up to the balcony
]
const YELLOW_EXTRAS: Piece[] = [
  // The rail round the stairwell upstairs
  box([-4, 3.4, -4.32], [0.3, 4.4, -4.14], 'trim'),
  // The balcony on the west, on two posts, railed on its open sides
  box([-9.4, 3.1, -3], [-7, 3.4, 2], 'deckWood'),
  box([-9.4, 0, -3], [-9.1, 3.1, -2.7], 'deckWood'),
  box([-9.4, 0, 1.7], [-9.1, 3.1, 2], 'deckWood'),
  box([-9.4, 3.4, -3], [-9.25, 4.4, 2], 'deckWood'),
  box([-9.4, 3.4, -3], [-7, 4.4, -2.85], 'deckWood'),
  // The porch roof over the front door
  box([7, 2.7, -0.5], [9, 2.9, 3.5], 'trim', { grab: true }),
  box([8.75, 0, -0.4], [8.95, 2.7, -0.2], 'trim'),
  box([8.75, 0, 3.2], [8.95, 2.7, 3.4], 'trim'),
  // An air conditioner by the north wall
  box([2.4, 0, -7.1], [3.4, 0.9, -6.1], 'metal', { grab: true }),
  // Furniture: kitchen counter and table, sofa; upstairs a bed and a chest of drawers; a garage workbench
  box([2, 0, -5.7], [6, 0.95, -5], 'stone'),
  box([3.5, 0, -2.6], [5, 0.78, -1], 'wood'),
  box([-5.5, 0, 3], [-2.5, 0.8, 4], 'fabric'),
  box([3.5, 3.4, 2.5], [6.5, 3.95, 5.5], 'fabric'),
  box([-6.5, 3.4, 5.2], [-5, 4.6, 5.7], 'wood'),
  box([-3.7, 0, 11.8], [-1, 0.95, 12.7], 'metal'),
]

// Teal house: 14 x 13 m. Downstairs a living room (west, the front door onto the street) and kitchen (east, a
// door out to the back yard); stairs up the south wall; upstairs two bedrooms, a door out onto the deck.
const TEAL_HOUSE: Building = {
  min: [-7, -6.5],
  max: [7, 6.5],
  floors: 2,
  wall: 'siding',
  floorMat: 'wood',
  roof: 'pitched',
  roofMat: 'shingle',
  trim: 'trim',
  openings: [
    door('w', 6.5),
    window('w', 3),
    window('w', 10),
    door('e', 4.5),
    window('n', 3),
    window('n', 11.5),
    door('s', 3.5),
    window('w', 3, 1),
    window('w', 6.5, 1),
    window('w', 10, 1),
    door('e', 4, 1),
    window('e', 9.5, 1),
    window('n', 3, 1),
    window('n', 12, 1),
    window('s', 3, 1),
    window('s', 9.5, 1),
  ],
  stairwells: [{ floor: 1, min: [-0.5, 4.7], max: [3.5, 6.2] }],
  partitions: [
    { a: [-1.5, -6.2], b: [-1.5, 6.2], doors: [3.7, 9.2] },
    { a: [-1.5, -6.2], b: [-1.5, 6.2], floor: 1, doors: [5.5] },
  ],
}
// Its one-storey room on the south side, with doors all round
const TEAL_ROOM: Building = {
  min: [-6, 6.5],
  max: [3, 10],
  floors: 1,
  height: 3,
  wall: 'siding',
  floorMat: 'wood',
  roof: 'flat',
  roofMat: 'roofGravel',
  grabRoof: true,
  trim: 'trim',
  openings: [door('n', 2.5), door('w', 1.75), door('e', 1.75), window('s', 2.5), window('s', 6.5)],
}
const TEAL_FLIGHTS = [
  stairs([5.5, 5.45], [-0.5, 5.45], 0, 3.4, 1.4, 'wood'), // inside, up the south wall
  stairs([8.3, 7], [8.3, 0], 0, 3.4, 1.6, 'deckWood'), // outside, up to the deck
]
const TEAL_EXTRAS: Piece[] = [
  box([-0.3, 3.4, 4.53], [3.5, 4.4, 4.71], 'trim'),
  // The deck on the east, on two posts
  box([7, 3.1, -5], [9.6, 3.4, 0], 'deckWood'),
  box([9.3, 0, -5], [9.6, 3.1, -4.7], 'deckWood'),
  box([9.3, 0, -0.3], [9.6, 3.1, 0], 'deckWood'),
  box([9.45, 3.4, -5], [9.6, 4.4, 0], 'deckWood'),
  box([7, 3.4, -5], [9.6, 4.4, -4.85], 'deckWood'),
  // The porch roof over the front door
  box([-9, 2.7, -2], [-7, 2.9, 2], 'trim', { grab: true }),
  box([-8.95, 0, -1.9], [-8.75, 2.7, -1.7], 'trim'),
  box([-8.95, 0, 1.7], [-8.75, 2.7, 1.9], 'trim'),
  // The brick chimney up the north wall
  box([2, 0, -7.3], [3.4, 9.4, -6.5], 'brick'),
  box([1.9, 9.4, -7.4], [3.5, 9.6, -6.4], 'concreteDark'),
  box([4.5, 0, 6.6], [5.5, 0.9, 7.6], 'metal', { grab: true }),
  // Furniture: sofa, kitchen table and counter; upstairs a bed and a desk; a table in the side room
  box([-6.5, 0, -5.8], [-3.5, 0.8, -4.9], 'fabric'),
  box([1.5, 0, -3.5], [3.5, 0.78, -1.5], 'wood'),
  box([4.5, 0, -6.2], [6.6, 0.95, -5.4], 'stone'),
  box([2, 3.4, -5.6], [5, 3.95, -2.6], 'fabric'),
  box([-6.6, 3.4, 4.4], [-5.8, 4.2, 6.1], 'wood'),
  box([-3.5, 0, 8], [-1.5, 0.78, 9.2], 'wood'),
]

function houseParts(buildings: Building[], extras: Piece[], flights: ReturnType<typeof stairs>[]) {
  const pieces: Piece[] = [...extras, ...flights.flatMap((f) => f.pieces)]
  const hulls: Hull[] = []
  for (const b of buildings) {
    const built = buildingPieces(b)
    pieces.push(...built.pieces)
    hulls.push(...built.hulls)
  }
  return { pieces, ramps: flights.map((f) => f.ramp), hulls }
}

const pieces: Piece[] = []
const ramps: Ramp[] = []
const hulls: Hull[] = []
for (const [parts, at, turn] of [
  [houseParts([YELLOW_HOUSE, YELLOW_GARAGE], YELLOW_EXTRAS, YELLOW_FLIGHTS), YELLOW.at, YELLOW.turn],
  [houseParts([TEAL_HOUSE, TEAL_ROOM], TEAL_EXTRAS, TEAL_FLIGHTS), TEAL.at, TEAL.turn],
] as const) {
  const p = placed(parts, at, turn)
  pieces.push(...p.pieces)
  ramps.push(...p.ramps)
  hulls.push(...p.hulls)
}

// ---------------------------------------------------------------------------------------------------------
// The board fence round the edge (too tall to jump), with an unseen wall above it so nobody gets out from a
// roof or a car

const FENCE = { height: 2.2, thick: 0.15, wall: 9 }
OUTLINE.forEach(([x0, z0], i) => {
  const [x1, z1] = OUTLINE[(i + 1) % OUTLINE.length]
  const len = Math.hypot(x1 - x0, z1 - z0)
  const dx = (x1 - x0) / len
  const dz = (z1 - z0) / len
  let [nx, nz] = [dz, -dx]
  if (insideOutline((x0 + x1) / 2 + nx * 0.5, (z0 + z1) / 2 + nz * 0.5)) [nx, nz] = [-nx, -nz]
  const rotY = -Math.atan2(dz, dx)
  const at = (along: number, out: number, y: number): P3 => [x0 + dx * along + nx * out, y, z0 + dz * along + nz * out]
  pieces.push({ centre: at(len / 2, FENCE.thick / 2, FENCE.height / 2), size: [len + FENCE.thick, FENCE.height, FENCE.thick], rotY, mat: 'fence' })
  pieces.push({ centre: at(len / 2, 0.25, (FENCE.height + FENCE.wall) / 2), size: [len + 0.5, FENCE.wall - FENCE.height, 0.5], rotY, mat: 'fence', hidden: true })
  // Posts and a top rail on the inside face
  const n = Math.max(1, Math.round(len / 2.4))
  for (let k = 0; k <= n; k++) pieces.push({ centre: at((len * k) / n, -0.05, (FENCE.height + 0.1) / 2), size: [0.16, FENCE.height + 0.1, 0.12], rotY, mat: 'wood', solid: false })
  pieces.push({ centre: at(len / 2, -0.04, FENCE.height - 0.25), size: [len, 0.1, 0.08], rotY, mat: 'wood', solid: false })
})

// ---------------------------------------------------------------------------------------------------------
// Cover: sheds, low yard fences, barriers, bins; the kerb round the circle

// A shed: a solid block with a metal roof you can climb onto, and a door on one side
function shed(x0: number, z0: number, x1: number, z1: number, height: number, mat: MatKey, doorOn: 'n' | 's' | 'e' | 'w') {
  pieces.push(box([x0, 0, z0], [x1, height, z1], mat))
  pieces.push(box([x0 - 0.2, height, z0 - 0.2], [x1 + 0.2, height + 0.15, z1 + 0.2], 'metal', { grab: true }))
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2]
  const d =
    doorOn === 'n'
      ? box([cx - 0.5, 0, z0 - 0.05], [cx + 0.5, 2, z0], 'darkFrame', { solid: false })
      : doorOn === 's'
        ? box([cx - 0.5, 0, z1], [cx + 0.5, 2, z1 + 0.05], 'darkFrame', { solid: false })
        : doorOn === 'w'
          ? box([x0 - 0.05, 0, cz - 0.5], [x0, 2, cz + 0.5], 'darkFrame', { solid: false })
          : box([x1, 0, cz - 0.5], [x1 + 0.05, 2, cz + 0.5], 'darkFrame', { solid: false })
  pieces.push(d)
}
shed(-39.2, -10.7, -34.2, -5.5, 2.6, 'wood', 's')
shed(-30, -15.2, -26.5, -12.6, 2.4, 'metal', 's')
shed(-33.6, 2.4, -29.6, 6.2, 2.6, 'wood', 'n')
shed(25.5, -14.6, 29, -11.4, 2.4, 'metal', 's')
shed(31, -14.8, 35, -11.5, 2.6, 'wood', 's')
shed(30.5, -7.5, 33.5, -4.5, 2.4, 'wood', 'e')

// Low fences of upright boards between the yards (you can vault them)
function yardFence(a: [number, number], b: [number, number]) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  pieces.push({ centre: [(a[0] + b[0]) / 2, 0.65, (a[1] + b[1]) / 2], size: [len, 1.3, 0.12], rotY: -Math.atan2(b[1] - a[1], b[0] - a[0]), mat: 'fence', grab: true })
}
yardFence([-28.5, -10.4], [-28.5, -6])
yardFence([-28.6, -2.2], [-28.6, 0.8])
yardFence([28.6, -10.4], [28.6, -6.6])
yardFence([30.6, 0.2], [30.6, 3.4])

// Concrete barriers in the circle, and across the street where it's closed off
const barrier = (x: number, z: number, rotY: number) => pieces.push({ centre: [x, 0.42, z], size: [2.4, 0.84, 0.6], rotY, mat: 'concrete', grab: true })
barrier(-4.6, -3.6, 0.59)
barrier(7.6, 0.6, -0.45)
barrier(-2.1, 17.7, 0)
barrier(0.6, 17.9, 0)
barrier(3.3, 17.7, 0)
barrier(5.9, 17.4, 0.3)

// Wheelie bins by the drives
const bin = (x: number, z: number) => pieces.push(box([x - 0.35, 0, z - 0.35], [x + 0.35, 1.05, z + 0.35], 'metal', { grab: true }))
const [b1x, b1z] = yellow(9.6, 5.4)
bin(b1x, b1z)
const [b2x, b2z] = teal(-9.8, 3)
bin(b2x, b2z)

// A low kerb round the circle (just drawn), open where the street leaves it
for (let k = 0; k < 40; k++) {
  const a = ((k + 0.5) / 40) * Math.PI * 2
  const x = CIRCLE.centre[0] + Math.cos(a) * (CIRCLE.road + 0.1)
  const z = CIRCLE.centre[1] + Math.sin(a) * (CIRCLE.road + 0.1)
  if (z > CIRCLE.centre[1] && x > STREET.x0 - 0.3 && x < STREET.x1 + 0.3) continue
  pieces.push({ centre: [x, 0.05, z], size: [1.36, 0.1, 0.2], rotY: -a + Math.PI / 2, mat: 'concreteDark', solid: false })
}

export const PIECES = pieces
export const RAMPS = ramps
export const HULLS = hulls
export const EDGES: GrabEdge[] = pieces.filter((p) => p.grab).flatMap(pieceLedges)

// ---------------------------------------------------------------------------------------------------------
// Things drawn in ./Props: the cars, street lamps, palms and trees, the power line over the north

export type Parked = { model: 'bus' | 'pickup' | 'caravan' | 'jetta' | 'yugo' | 'mustang'; at: [number, number]; yaw: number }
export const PARKED: Parked[] = [
  { model: 'bus', at: [-1.7, 8.7], yaw: 1.89 },
  { model: 'pickup', at: [3.2, -2.5], yaw: 0.6 },
  { model: 'caravan', at: [4.2, 5.5], yaw: -0.35 },
  { model: 'jetta', at: [-0.6, -9.9], yaw: 1.95 },
  { model: 'mustang', at: [12.6, -9.9], yaw: 0.22 },
  { model: 'yugo', at: yellow(6.6, 9.5), yaw: Math.PI + YELLOW.turn },
]
export const LAMPS: [number, number][] = [40, 140, 220, 320].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [CIRCLE.centre[0] + Math.cos(a) * 9.3, CIRCLE.centre[1] + Math.sin(a) * 9.3]
})
export const PALMS: [number, number][] = [
  [-23, -13.6],
  [-11.6, -9.6],
  [9.6, -11.6],
  [23.6, -11.2],
]
export const TREES: [number, number][] = [
  [-8.8, 10.4],
  [10.6, 9.8],
]
export const POLES: [number, number][] = [
  [-6, -11.6],
  [5, -13],
]
export const POLE_ENDS: [number, number][] = [
  [-18, -15.8],
  [18, -16.8],
]

// ---------------------------------------------------------------------------------------------------------
// The two teams' starts and their gun racks

export const SPAWNS = {
  west: [-0.8, 1.6].flatMap((z) => [-40.8, -38.6, -36.4, -34.2].map((x) => [x, 1.3, z] as P3)),
  east: [...[-3.5, -1.3, 0.9].flatMap((z) => [35.5, 37.7].map((x) => [x, 1.3, z] as P3)), [39.9, 1.3, -1.3] as P3, [39.9, 1.3, 0.9] as P3],
}
export const PLAYER_SPAWN: P3 = [-38.6, 1.3, 1.6]
export const TEAM_COLOURS = { west: '#3f7fd6', east: '#d6533f' }

const gun = (index: number, x: number) => ({ pick: { gun: index } as Pick, x })
const GUNS = [gun(0, -3.8), gun(2, -1.9), gun(7, 0), gun(11, 1.9), gun(9, 4.1)]
const EXPLOSIVES = [...THROW_KINDS.map((throwable, i) => ({ pick: { throwable } as Pick, x: (i - 1.5) * 1.5 })), gun(13, 1.5 * 1.5 + 1.75)]
export const RACKS: RackLayout[] = [
  { x: -42.3, z: -3.5, yaw: 1.268, items: GUNS },
  { x: -36.8, z: -3.4, yaw: 0, spacing: 1.5, items: EXPLOSIVES },
  { x: 42.8, z: -1.2, yaw: -1.242, items: GUNS },
  { x: 36, z: 4.2, yaw: Math.PI, spacing: 1.5, items: EXPLOSIVES },
]
