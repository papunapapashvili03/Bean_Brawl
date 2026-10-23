import type * as THREE from 'three'
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
  silverWheel,
  smooth,
  surface,
  surfaceZ,
  wheel,
  type CarBuild,
  type P2,
  type Part,
  type WheelStyle,
} from './kit'

// 1979 Ford Mustang coupe (the first "Fox" body): a long-bonneted silver notchback with a sunroof, a slanted
// nose with four square headlamps, a black rubbing strip and a red pinstripe down the sides, louvres behind
// the quarter windows, ribbed tail lamps and turbine wheels on whitewall tyres. 4.55 m long, 1.75 wide, 1.31
// high.

const PAINT = paint('#b0acb8', true)
const R = 0.313
const FRONT = 1.325
const REAR = -1.225
const TRACK = 0.715
const EDGE = 0.04

const WINDSCREEN: [P2, P2] = [
  [0.52, 0.86],
  [-0.22, 1.25],
]
const BACKLIGHT: [P2, P2] = [
  [-1.02, 1.27],
  [-1.46, 0.88],
]

const BODY = surface(
  smooth([
    [2.1, 0.26, 0.06],
    ...arch(FRONT, R, 0.39, 0.25),
    ...arch(REAR, R, 0.39, 0.25),
    [-2.1, 0.27, 0.05],
    [-2.235, 0.36, 0.05],
    [-2.235, 0.76, 0.04],
    [-2.16, 0.86, 0.06],
    [-1.4, 0.89],
    [0.5, 0.88],
    [2.1, 0.74, 0.05],
    [2.2, 0.7, 0.03],
    [2.235, 0.52, 0.03],
    [2.23, 0.34, 0.06],
  ]),
  plan({ half: 0.875, nose: 2.235, tail: -2.235, round: 0.4, pinch: 0.07, tailRound: 0.3, tailPinch: 0.05, tuck: 0.45, tuckIn: 0.15 }),
  EDGE,
)
const CABIN = surface(
  smooth([WINDSCREEN[0], [...WINDSCREEN[1], 0.12], [...BACKLIGHT[0], 0.1], BACKLIGHT[1]]),
  plan({ half: 0.8, nose: 0.52, tail: -1.46, round: 0.25, pinch: 0.04, belt: 0.86, lean: 0.28 }),
  EDGE,
)

const DOOR_GLASS: P2[] = [
  [0.38, 0.9],
  [-0.2, 1.205],
  [-0.62, 1.215],
  [-0.62, 0.9],
]
const QUARTER_GLASS: P2[] = [
  [-0.68, 0.9],
  [-0.68, 1.215],
  [-0.86, 1.215],
  [-0.86, 0.9],
]
// The louvred panel behind the quarter window, up against the rear window
const LOUVRE_PANEL: P2[] = [
  [-0.92, 0.91],
  [-0.92, 1.21],
  [-1.03, 1.21],
  [-1.3, 0.91],
]
const louvreTop = (x: number) => Math.min(1.19, 1.21 + (x + 1.03) * 1.111 - 0.02)

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.185,
  rim: 0.19,
  face: silverWheel,
  dish: 0.012,
  slots: { n: 24, r0: 0.075, r1: 0.165, wide: 0.011 },
  rings: [{ r0: 0.172, r1: 0.19, material: chrome }],
  cap: { r: 0.05, material: chrome, dome: 0.03 },
  whitewall: [0.215, 0.26],
}

const along = ([a, b]: [P2, P2], t0: number, t1: number, n = 5) =>
  line([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], n)
const HEADLAMP = lamp('#e6edf2', 0.15)
const TAIL = lamp('#b3121c', 0.3)
const AMBER = lamp('#f5a623', 0.3)
const PIN = paint('#c0202c')

