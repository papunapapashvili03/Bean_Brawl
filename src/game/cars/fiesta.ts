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
  plasticGrey,
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

// Ford Fiesta Mk4 (1996): a rounded aubergine five-door hatch with big swept headlamps either side of a small
// oval grille, grey bumpers, a black strip along the doors and silver plastic wheel trims. 3.83 m long, 1.63
// wide, 1.32 high.

const PAINT = paint('#5b2d63', true)
const R = 0.28
const FRONT = 1.195
const REAR = -1.251
const TRACK = 0.7
const EDGE = 0.06

const WINDSCREEN: [P2, P2] = [
  [0.76, 0.86],
  [0, 1.27],
]
const HATCH: [P2, P2] = [
  [-1.38, 1.26],
  [-1.78, 0.9],
]

const BODY = surface(
  smooth([
    [1.74, 0.25, 0.08],
    ...arch(FRONT, R, 0.4, 0.25),
    ...arch(REAR, R, 0.4, 0.25),
    [-1.73, 0.26, 0.08],
    [-1.855, 0.4, 0.05],
    [-1.86, 0.64, 0.05],
    [-1.82, 0.88, 0.06],
    [0.72, 0.88],
    [1.35, 0.78, 0.3],
    [1.8, 0.62, 0.12],
    [1.855, 0.42, 0.1],
  ]),
  plan({ half: 0.815, nose: 1.855, tail: -1.86, round: 0.6, pinch: 0.16, tailRound: 0.35, tailPinch: 0.08, tuck: 0.45, tuckIn: 0.2 }),
  EDGE,
)
const CABIN = surface(
  smooth([WINDSCREEN[0], [...WINDSCREEN[1], 0.18], [...HATCH[0], 0.16], HATCH[1]]),
  plan({ half: 0.77, nose: 0.76, tail: -1.78, round: 0.3, pinch: 0.05, tailRound: 0.25, tailPinch: 0.05, belt: 0.86, lean: 0.3 }),
  EDGE,
)

// Front door, rear door and rear quarter windows, and the black pillars between them
const WINDOWS: P2[][] = [
  [
    [0.58, 0.92],
    [0.06, 1.2],
    [-0.32, 1.205],
    [-0.32, 0.92],
  ],
  [
    [-0.42, 0.93],
    [-0.42, 1.205],
    [-0.95, 1.2],
    [-0.95, 0.93],
  ],
  [
    [-1.03, 0.93],
    [-1.03, 1.195],
    [-1.28, 1.19],
    [-1.52, 0.95],
  ],
]
const PILLARS: P2[][] = [
  [
    [-0.31, 0.9],
    [-0.31, 1.215],
    [-0.43, 1.215],
    [-0.43, 0.9],
  ],
  [
    [-0.94, 0.91],
    [-0.94, 1.205],
    [-1.04, 1.205],
    [-1.04, 0.91],
  ],
]

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.165,
  rim: 0.18,
  face: paint('#c6c9ce'),
  dish: 0.014,
  holes: { n: 7, r0: 0.07, r1: 0.15, fill: 0.42 },
  rings: [{ r0: 0.165, r1: 0.18, material: paint('#d9dbdf') }],
  cap: { r: 0.05, material: paint('#b3b6bb') },
}

const along = ([a, b]: [P2, P2], t0: number, t1: number, n = 5) =>
  line([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], n)

// A flat oval facing forwards (the grille, the badge), leaning back with the nose
const oval = (rx: number, ry: number) => new THREE.CircleGeometry(1, 32).scale(rx, ry, 1).rotateY(Math.PI / 2)
const HEADLAMP = lamp('#e1e8ee', 0.15)
const TAIL = lamp('#b0101c', 0.3)

