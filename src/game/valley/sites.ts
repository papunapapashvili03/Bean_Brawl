import { door, window } from '../maps/kit'
import type { MatKey } from '../maps/textures'
import {
  block,
  building,
  container,
  cone,
  crates,
  cylinder,
  dome,
  fenceRing,
  flight,
  group,
  house,
  inset,
  ladder,
  plane,
  stairTower,
  tank,
  wall,
  waterTower,
  type Group,
} from './build'

// What stands at each of Dust Bowl Valley's places (./places), built in the place's own frame: its middle at
// the origin, its ground at y = 0, its front (towards the mesa) at +z. Each also says where its gun rack
// stands, what cars are parked there, and what moving or decorative things go with it (drawn in ./Props).

export type CarModel = 'bus' | 'pickup' | 'caravan' | 'jetta' | 'yugo' | 'mustang' | 'fiesta' | 'samba'
export type RackSpot = { x: number; z: number; y?: number; yaw: number; guns: number[] }
export type CarSpot = { model: CarModel; x: number; z: number; yaw: number }
export type FeatureKind = 'turbine' | 'pumpjack' | 'windmill' | 'mast' | 'dish' | 'corn' | 'rails' | 'signal' | 'windsock' | 'fire' | 'hook' | 'ropes' | 'zone' | 'disc'
export type Feature = { kind: FeatureKind; x: number; z: number; y?: number; yaw?: number; w?: number; d?: number; size?: number; mat?: MatKey }
export type Site = { group: Group; racks: RackSpot[]; cars: CarSpot[]; features: Feature[] }

const PAINTS: MatKey[] = ['paintRed', 'paintBlue', 'paintYellow', 'paintGreen', 'paintWhite', 'rust']

// A portable cabin, raised on blocks
function trailer(g: Group, x: number, z: number, rotY: number, mat: MatKey = 'siding') {
  const t = group()
  building(t, { min: [-4.5, -1.5], max: [4.5, 1.5], floors: 1, height: 2.7, wall: mat, floorMat: 'wood', roof: 'flat', roofMat: 'metal', grabRoof: true, trim: 'trim', openings: [door('s', 2.2, 0, 1.1), window('s', 6.5, 0, 1.6), window('n', 4.5, 0, 2)] })
  inset(g, t, [x, z], rotY)
}

// A tent: an A-frame of canvas
function tent(g: Group, x: number, z: number) {
  g.hulls.push({ points: [x - 1.7, 0, z - 1.3, x + 1.7, 0, z - 1.3, x - 1.7, 0, z + 1.3, x + 1.7, 0, z + 1.3, x - 1.7, 1.9, z, x + 1.7, 1.9, z], mat: 'fabric' })
}

// ---------------------------------------------------------------------------------------------------------
// The mesa's top (18 m up): the mine shack, a water tower, sandbags, and the best guns

function mesa(): Site {
  const g = group()
  building(g, { min: [-16, -6], max: [-6, 2], floors: 1, wall: 'wood', floorMat: 'wood', roof: 'pitched', roofMat: 'shingle', trim: 'trim', openings: [door('s', 5), door('n', 5), window('e', 4), window('w', 4)] })
  waterTower(g, 14, -12)
  for (const x of [-4, -1.6]) block(g, [x - 0.9, 0, 10.4], [x + 0.9, 1.2, 11.6], 'rust', { grab: true })
  wall(g, [-12, 18], [-3, 23], 1, 0.7, 'fabric', { grab: true })
  wall(g, [6, 22], [15, 16], 1, 0.7, 'fabric', { grab: true })
  wall(g, [20, -3], [24, 6], 1, 0.7, 'fabric', { grab: true })
  wall(g, [-24, 6], [-19, 14], 1, 0.7, 'fabric', { grab: true })
  crates(g, 4, -6, 2)
  crates(g, 5.2, -6)
  crates(g, -20, -14, 2)
  crates(g, 22, 13)
  return { group: g, racks: [{ x: 2, z: 4, yaw: 0, guns: [10, 9, 12] }], cars: [], features: [{ kind: 'rails', x: -3, z: 11, size: 12 }] }
}

