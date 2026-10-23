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

// Yugo 45: a small, boxy red three-door hatchback with black bumpers, a black grille band with square
// headlights, a black rubbing strip down the side and grey wheel covers. 3.49 m long, 1.54 wide, 1.39 high.

const RED = paint('#c0161f')
const R = 0.27 // tyre radius
const FRONT = 1.08
const REAR = -1.07
const TRACK = 0.66 // wheel centre from the middle
const EDGE = 0.05 // how round the body's edges are

const WINDSCREEN: [P2, P2] = [
  [0.68, 0.84],
  [0.2, 1.3],
]
const HATCH: [P2, P2] = [
  [-1.3, 1.33],
  [-1.6, 0.86],
]

// The body below the windows, and the cabin on top (their silhouettes are these outlines grown by EDGE)
const BODY = surface(
  smooth([
    [1.62, 0.25, 0.06],
    ...arch(FRONT, R, 0.38, 0.25),
    ...arch(REAR, R, 0.38, 0.25),
    [-1.62, 0.26, 0.06],
    [-1.69, 0.5],
    [-1.67, 0.86, 0.04],
    [0.66, 0.86],
    [1.62, 0.7, 0.05],
    [1.7, 0.64, 0.03],
    [1.71, 0.34, 0.06],
  ]),
  plan({ half: 0.77, nose: 1.71, tail: -1.69, round: 0.45, pinch: 0.1, tailRound: 0.3, tailPinch: 0.06, tuck: 0.42, tuckIn: 0.12 }),
  EDGE,
)
const CABIN = surface(
  smooth([WINDSCREEN[0], [...WINDSCREEN[1], 0.14], [...HATCH[0], 0.12], HATCH[1]]),
  plan({ half: 0.73, nose: 0.68, tail: -1.6, round: 0.3, pinch: 0.05, belt: 0.86, lean: 0.21 }),
  EDGE,
)

const WINDOWS: P2[][] = [
  [
    [0.55, 0.9],
    [0.2, 1.235],
    [-0.42, 1.262],
    [-0.42, 0.9],
  ],
  [
    [-0.52, 0.9],
    [-0.52, 1.265],
    [-1.2, 1.275],
    [-1.43, 0.93],
  ],
]
const B_PILLAR: P2[] = [
  [-0.4, 0.88],
  [-0.4, 1.28],
  [-0.54, 1.28],
  [-0.54, 0.88],
]

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.15,
  rim: 0.175,
  face: paint('#c4c7cc'),
  dish: 0.012,
  slots: { n: 10, r0: 0.085, r1: 0.155, wide: 0.018 },
  rings: [{ r0: 0.163, r1: 0.175, material: paint('#d8dade') }],
  cap: { r: 0.045, material: paint('#aeb1b6') },
}

const along = ([a, b]: [P2, P2], t0: number, t1: number, n = 5) =>
  line([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], n)
const RED_LINE = paint('#c8202a')