export function buildFiesta(): CarBuild {
  const lower = shell(BODY)
  const cabin = shell(CABIN)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(BODY, x, y) + lift
  const lamps = (path: P2[], z0: number, z1: number, look: THREE.Material, lift = 0.009) =>
    [1, -1].map((s) => part(rimPatch(path, BODY, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin: 0.005, lift }), look))

  const parts: Part[] = [
    part(lower, PAINT, undefined, undefined, true),
    part(cabin, PAINT, undefined, undefined, true),

    // Glass in black frames, black pillars between the windows
    part(rimPatch(along(WINDSCREEN, 0.06, 0.86, 6), CABIN, { margin: 0.07 }), glass),
    part(rimPatch(along(HATCH, 0.14, 0.93), CABIN, { margin: 0.1 }), glass),
    ...WINDOWS.flatMap((w) => [
      ...bothSides((s) => sidePatch(grow(w, 0.018), CABIN, s, 0.002), blackTrim),
      ...bothSides((s) => sidePatch(w, CABIN, s, 0.004), glass),
    ]),
    ...PILLARS.flatMap((p) => bothSides((s) => sidePatch(p, CABIN, s, 0.002), blackTrim)),

    // Front: grey bumper wrapping round the corners, with a black mouth; swept headlamps; the oval grille
    part(rimPatch(line([1.78, 0.26], [1.85, 0.47], 4), BODY, { margin: 0.005, lift: 0.006 }), plasticGrey),
    ...bothSides((s) => sidePatch([[1.62, 0.29], [1.56, 0.47], [1.9, 0.47], [1.8, 0.27]], BODY, s, 0.006), plasticGrey),
    part(rimPatch(line([1.83, 0.31], [1.85, 0.39], 2), BODY, { z0: -0.38, z1: 0.38, lift: 0.01 }), blackTrim),
    ...lamps(line([1.84, 0.49], [1.81, 0.6], 3), 0.24, 1, HEADLAMP),
    ...bothSides((s) => sidePatch([[1.58, 0.56], [1.6, 0.64], [1.82, 0.63], [1.9, 0.5]], BODY, s, 0.009), HEADLAMP),
    part(oval(0.19, 0.055), chrome, [1.883, 0.555, 0], [0, 0, 0.25]),
    part(oval(0.175, 0.045), shadowy, [1.886, 0.555, 0], [0, 0, 0.25]),
    part(oval(0.06, 0.024), paint('#1c4fa0'), [1.889, 0.555, 0], [0, 0, 0.25]),

    // Back: grey bumper, tall tail lamps either side of the tailgate wrapping round the corners, number plate
    part(rimPatch(line([-1.74, 0.27], [-1.855, 0.47], 4), BODY, { margin: 0.005, lift: 0.006 }), plasticGrey),
    ...bothSides((s) => sidePatch([[-1.67, 0.29], [-1.62, 0.47], [-1.9, 0.47], [-1.78, 0.27]], BODY, s, 0.006), plasticGrey),
    ...lamps(line([-1.86, 0.6], [-1.83, 0.85], 3), 0.5, 1, TAIL, 0.008),
    ...lamps(line([-1.85, 0.79], [-1.83, 0.85], 1), 0.5, 1, lamp('#f39a1d', 0.3), 0.01),
    ...bothSides((s) => sidePatch([[-1.7, 0.6], [-1.69, 0.84], [-1.88, 0.85], [-1.9, 0.6]], BODY, s, 0.008), TAIL),
    part(rimPatch(line([-1.86, 0.61], [-1.85, 0.73], 2), BODY, { z0: -0.26, z1: 0.26, lift: 0.006 }), paint('#eeeeea')),

    // Sides: black strip along the doors, shut lines, handles, the orange repeater, mirrors, the aerial
    ...bothSides((s) => sideLine([[0.95, 0.58], [-1.0, 0.58]], 0.05, BODY, s, 0.006), blackTrim),
    ...[0.8, -0.37].flatMap((x) => bothSides((s) => sideLine([[x, 0.29], [x, 0.87]], 0.01, BODY, s, 0.004), shadowy)),
    ...bothSides((s) => sideLine([[-0.98, 0.62], [-0.98, 0.87]], 0.01, BODY, s, 0.004), shadowy),
    ...[0.25, -0.62].flatMap((x) => pair(roundBox(0.12, 0.035, 0.03, 0.012), blackTrim, [x, 0.8, onSide(x, 0.8, 0.01)])),
    ...pair(roundBox(0.05, 0.03, 0.02, 0.01), lamp('#f5a623', 0.3), [1.3, 0.64, onSide(1.3, 0.64)]),
    ...pair(roundBox(0.1, 0.1, 0.17, 0.035), PAINT, [0.6, 0.97, 0.9]),
    ...pair(roundBox(0.1, 0.05, 0.08, 0.015), blackTrim, [0.62, 0.93, 0.8]),
    part(new THREE.CylinderGeometry(0.004, 0.006, 0.55, 6), blackTrim, [0.0, 1.55, 0.25], [0, 0, 0.35]),

    ...pair(roundBox(0.02, 0.015, 0.45, 0.006), blackTrim, [0.74, 0.895, 0.22], [0, 0.25, 0.5]),
    part(roundBox(0.8, 0.46, 1.2, 0.05), shadowy, [FRONT, 0.46, 0]),
    part(roundBox(0.8, 0.46, 1.2, 0.05), shadowy, [REAR, 0.46, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [lower, cabin] }
}