// The dam: a concrete wall 9 m high across the gully, the reservoir behind it. Stairs up the west end, a
// ladder up the middle, a control tower at the east end whose roof is level with the top.
function dam(): Site {
  const g = group()
  block(g, [-40, 0, -4], [40, 9, 2], 'concrete')
  wall(g, [-40, -3.8], [-2, -3.8], 1, 0.35, 'concreteDark', { grab: true }, 9)
  wall(g, [2, -3.8], [40, -3.8], 1, 0.35, 'concreteDark', { grab: true }, 9)
  wall(g, [-31, 1.8], [-3, 1.8], 1, 0.35, 'concreteDark', { grab: true }, 9)
  wall(g, [3, 1.8], [25, 1.8], 1, 0.35, 'concreteDark', { grab: true }, 9)
  flight(g, [-12, 4.6], [-32, 4.6], 0, 9, 2.4, 'concrete')
  block(g, [-38, 0, 2], [-32, 9, 7], 'concrete')
  ladder(g, 0, 2.05, 1.4, 8.4, [0, 1])
  building(g, {
    min: [26, 2],
    max: [36, 11],
    floors: 2,
    height: 4.5,
    wall: 'concrete',
    floorMat: 'concrete',
    roof: 'flat',
    roofMat: 'roofGravel',
    parapet: 1,
    parapetGaps: [{ side: 'n', at: 4, width: 2.6 }],
    trim: 'trim',
    openings: [door('s', 5), door('w', 4.5), window('e', 4.5), window('s', 2.5, 1), window('s', 7.5, 1), window('e', 4.5, 1), window('w', 3, 1)],
    stairwells: [{ floor: 1, min: [34.2, 2.3], max: [35.7, 9.4] }],
  })
  flight(g, [34.95, 9.2], [34.95, 3], 0, 4.5, 1.3, 'concrete')
  building(g, { min: [-10, 8], max: [-2, 14], floors: 1, wall: 'brick', roof: 'flat', roofMat: 'roofGravel', parapet: 0.5, trim: 'trim', openings: [door('n', 4), window('e', 3), window('w', 3)] })
  block(g, [-8, 0, 2], [-7.2, 0.8, 8], 'metal', { grab: true })
  block(g, [-5, 0, 2], [-4.2, 0.8, 8], 'metal', { grab: true })
  crates(g, 10, 6, 2)
  crates(g, 11.2, 6)
  crates(g, -20, 10)
  return { group: g, racks: [{ x: -14, z: -1, y: 9, yaw: 0, guns: [2, 12] }], cars: [], features: [] }
}

// The junkyard: a corrugated fence round rows of crushed cars stacked one to three high, a crane you can
// climb (and walk out along its boom), the office cabin
function junkyard(): Site {
  const g = group()
  const P = 24
  const side = (a: [number, number], b: [number, number]) => wall(g, a, b, 2.4, 0.12, 'metal')
  side([-P, -P], [8, -P])
  side([14, -P], [P, -P])
  side([P, -P], [P, -4])
  side([P, 4], [P, P])
  side([P, P], [5, P])
  side([-5, P], [-P, P])
  side([-P, P], [-P, 4])
  side([-P, -2], [-P, -P])
  let k = 0
  for (const z of [-15, -7, 7, 15]) {
    for (let x = -18; x <= 18; x += 3) {
      if (Math.abs(x) <= 3 && Math.abs(z) < 10) continue
      if ((x + z * 3) % 9 === 0) continue
      const high = 1 + ((k * 7) % 3)
      for (let s = 0; s < high; s++) block(g, [x - 1.3, s * 1.2, z - 0.85], [x + 1.3, (s + 1) * 1.2, z + 0.85], PAINTS[(k + s) % PAINTS.length], { grab: true })
      k++
    }
  }
  block(g, [13, 0, -21], [15, 14, -19], 'paintYellow')
  ladder(g, 14, -18.95, 1.4, 12.6, [0, 1])
  block(g, [11.5, 13, -22.5], [16.5, 13.3, -17.5], 'metal', { grab: true })
  block(g, [-3, 14.3, -20.4], [15, 14.9, -19.6], 'paintYellow', { grab: true })
  building(g, { min: [-21, 15], max: [-13, 20], floors: 1, height: 2.8, wall: 'siding', floorMat: 'wood', roof: 'flat', roofMat: 'metal', grabRoof: true, trim: 'trim', openings: [door('e', 2.5), window('n', 4), window('s', 4)] })
  for (const [x, z] of [
    [18, 10],
    [19.6, 11.6],
    [-18, -20],
  ])
    block(g, [x - 0.8, 0, z - 0.8], [x + 0.8, 1, z + 0.8], 'rubber', { grab: true })
  return { group: g, racks: [{ x: 4, z: 19, yaw: Math.PI, guns: [1, 3] }], cars: [], features: [{ kind: 'hook', x: -1.5, z: -20, y: 14.3 }] }
}