export function buildYugo(): CarBuild {
  const lower = shell(BODY)
  const cabin = shell(CABIN)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(BODY, x, y) + lift
  const lamps = (path: P2[], z0: number, z1: number, look: ReturnType<typeof lamp>, lift = 0.009) =>
    [1, -1].map((s) => part(rimPatch(path, BODY, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin: 0.03, lift }), look))

  const parts: Part[] = [
    part(lower, RED, undefined, undefined, true),
    part(cabin, RED, undefined, undefined, true),

    // Glass: windscreen, hatch, and the side windows in black rubber frames with a black B-pillar
    part(rimPatch(along(WINDSCREEN, 0.07, 0.88), CABIN, { margin: 0.06 }), glass),
    part(rimPatch(along(HATCH, 0.14, 0.94), CABIN, { margin: 0.07 }), glass),
    ...WINDOWS.flatMap((w) => [
      ...bothSides((s) => sidePatch(grow(w, 0.018), CABIN, s, 0.002), blackTrim),
      ...bothSides((s) => sidePatch(w, CABIN, s, 0.004), glass),
    ]),
    ...bothSides((s) => sidePatch(B_PILLAR, CABIN, s, 0.002), blackTrim),

    // Front: the black grille band with square headlights at its ends, a little badge, the bumper
    part(rimPatch(line([1.71, 0.4], [1.7, 0.62], 2), BODY, { margin: 0.015 }), blackTrim),
    ...lamps(line([1.71, 0.445], [1.7, 0.6], 2), 0.38, 0.7, lamp('#e4ecf0', 0.15)),
    part(roundBox(0.02, 0.06, 0.12), chrome, [1.756, 0.53, 0]),
    part(roundBox(0.16, 0.16, 1.5, 0.06), blackTrim, [1.76, 0.3, 0], undefined, true),
    part(roundBox(0.012, 0.016, 1.34, 0.005), RED_LINE, [1.841, 0.33, 0]),
    ...pair(roundBox(0.3, 0.16, 0.1, 0.04), blackTrim, [1.58, 0.3, 0.72]),
    ...pair(roundBox(0.05, 0.035, 0.02, 0.01), lamp('#f5a623', 0.3), [1.3, 0.66, onSide(1.3, 0.66)]),

    // Back: tail lights (red with an amber inside end), number plate, bumper
    ...lamps(line([-1.69, 0.58], [-1.675, 0.8], 2), 0.44, 0.7, lamp('#b3121c', 0.3), 0.008),
    ...lamps(line([-1.69, 0.58], [-1.675, 0.8], 2), 0.36, 0.44, lamp('#f39a1d', 0.3), 0.008),
    part(rimPatch(line([-1.66, 0.4], [-1.69, 0.5], 2), BODY, { z0: -0.24, z1: 0.24, lift: 0.006 }), paint('#eeeeea')),
    part(roundBox(0.16, 0.16, 1.5, 0.06), blackTrim, [-1.76, 0.32, 0], undefined, true),
    part(roundBox(0.012, 0.016, 1.34, 0.005), RED_LINE, [-1.841, 0.35, 0]),
    ...pair(roundBox(0.3, 0.16, 0.1, 0.04), blackTrim, [-1.58, 0.32, 0.73]),

    // Sides: the black rubbing strip with its red line, door shut lines, handle, badge, mirrors
    ...bothSides((s) => sideLine([[0.72, 0.46], [-0.68, 0.46]], 0.075, BODY, s, 0.006), blackTrim),
    ...bothSides((s) => sideLine([[0.72, 0.46], [-0.68, 0.46]], 0.012, BODY, s, 0.009), RED_LINE),
    ...[0.64, -0.5].flatMap((x) => bothSides((s) => sideLine([[x, 0.3], [x, 0.85]], 0.01, BODY, s, 0.004), shadowy)),
    ...pair(roundBox(0.13, 0.035, 0.03, 0.012), blackTrim, [-0.33, 0.8, onSide(-0.33, 0.8, 0.01)]),
    ...pair(roundBox(0.2, 0.035, 0.012, 0.005), chrome, [0.9, 0.53, onSide(0.9, 0.53, 0.004)]),
    ...pair(roundBox(0.09, 0.09, 0.15, 0.03), blackTrim, [0.5, 0.97, 0.84]),
    ...pair(roundBox(0.05, 0.03, 0.08, 0.01), blackTrim, [0.53, 0.94, 0.765]),

    // Wipers, and the little air vent on the bonnet
    ...pair(roundBox(0.02, 0.015, 0.42, 0.006), blackTrim, [0.66, 0.905, 0.2], [0, 0.25, 0.76]),
    part(roundBox(0.16, 0.035, 0.12, 0.012), blackTrim, [1.36, 0.787, 0.42], [0, 0, -0.14]),

    // Wheels in dark wells
    part(roundBox(0.72, 0.45, 1.14, 0.05), shadowy, [FRONT, 0.45, 0]),
    part(roundBox(0.72, 0.45, 1.14, 0.05), shadowy, [REAR, 0.45, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [lower, cabin] }
}