export function buildMustang(): CarBuild {
  const lower = shell(BODY)
  const cabin = shell(CABIN)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(BODY, x, y) + lift
  const both = (path: P2[], z0: number, z1: number, look: THREE.Material, lift = 0.009, margin = 0.01) =>
    [1, -1].map((s) => part(rimPatch(path, BODY, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin, lift }), look))
  const fascia = line([2.232, 0.53], [2.205, 0.69], 3)
  const lampRow = line([2.23, 0.555], [2.212, 0.665], 2)
  const tailRow = line([-2.235, 0.52], [-2.235, 0.72], 2)

  const parts: Part[] = [
    part(lower, PAINT, undefined, undefined, true),
    part(cabin, PAINT, undefined, undefined, true),

    // Glass with bright chrome surrounds, the louvres, and the sunroof
    part(rimPatch(along(WINDSCREEN, 0.06, 0.88), CABIN, { margin: 0.05 }), glass),
    part(rimPatch(along(BACKLIGHT, 0.12, 0.94), CABIN, { margin: 0.07 }), glass),
    ...[DOOR_GLASS, QUARTER_GLASS].flatMap((w) => [
      ...bothSides((s) => sidePatch(grow(w, 0.02), CABIN, s, 0.002), chrome),
      ...bothSides((s) => sidePatch(w, CABIN, s, 0.004), glass),
    ]),
    ...bothSides((s) => sidePatch(LOUVRE_PANEL, CABIN, s, 0.003), blackTrim),
    ...[-0.95, -1.0, -1.05, -1.1, -1.15, -1.2].flatMap((x) =>
      bothSides((s) => sideLine([[x, 0.93], [x, louvreTop(x)]], 0.022, CABIN, s, 0.006), PAINT),
    ),
    part(rimPatch(line([-0.3, 1.262], [-0.86, 1.272], 4), CABIN, { z0: -0.44, z1: 0.44, lift: 0.003 }), chrome),
    part(rimPatch(line([-0.33, 1.263], [-0.83, 1.271], 4), CABIN, { z0: -0.41, z1: 0.41, lift: 0.005 }), glass),

    // Nose: a black fascia with four square headlamps and a slatted grille, amber parking lamps and a black
    // strip on the bumper below
    part(rimPatch(fascia, BODY, { margin: 0.01, lift: 0.005 }), blackTrim),
    ...both(lampRow, 0.46, 0.58, HEADLAMP),
    ...both(lampRow, 0.62, 0.74, HEADLAMP),
    ...[0.585, 0.615, 0.645].map((y) => part(rimPatch(line([2.227, y - 0.006], [2.224, y + 0.006], 1), BODY, { z0: -0.38, z1: 0.38, lift: 0.008 }), plasticGrey)),
    part(roundBox(0.02, 0.05, 0.12), chrome, [2.268, 0.615, 0]),
    ...both(line([2.235, 0.455], [2.235, 0.49], 1), 0.55, 0.74, AMBER),
    part(rimPatch(line([2.235, 0.38], [2.234, 0.44], 1), BODY, { margin: 0.005, lift: 0.006 }), blackTrim),
    ...pair(roundBox(0.07, 0.035, 0.02, 0.01), AMBER, [2.08, 0.6, onSide(2.08, 0.6)]),

    // Tail: wide red lamps with vertical ribs, reversing lamps by the number plate, a black bumper strip
    ...both(tailRow, 0.2, 1, TAIL),
    ...both(tailRow, 0.2, 0.28, lamp('#f1f1ee', 0.2), 0.011),
    ...[0.34, 0.4, 0.46, 0.52, 0.58, 0.64, 0.7].flatMap((z) => both(tailRow, z - 0.006, z + 0.006, shadowy, 0.012)),
    part(rimPatch(line([-2.235, 0.53], [-2.235, 0.69], 2), BODY, { z0: -0.17, z1: 0.17, lift: 0.007 }), paint('#eeeeea')),
    part(rimPatch(line([-2.235, 0.38], [-2.235, 0.44], 1), BODY, { margin: 0.005, lift: 0.006 }), blackTrim),
    ...pair(roundBox(0.02, 0.03, 0.2, 0.008), chrome, [-2.25, 0.77, 0.45]),

    // Sides: red pinstripe on the shoulder, black rubbing strip with a chrome edge, chrome sill, shut lines,
    // handle, mirrors
    ...bothSides((s) => sideLine([[2.18, 0.8], [-2.18, 0.8]], 0.012, BODY, s, 0.006), PIN),
    ...[
      [2.2, 1.72],
      [0.93, -0.83],
      [-1.62, -2.2],
    ].flatMap(([a, b]) => [
      ...bothSides((s) => sideLine([[a, 0.44], [b, 0.44]], 0.085, BODY, s, 0.006), blackTrim),
      ...bothSides((s) => sideLine([[a, 0.487], [b, 0.487]], 0.012, BODY, s, 0.007), chrome),
    ]),
    ...bothSides((s) => sideLine([[0.9, 0.29], [-0.8, 0.29]], 0.03, BODY, s, 0.006), chrome),
    ...[0.48, -0.66].flatMap((x) => bothSides((s) => sideLine([[x, 0.3], [x, 0.87]], 0.01, BODY, s, 0.004), shadowy)),
    ...pair(roundBox(0.12, 0.03, 0.03, 0.01), chrome, [-0.5, 0.8, onSide(-0.5, 0.8, 0.01)]),
    ...pair(roundBox(0.09, 0.07, 0.13, 0.025), chrome, [0.4, 0.95, 0.9]),

    ...pair(roundBox(0.02, 0.015, 0.45, 0.006), blackTrim, [0.5, 0.9, 0.22], [0, 0.25, 0.49]),
    part(roundBox(0.8, 0.5, 1.2, 0.05), shadowy, [FRONT, 0.48, 0]),
    part(roundBox(0.8, 0.5, 1.2, 0.05), shadowy, [REAR, 0.48, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [lower, cabin] }
}