// Ghost town: a dusty main street (the track to the gorge runs down it) between false-fronted timber
// buildings: the saloon with its balcony, the store, the bank, the hotel; the sheriff's office, the livery,
// the church and its bell tower
function ghostTown(): Site {
  const g = group()
  building(g, {
    min: [-26, -18],
    max: [-12, -7],
    floors: 2,
    wall: 'wood',
    floorMat: 'wood',
    roof: 'flat',
    roofMat: 'roofGravel',
    parapet: 1.4,
    trim: 'trim',
    openings: [door('s', 7), window('s', 3), window('s', 11), door('n', 7), window('s', 3, 1), door('s', 7, 1), window('s', 11, 1), window('e', 5, 1), window('w', 5, 1)],
    stairwells: [{ floor: 1, min: [-25.7, -17.7], max: [-24.2, -11.4] }],
  })
  flight(g, [-24.95, -11.6], [-24.95, -17.4], 0, 3.4, 1.3, 'wood')
  block(g, [-26, 3.1, -7], [-12, 3.4, -4.6], 'deckWood')
  for (const x of [-25.8, -18.9, -12.2]) block(g, [x - 0.12, 0, -4.84], [x + 0.12, 3.1, -4.6], 'wood')
  wall(g, [-26, -4.7], [-12, -4.7], 1, 0.1, 'wood', {}, 3.4)
  building(g, { min: [-9, -17], max: [2, -7], floors: 1, height: 3.6, wall: 'wood', floorMat: 'wood', roof: 'flat', roofMat: 'roofGravel', parapet: 1.6, trim: 'trim', openings: [door('s', 5.5), window('s', 2.5), window('s', 8.5), door('n', 5.5)] })
  building(g, { min: [5, -17], max: [16, -7], floors: 1, height: 3.8, wall: 'brick', floorMat: 'wood', roof: 'flat', roofMat: 'roofGravel', parapet: 0.8, trim: 'trim', openings: [door('s', 5.5), window('s', 2.5), window('s', 8.5), window('e', 5)] })
  building(g, {
    min: [19, -18],
    max: [29, -7],
    floors: 2,
    wall: 'wood',
    floorMat: 'wood',
    roof: 'pitched',
    roofMat: 'shingle',
    trim: 'trim',
    openings: [door('s', 5), window('s', 2), window('s', 8), window('s', 2, 1), window('s', 5, 1), window('s', 8, 1), window('e', 5, 1), door('n', 5)],
    stairwells: [{ floor: 1, min: [22.5, -17.7], max: [28.7, -16.2] }],
  })
  flight(g, [22.8, -16.95], [28.4, -16.95], 0, 3.4, 1.3, 'wood')
  building(g, { min: [-24, 7], max: [-14, 15], floors: 1, wall: 'stone', floorMat: 'wood', roof: 'flat', roofMat: 'roofGravel', parapet: 0.6, grabParapet: true, trim: 'trim', openings: [door('n', 5), window('n', 2), window('n', 8), window('e', 4)] })
  building(g, { min: [-10, 8], max: [2, 18], floors: 1, height: 4, wall: 'wood', floorMat: 'dirt', roof: 'pitched', roofMat: 'roofTile', openings: [{ side: 'n', at: 6, width: 4, bottom: 0, top: 3.4 }, door('s', 6), window('e', 5), window('w', 5)] })
  building(g, { min: [7, 8], max: [19, 20], floors: 1, height: 5, wall: 'stucco', floorMat: 'wood', roof: 'pitched', roofMat: 'roofTile', trim: 'trim', openings: [{ side: 'n', at: 6, width: 2, bottom: 0, top: 3 }, window('e', 6, 0, 1.2), window('w', 6, 0, 1.2)] })
  stairTower(g, 25, 12, 3, 3.4, 7.4)
  block(g, [-6, 0, 2.6], [-2.6, 1.6, 4.4], 'wood', { grab: true })
  block(g, [9, 0, 3.6], [11.6, 0.8, 4.4], 'wood', { grab: true })
  for (const x of [-20, 8, 22]) block(g, [x - 1.5, 0, -6.2], [x + 1.5, 0.9, -5.9], 'wood', { grab: true })
  crates(g, 14, 4.8)
  crates(g, -16, -5.2, 2)
  return { group: g, racks: [{ x: 0, z: 0, yaw: 0, guns: [0, 7] }], cars: [], features: [] }
}

// The drive-in: rows of cars facing the big screen, a catwalk behind it level with its top (stairs up),
// the snack bar at the back
function driveIn(): Site {
  const g = group()
  block(g, [-14, 2, -19], [14, 10, -18.4], 'paintWhite')
  block(g, [-14.4, 1.8, -19.2], [14.4, 2.1, -18.2], 'darkFrame')
  block(g, [-14.4, 10, -19.2], [14.4, 10.3, -18.2], 'darkFrame')
  for (const x of [-13, -6, 0, 6, 13]) block(g, [x - 0.25, 0, -19.1], [x + 0.25, 2, -18.5], 'darkFrame')
  stairTower(g, 0, -23.6, 3, 3.4, 7.4, 'metal', 'darkFrame')
  building(g, { min: [-6, 14], max: [6, 22], floors: 1, wall: 'stucco', floorMat: 'paving', roof: 'flat', roofMat: 'roofGravel', parapet: 0.6, grabParapet: true, trim: 'trim', openings: [door('s', 6), { side: 'n', at: 6, width: 4, bottom: 0.9, top: 2.3 }, door('e', 4)] })
  const models: CarModel[] = ['mustang', 'jetta', 'fiesta', 'yugo', 'caravan', 'pickup', 'samba']
  const cars: CarSpot[] = []
  let m = 0
  for (const z of [-9, -1, 7]) {
    for (const x of [-12, -6, 0, 6, 12]) {
      block(g, [x + 2.1, 0, z - 0.08], [x + 2.26, 1.3, z + 0.08], 'darkFrame')
      if ((x + z * 2) % 3 !== 0 && m < models.length) cars.push({ model: models[m++], x, z, yaw: Math.PI / 2 })
    }
  }
  return { group: g, racks: [{ x: 11, z: 13, yaw: Math.PI, guns: [5, 1] }], cars, features: [] }
}

