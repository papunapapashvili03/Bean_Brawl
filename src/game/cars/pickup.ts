import * as THREE from 'three'
import {
  arch,
  blackTrim,
  bothSides,
  chrome,
  glass,
  grow,
  lamp,
  line,
  paint,
  pair,
  part,
  plan,
  rimPatch,
  roundBox,
  shadowy,
  shell,
  sideLine,
  sidePatch,
  smooth,
  surface,
  surfaceZ,
  wheel,
  type CarBuild,
  type P2,
  type Part,
  type WheelStyle,
} from './kit'

// An old pickup truck: a long square bonnet, a short cab with a near-upright windscreen, an open bed with a
// tailgate, a chrome grille with square headlamps and chrome bumpers, faded blue paint over a white roof.
// 5.05 m long, 1.96 wide, 1.82 high.

const BLUE = paint('#5d89a8')
const WHITE = paint('#ece9e1')
const R = 0.38 // tyre radius
const FRONT = 1.62
const REAR = -1.5
const TRACK = 0.8
const EDGE = 0.05
const HALF = 0.98
const BED = { x0: -0.64, x1: -2.5, floor: 0.72, rail: 1.07 }

// The lower body: bonnet and front wings up to the belt, the cab's lower half, and the bed's floor behind it
const BODY = surface(
  smooth([
    [2.46, 0.36, 0.06],
    ...arch(FRONT, R, 0.52, 0.36),
    ...arch(REAR, R, 0.52, 0.36),
    [-2.48, 0.36, 0.05],
    [-2.52, BED.floor, 0.03],
    [BED.x0, BED.floor],
    [BED.x0, 1.04, 0.03],
    [0.95, 1.04],
    [2.42, 1.0, 0.05],
    [2.52, 0.92, 0.04],
    [2.53, 0.42, 0.05],
  ]),
  plan({ half: HALF, nose: 2.53, tail: -2.52, round: 0.25, pinch: 0.04, tailRound: 0.1, tailPinch: 0.02, tuck: 0.5, tuckIn: 0.1 }),
  EDGE,
)
const WINDSCREEN: [P2, P2] = [
  [0.94, 1.06],
  [0.56, 1.74],
]
const CABIN = surface(
  smooth([WINDSCREEN[0], [...WINDSCREEN[1], 0.08], [-0.52, 1.77, 0.06], [-0.6, 1.04]]),
  plan({ half: 0.9, nose: 0.95, tail: -0.62, round: 0.15, pinch: 0.03, belt: 1.04, lean: 0.12 }),
  EDGE,
)

const DOOR_WINDOW: P2[] = [
  [0.8, 1.12],
  [0.5, 1.68],
  [-0.08, 1.7],
  [-0.08, 1.12],
]
const BACK_WINDOW: P2[] = [
  [-0.16, 1.12],
  [-0.16, 1.7],
  [-0.44, 1.71],
  [-0.47, 1.12],
]

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.24,
  rim: 0.21,
  face: paint('#e9e9e4'),
  dish: 0.03,
  rings: [{ r0: 0.17, r1: 0.21, material: paint('#cfcfca') }],
  cap: { r: 0.08, material: chrome, dome: 0.03 },
  nuts: { n: 6, r: 0.12 },
}

// A box from min to max corners
const slab = (min: [number, number, number], max: [number, number, number]) =>
  new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]).translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)