// The suburb: a cul-de-sac of five houses (three with two floors), fences between the yards, cars in the drives
function suburb(): Site {
  const g = group()
  house(g, -15, -6, 0.98, 2, 'stuccoYellow')
  house(g, 15, -6, -0.98, 2, 'siding')
  house(g, 0, -18, 0, 2, 'brick', 'roofTile')
  house(g, -18, 15, 2.12, 1, 'stucco')
  house(g, 18, 15, -2.12, 1, 'siding')
  wall(g, [-8, -25], [-8, -13], 1.3, 0.12, 'fence', { grab: true })
  wall(g, [8, -25], [8, -13], 1.3, 0.12, 'fence', { grab: true })
  wall(g, [-25, 3], [-12, 6], 1.3, 0.12, 'fence', { grab: true })
  wall(g, [25, 3], [12, 6], 1.3, 0.12, 'fence', { grab: true })
  for (const [x, z] of [
    [-7, 9],
    [7, 10],
  ])
    block(g, [x - 0.35, 0, z - 0.35], [x + 0.35, 1.05, z + 0.35], 'metal', { grab: true })
  return {
    group: g,
    racks: [{ x: 0, z: 2, yaw: 0, guns: [4, 0] }],
    cars: [
      { model: 'caravan', x: -8, z: 3, yaw: 0.8 },
      { model: 'jetta', x: 9, z: 6, yaw: 2.3 },
      { model: 'yugo', x: -4, z: 19, yaw: -1.4 },
    ],
    features: [
      { kind: 'disc', x: 0, z: 3, size: 11, mat: 'asphalt' },
      { kind: 'zone', x: 0, z: 22, w: 7, d: 20, mat: 'asphalt' },
    ],
  }
}

// The motel (rooms on two floors, a walkway along the front upstairs), its reception, the gas station's
// canopy and shop, the diner, the big sign
function motel(): Site {
  const g = group()
  building(g, {
    min: [-26, -20],
    max: [-2, -12],
    floors: 2,
    wall: 'stucco',
    floorMat: 'wood',
    roof: 'flat',
    roofMat: 'roofGravel',
    parapet: 0.6,
    trim: 'trim',
    openings: [...[3, 9, 15, 21].flatMap((at) => [door('s', at), door('s', at, 1)]), ...[6, 12, 18].flatMap((at) => [window('s', at), window('s', at, 1)]), window('n', 6), window('n', 18), window('w', 4)],
    partitions: [-20, -14, -8].flatMap((x) => [
      { a: [x, -19.7] as [number, number], b: [x, -12.3] as [number, number] },
      { a: [x, -19.7] as [number, number], b: [x, -12.3] as [number, number], floor: 1 },
    ]),
  })
  block(g, [-26, 3.1, -12], [-2, 3.4, -9.6], 'concrete')
  for (const x of [-25.8, -18, -10, -2.2]) block(g, [x - 0.15, 0, -9.9], [x + 0.15, 3.1, -9.6], 'concrete')
  wall(g, [-26, -9.7], [-4.4, -9.7], 1, 0.1, 'darkFrame', {}, 3.4)
  flight(g, [4.8, -10.8], [-1.9, -10.8], 0, 3.4, 2.2, 'concrete')
  building(g, { min: [-26, -6], max: [-18, 4], floors: 1, wall: 'stucco', floorMat: 'paving', roof: 'flat', roofMat: 'roofGravel', parapet: 0.6, grabParapet: true, trim: 'trim', openings: [door('e', 5), window('s', 4), window('n', 4)] })
  block(g, [6, 4.2, 2], [20, 4.6, 12], 'paintWhite', { grab: true })
  for (const [x, z] of [
    [6.4, 2.4],
    [19.6, 2.4],
    [6.4, 11.6],
    [19.6, 11.6],
  ])
    block(g, [x - 0.2, 0, z - 0.2], [x + 0.2, 4.2, z + 0.2], 'darkFrame')
  for (const [x, z] of [
    [10, 5],
    [16, 5],
    [10, 9],
    [16, 9],
  ])
    block(g, [x - 0.4, 0, z - 0.3], [x + 0.4, 1.5, z + 0.3], 'paintRed', { grab: true })
  building(g, { min: [22, 0], max: [30, 10], floors: 1, wall: 'concrete', floorMat: 'paving', roof: 'flat', roofMat: 'roofGravel', parapet: 0.6, grabParapet: true, trim: 'trim', openings: [door('w', 6), { side: 'w', at: 2.6, width: 2.4, bottom: 0.9, top: 2.4 }, door('e', 5)] })
  building(g, { min: [-12, 10], max: [0, 18], floors: 1, wall: 'frame', floorMat: 'paving', roof: 'flat', roofMat: 'metal', parapet: 0.5, trim: 'darkFrame', openings: [door('n', 6), window('n', 2.5, 0, 2.4), window('n', 9.5, 0, 2.4), window('w', 4, 0, 2), window('e', 4, 0, 2)] })
  block(g, [9.8, 0, 18.8], [10.3, 8, 19.3], 'darkFrame')
  block(g, [7.5, 8, 18.8], [12.6, 10.6, 19.3], 'paintRed')
  return {
    group: g,
    racks: [{ x: 14, z: -4, yaw: 0, guns: [3, 8] }],
    cars: [
      { model: 'mustang', x: -14, z: -4, yaw: 0 },
      { model: 'pickup', x: 13, z: 7, yaw: 0 },
      { model: 'samba', x: -6, z: 5, yaw: 1.4 },
    ],
    features: [{ kind: 'zone', x: 4, z: 2, w: 42, d: 24, mat: 'asphalt' }],
  }
}

// The farm: the red barn with its hayloft, a silo you can climb, the farmhouse, a field of tall corn to
// hide in, bales and fences
function farm(): Site {
  const g = group()
  building(g, {
    min: [-22, -18],
    max: [-6, -4],
    floors: 2,
    height: 4,
    wall: 'paintRed',
    floorMat: 'wood',
    roof: 'pitched',
    roofMat: 'shingle',
    trim: 'trim',
    openings: [
      { side: 's', at: 8, width: 4.4, bottom: 0, top: 3.6 },
      { side: 'n', at: 8, width: 3, bottom: 0, top: 3.2 },
      window('e', 7),
      window('w', 7),
      { side: 's', at: 8, width: 2.2, bottom: 0.3, top: 2.6, floor: 1 },
      window('e', 4, 1),
      window('w', 10, 1),
    ],
    stairwells: [{ floor: 1, min: [-21.7, -17.7], max: [-20.2, -10.9] }],
  })
  flight(g, [-20.95, -11.1], [-20.95, -17.4], 0, 4, 1.3, 'wood')
  cylinder(g, 2, -12, 3.5, 0, 14, 'metal')
  ladder(g, 2, -8.45, 1.4, 13.4, [0, 1])
  house(g, -14, 12, Math.PI / 2, 2, 'siding')
  for (const [x, z, n] of [
    [-3, -2, 2],
    [-1.6, -2, 1],
    [-3, -0.6, 1],
    [4, 14, 2],
  ])
    for (let k = 0; k < n; k++) block(g, [x - 0.65, k * 0.8, z - 0.45], [x + 0.65, (k + 1) * 0.8, z + 0.45], 'dryGrass', { grab: true })
  wall(g, [-26, 22], [-4, 22], 1.1, 0.12, 'wood', { grab: true })
  wall(g, [-26, -22], [-26, 22], 1.1, 0.12, 'wood', { grab: true })
  block(g, [-4, 0.6, 15], [-1, 1.8, 16.6], 'paintGreen', { grab: true })
  block(g, [-3.6, 1.8, 15.1], [-2.2, 3, 16.5], 'paintGreen')
  return { group: g, racks: [{ x: -2, z: 8, yaw: 0, guns: [2, 7] }], cars: [], features: [{ kind: 'corn', x: 15, z: 4, w: 16, d: 26 }] }
}

// The radio tower: a steel stair tower four flights up with the mast on top, the equipment shack, a ring of
// trailers
function radio(): Site {
  const g = group()
  const top = stairTower(g, 0, -4, 4, 3.4, 8, 'metal', 'darkFrame')
  building(g, { min: [-17, -12], max: [-9, -5], floors: 1, wall: 'concrete', floorMat: 'concrete', roof: 'flat', roofMat: 'roofGravel', grabRoof: true, trim: 'trim', openings: [door('e', 3.5), window('s', 4)] })
  trailer(g, 12, -12, 0.4)
  trailer(g, 15, 3, -0.2, 'paintWhite')
  trailer(g, -13, 10, 0.1)
  trailer(g, 3, 15, 0.3, 'paintWhite')
  fenceRing(g, [
    [-5.5, -9.5],
    [5.5, -9.5],
    [5.5, 1.5],
    [-5.5, 1.5],
  ], 2, 'wire', [2])
  return {
    group: g,
    racks: [{ x: -4, z: 9, yaw: 0, guns: [10, 0] }],
    cars: [],
    features: [
      { kind: 'mast', x: 0, z: -4, y: top, size: 16 },
      { kind: 'dish', x: -13, z: -8.5, y: 3.6 },
    ],
  }
}