export function buildPickup(): CarBuild {
  const lower = shell(BODY)
  const cabin = shell(CABIN)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(BODY, x, y) + lift
  const lamps = (path: P2[], z0: number, z1: number, look: ReturnType<typeof lamp>, lift = 0.009) =>
    [1, -1].map((s) => part(rimPatch(path, BODY, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin: 0.02, lift }), look))
  const bedLength = BED.x0 - BED.x1
  const bedMid = (BED.x0 + BED.x1) / 2
  const wall = BED.rail - BED.floor

  const parts: Part[] = [
    part(lower, BLUE, undefined, undefined, true),
    part(cabin, WHITE, undefined, undefined, true),

    // The bed: its floor lined in black, the side walls with a capped rail, and the tailgate
    part(rimPatch(line([BED.x0 - 0.05, BED.floor], [BED.x1 + 0.04, BED.floor], 6), BODY, { margin: 0.08, lift: 0.004 }), shadowy),
    ...pair(roundBox(bedLength, wall, 0.08, 0.02), BLUE, [bedMid, BED.floor + wall / 2, HALF - 0.04], undefined, true),
    ...pair(roundBox(bedLength + 0.02, 0.04, 0.12, 0.015), WHITE, [bedMid, BED.rail + 0.01, HALF - 0.05]),
    part(roundBox(0.08, wall, HALF * 2 - 0.02, 0.02), BLUE, [BED.x1 + 0.02, BED.floor + wall / 2, 0], undefined, true),
    part(roundBox(0.04, 0.06, HALF * 2 - 0.4, 0.015), chrome, [BED.x1 - 0.03, BED.rail - 0.1, 0]),

    // Glass: windscreen, back window, the door and quarter windows in black frames
    part(rimPatch(line(...WINDSCREEN, 4), CABIN, { margin: 0.07 }), glass),
    part(rimPatch(line([-0.6, 1.16], [-0.53, 1.68], 3), CABIN, { margin: 0.18, lift: 0.004 }), glass),
    ...[DOOR_WINDOW, BACK_WINDOW].flatMap((w) => [
      ...bothSides((s) => sidePatch(grow(w, 0.02), CABIN, s, 0.002), blackTrim),
      ...bothSides((s) => sidePatch(w, CABIN, s, 0.004), glass),
    ]),

    // Front: a chrome grille across the nose with square headlamps at its ends, amber lamps, the bumper
    part(rimPatch(line([2.53, 0.5], [2.52, 0.88], 3), BODY, { z0: -0.62, z1: 0.62, lift: 0.006 }), chrome),
    part(rimPatch(line([2.535, 0.54], [2.525, 0.84], 3), BODY, { z0: -0.58, z1: 0.58, lift: 0.009 }), blackTrim),
    ...[-0.4, -0.2, 0, 0.2, 0.4].map((z) => part(roundBox(0.03, 0.3, 0.025, 0.008), chrome, [2.56, 0.69, z])),
    ...lamps(line([2.53, 0.6], [2.525, 0.82], 2), 0.64, 0.86, lamp('#eef3f6', 0.2)),
    ...lamps(line([2.53, 0.5], [2.53, 0.58], 1), 0.66, 0.86, lamp('#f5a623', 0.3)),
    part(roundBox(0.14, 0.18, HALF * 2 + 0.04, 0.04), chrome, [2.6, 0.42, 0], undefined, true),

    // Back: tail lamps on the bed's corners, a chrome step bumper
    ...pair(roundBox(0.05, 0.22, 0.1, 0.015), lamp('#b3121c', 0.3), [BED.x1 - 0.01, 0.9, HALF - 0.08]),
    part(roundBox(0.16, 0.16, HALF * 2 + 0.02, 0.04), chrome, [-2.6, 0.44, 0], undefined, true),

    // Sides: door shut lines, a handle, side marker lamps, a white stripe, big square mirrors
    ...[0.92, -0.58].flatMap((x) => bothSides((s) => sideLine([[x, 0.42], [x, 1.03]], 0.01, BODY, s, 0.004), shadowy)),
    ...bothSides((s) => sideLine([[0.92, 0.42], [-0.58, 0.42]], 0.01, BODY, s, 0.004), shadowy),
    ...pair(roundBox(0.14, 0.035, 0.03, 0.012), chrome, [-0.38, 0.98, onSide(-0.38, 0.98, 0.01)]),
    ...pair(roundBox(0.08, 0.04, 0.02, 0.01), lamp('#f5a623', 0.3), [2.3, 0.78, onSide(2.3, 0.78)]),
    ...pair(roundBox(0.08, 0.04, 0.02, 0.01), lamp('#b3121c', 0.3), [-2.38, 0.92, HALF + 0.005]),
    ...bothSides((s) => sideLine([[2.4, 0.84], [BED.x0 + 0.02, 0.84]], 0.035, BODY, s, 0.006), WHITE),
    ...pair(roundBox(0.03, 0.03, 0.22, 0.01), chrome, [0.86, 1.28, 0.98]),
    ...pair(roundBox(0.04, 0.24, 0.16, 0.02), blackTrim, [0.86, 1.32, 1.12]),

    // Wipers
    ...pair(roundBox(0.02, 0.015, 0.5, 0.006), blackTrim, [0.93, 1.1, 0.25], [0, 0.2, 0.9]),

    // Wheels in dark wells
    part(roundBox(0.88, 0.5, 1.6, 0.05), shadowy, [FRONT, 0.52, 0]),
    part(roundBox(0.88, 0.5, 1.6, 0.05), shadowy, [REAR, 0.52, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  // Collider: the front end, the bed (walked on at its rails), the cab
  const front = slab([BED.x0, 0.3, -HALF], [2.58, 1.04, HALF])
  const bed = slab([-2.56, 0.3, -HALF], [BED.x0, BED.rail, HALF])
  return { parts, hulls: [front, bed, cabin] }
}