// Wind ridge (12 m up the highlands): three turbines, a substation behind a fence, containers stacked up
function windRidge(): Site {
  const g = group()
  const towers: [number, number][] = [
    [-18, -10],
    [2, -18],
    [20, -6],
  ]
  for (const [x, z] of towers) cylinder(g, x, z, 1.3, 0, 26, 'paintWhite', 12)
  building(g, { min: [-6, 2], max: [4, 9], floors: 1, wall: 'concrete', floorMat: 'concrete', roof: 'flat', roofMat: 'roofGravel', grabRoof: true, trim: 'trim', openings: [door('s', 5), window('e', 3.5), window('w', 3.5)] })
  for (const [x, z] of [
    [8, 4],
    [11, 4],
    [8, 7.5],
    [11, 7.5],
  ])
    block(g, [x - 1, 0, z - 1], [x + 1, 2.2, z + 1], 'metal', { grab: true })
  fenceRing(g, [
    [6, 2],
    [13.5, 2],
    [13.5, 9.5],
    [6, 9.5],
  ], 2.2, 'wire', [2])
  container(g, -14, 10, 0.3, 'paintBlue')
  container(g, -14, 10, 0.3, 'paintRed', 2.6)
  container(g, 16, 15, -0.4, 'rust')
  crates(g, -8.5, 13, 2)
  crates(g, -7.3, 13)
  return { group: g, racks: [{ x: 0, z: 14, yaw: 0, guns: [3, 2] }], cars: [], features: towers.map(([x, z]) => ({ kind: 'turbine' as const, x, z, y: 26 })) }
}

// The gorge: a rope bridge sagging across it 20 m above the floor, a camp on either rim (tents, a lookout,
// a cabin)
function gorge(): Site {
  const g = group()
  for (let x = -12; x < 12; x += 0.5) {
    const y = -1.6 * Math.sin((Math.PI * (x + 12.25)) / 24.5)
    block(g, [x, y - 0.12, -1.1], [x + 0.48, y, 1.1], 'deckWood')
  }
  // Ropes either side to hold on to (you can't fall off sideways)
  for (const s of [-1, 1]) g.pieces.push({ centre: [0, -0.4, s * 1.25], size: [24.6, 3, 0.1], mat: 'wood', hidden: true })
  for (const x of [-12.4, 12.4]) for (const z of [-1.35, 1.35]) block(g, [x - 0.15, -0.6, z - 0.15], [x + 0.15, 1.6, z + 0.15], 'wood')
  tent(g, -22, -6)
  tent(g, -30, -6)
  stairTower(g, -27, 6, 2, 3.2, 7.4)
  crates(g, -17, -4, 2)
  crates(g, -18.2, -4)
  building(g, { min: [21, -5], max: [29, 3], floors: 1, wall: 'wood', floorMat: 'wood', roof: 'pitched', roofMat: 'shingle', trim: 'trim', openings: [door('w', 4), window('n', 4), window('s', 4)] })
  crates(g, 19, 5)
  return {
    group: g,
    racks: [{ x: -19, z: 6, yaw: Math.PI / 2, guns: [11, 1] }],
    cars: [],
    features: [
      { kind: 'ropes', x: 0, z: 0 },
      { kind: 'fire', x: -22, z: 1 },
    ],
  }
}

// The train depot: boxcars on two tracks (doors open both sides: climb in), a flatcar, the station and its
// platform, a water tower, a signal
function depot(): Site {
  const g = group()
  const boxcar = (x: number, z: number, mat: MatKey) => {
    const c = group()
    building(c, { min: [-6, -1.4], max: [6, 1.4], floors: 1, height: 2.9, base: 1.1, wall: mat, floorMat: 'wood', roof: 'flat', roofMat: 'metal', grabRoof: true, openings: [{ side: 'n', at: 6, width: 2.4, bottom: 0, top: 2.5 }, { side: 's', at: 6, width: 2.4, bottom: 0, top: 2.5 }] })
    block(c, [-5.7, 0, -1.25], [5.7, 1.1, 1.25], 'darkFrame')
    inset(g, c, [x, z], 0)
  }
  boxcar(-20, -4, 'paintRed')
  boxcar(-6, -4, 'rust')
  boxcar(8, -4, 'paintBlue')
  block(g, [16, 0, -5.2], [28, 1.3, -2.8], 'darkFrame', { grab: true })
  boxcar(-12, 4, 'rust')
  boxcar(14, 4, 'paintGreen')
  block(g, [-22, 0, 7.6], [12, 0.3, 10.4], 'concrete')
  building(g, {
    min: [-18, 10.4],
    max: [6, 18],
    floors: 1,
    height: 3.6,
    wall: 'brick',
    floorMat: 'wood',
    roof: 'pitched',
    roofMat: 'roofTile',
    trim: 'trim',
    openings: [door('n', 6), door('n', 18), window('n', 3), window('n', 12), window('n', 21), door('s', 12), window('e', 3.8)],
  })
  waterTower(g, 24, -14)
  return {
    group: g,
    racks: [{ x: -4, z: 9, y: 0.3, yaw: Math.PI, guns: [5, 4] }],
    cars: [],
    features: [
      { kind: 'rails', x: 0, z: -4, size: 72 },
      { kind: 'rails', x: 0, z: 4, size: 72 },
      { kind: 'signal', x: 31, z: 0 },
    ],
  }
}

// The oil field: storage tanks you can climb (ladders up their fronts), pumpjacks nodding, a derrick (a
// stair tower with a lattice on top), pipes to hide behind
function oilField(): Site {
  const g = group()
  tank(g, -15, -8, 5, 7)
  tank(g, -1, -16, 5, 7)
  tank(g, 13, -9, 4, 6)
  const jacks: [number, number][] = [
    [-16, 10],
    [2, 14],
    [18, 8],
  ]
  for (const [x, z] of jacks) block(g, [x - 1, 0, z - 2.2], [x + 1, 1.1, z + 2.2], 'concreteDark', { grab: true })
  const top = stairTower(g, 20, -20, 4, 3.2, 7.4, 'metal', 'darkFrame')
  wall(g, [-10, -2.5], [-1, -10.5], 0.7, 0.7, 'metal', { grab: true })
  wall(g, [4, -12], [9, -8], 0.7, 0.7, 'metal', { grab: true })
  trailer(g, -20, 20, 0.2, 'paintWhite')
  return {
    group: g,
    racks: [{ x: 0, z: 2, yaw: 0, guns: [9, 0] }],
    cars: [],
    features: [...jacks.map(([x, z]) => ({ kind: 'pumpjack' as const, x, z, y: 1.1 })), { kind: 'mast', x: 20, z: -20, y: top, size: 10 }],
  }
}

// The quarry: a pit 9 m deep with a metal stairway up out of it, gravel heaps round the rim, an excavator
// down below, the crusher house, a shed
function quarry(): Site {
  const g = group()
  flight(g, [6, -4], [6, 20], -8.9, 1.2, 1.6, 'metal')
  block(g, [5, 0.9, 20], [7, 1.2, 24], 'metal')
  cone(g, -22, -14, 6, -0.5, 5, 'gravel')
  cone(g, 20, -18, 5, -0.5, 4, 'gravel')
  cone(g, -24, 14, 5, -0.5, 4, 'gravel')
  block(g, [-6, -9, -5], [-1, -7.4, -2], 'paintYellow', { grab: true })
  block(g, [-5.5, -7.4, -4.6], [-3, -5.6, -2.4], 'paintYellow')
  building(g, {
    min: [12, 22],
    max: [22, 30],
    floors: 2,
    wall: 'metal',
    floorMat: 'concrete',
    roof: 'flat',
    roofMat: 'metal',
    parapet: 0.8,
    trim: 'darkFrame',
    openings: [door('w', 4), window('n', 5), window('w', 2, 1), window('n', 5, 1), window('e', 4, 1)],
    stairwells: [{ floor: 1, min: [20.2, 22.3], max: [21.7, 28.6] }],
  })
  flight(g, [20.95, 28.4], [20.95, 22.6], 0, 3.4, 1.3, 'metal')
  building(g, { min: [-30, -26], max: [-22, -20], floors: 1, wall: 'siding', floorMat: 'wood', roof: 'flat', roofMat: 'metal', grabRoof: true, openings: [door('e', 3)] })
  return { group: g, racks: [{ x: -12, z: 25, yaw: Math.PI, guns: [13, 4] }], cars: [], features: [] }
}

// The airstrip: the runway, two hangars facing it (a mezzanine inside each), the control tower (a stair
// tower with a roof over its top), small planes parked on the apron, a fuel truck
function airstrip(): Site {
  const g = group()
  for (const z0 of [-44, 4]) {
    building(g, {
      min: [14, z0],
      max: [34, z0 + 20],
      floors: 1,
      height: 8,
      wall: 'metal',
      floorMat: 'concrete',
      roof: 'flat',
      roofMat: 'metal',
      trim: 'darkFrame',
      openings: [{ side: 'w', at: 10, width: 13, bottom: 0, top: 6.5 }, door('e', 10), window('n', 6, 0, 2), window('n', 14, 0, 2), window('s', 6, 0, 2), window('s', 14, 0, 2)],
    })
    block(g, [29.5, 3.8, z0 + 2], [33.7, 4.1, z0 + 11], 'metal', { grab: true })
    wall(g, [29.5, z0 + 2], [29.5, z0 + 11], 1, 0.1, 'darkFrame', {}, 4.1)
    flight(g, [31.6, z0 + 18], [31.6, z0 + 11.1], 0, 4.1, 1.6, 'metal')
  }
  const top = stairTower(g, 22, 36, 4, 3.4, 8, 'concrete', 'darkFrame')
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(g, [22 + sx * 3.85 - 0.12, top, 36 + sz * 3.85 - 0.12], [22 + sx * 3.85 + 0.12, top + 2.6, 36 + sz * 3.85 + 0.12], 'darkFrame')
  block(g, [17.6, top + 2.6, 31.6], [26.4, top + 2.9, 40.4], 'metal')
  plane(g, -18, 16, 1.2)
  plane(g, -18, -20, -1.4)
  block(g, [10, 0.5, 26], [16, 2.6, 28.4], 'paintRed', { grab: true })
  block(g, [16, 0.5, 26.2], [18, 2.4, 28.2], 'paintWhite')
  return {
    group: g,
    racks: [{ x: 22, z: -34, yaw: -Math.PI / 2, guns: [10, 5] }],
    cars: [],
    features: [
      { kind: 'zone', x: 0, z: 0, w: 18, d: 120, mat: 'asphalt' },
      { kind: 'windsock', x: -12, z: 44 },
    ],
  }
}

// The ranch (8 m up): the ranch house with its porch roof, the stables, a round corral, a windmill you can
// climb, a water tank
function ranch(): Site {
  const g = group()
  building(g, { min: [-18, -12], max: [-2, -2], floors: 1, wall: 'wood', floorMat: 'wood', roof: 'pitched', roofMat: 'shingle', trim: 'trim', openings: [door('s', 8), window('s', 3), window('s', 13), window('e', 5), window('w', 5), door('n', 8)] })
  block(g, [-18, 0, -2], [-2, 0.25, 1.5], 'deckWood')
  block(g, [-18, 2.9, -2], [-2, 3.1, 1.6], 'deckWood', { grab: true })
  for (const x of [-17.8, -10, -2.2]) block(g, [x - 0.12, 0.25, 1.2], [x + 0.12, 2.9, 1.45], 'wood')
  building(g, {
    min: [3, -16],
    max: [21, -6],
    floors: 1,
    height: 3.6,
    wall: 'wood',
    floorMat: 'dirt',
    roof: 'pitched',
    roofMat: 'roofTile',
    openings: [door('s', 3, 0, 2), door('s', 9, 0, 2), door('s', 15, 0, 2), door('n', 9, 0, 2)],
    partitions: [
      { a: [9, -15.7], b: [9, -9] },
      { a: [15, -15.7], b: [15, -9] },
    ],
  })
  const ring = Array.from({ length: 12 }, (_, i) => [8 + Math.cos((i / 12) * Math.PI * 2) * 9, 13 + Math.sin((i / 12) * Math.PI * 2) * 9] as [number, number])
  fenceRing(g, ring, 1.3, 'wood', [3], true)
  block(g, [-15.4, 0, 9.6], [-12.6, 9, 12.4], 'wood', { grab: true })
  ladder(g, -14, 12.45, 1.4, 8.4, [0, 1])
  cylinder(g, -6, 14, 2.4, 0, 3, 'metal')
  return { group: g, racks: [{ x: -10, z: 4, yaw: 0, guns: [7, 8] }], cars: [{ model: 'pickup', x: 2, z: 4, yaw: 0.5 }], features: [{ kind: 'windmill', x: -14, z: 11, y: 9 }] }
}

// The observatory (16 m up the hill): two floors under a dome, outside stairs up to its roof, a low wall
// round the terrace
function observatory(): Site {
  const g = group()
  building(g, {
    min: [-8, -8],
    max: [8, 8],
    floors: 2,
    height: 3.6,
    wall: 'stucco',
    floorMat: 'concrete',
    roof: 'flat',
    roofMat: 'concrete',
    trim: 'trim',
    openings: [door('s', 8), window('s', 3), window('s', 13), window('e', 8), window('w', 8), door('n', 8), window('s', 4, 1), window('s', 12, 1), window('e', 4, 1), window('w', 12, 1), window('n', 8, 1)],
    stairwells: [{ floor: 1, min: [4.4, -7.7], max: [7.7, -1.3] }],
  })
  flight(g, [6.05, -1.6], [6.05, -7.4], 0, 3.6, 1.3, 'concrete')
  dome(g, 0, 0, 6.4, 7.4, 'metal')
  flight(g, [-9.6, 9], [-9.6, -5.5], 0, 7.4, 2, 'concrete')
  block(g, [-10.8, 0, -8.2], [-8.4, 7.4, -5.5], 'concrete')
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 8 || i === 12) continue
    const a0 = (i / 16) * Math.PI * 2
    const a1 = ((i + 1) / 16) * Math.PI * 2
    wall(g, [Math.sin(a0) * 13, Math.cos(a0) * 13], [Math.sin(a1) * 13, Math.cos(a1) * 13], 0.9, 0.5, 'stone', { grab: true })
  }
  return { group: g, racks: [{ x: 0, z: 11.5, yaw: 0, guns: [12, 10] }], cars: [], features: [{ kind: 'dish', x: 9, z: -11, y: 0 }] }
}

export const SITES: Record<string, () => Site> = {
  mesa,
  dam,
  junkyard,
  ghost: ghostTown,
  drivein: driveIn,
  suburb,
  motel,
  farm,
  radio,
  wind: windRidge,
  gorge,
  depot,
  oil: oilField,
  quarry,
  airstrip,
  ranch,
  observatory,
}
