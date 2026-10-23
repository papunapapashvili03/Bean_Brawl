import {
  arch,
  blackTrim,
  bothSides,
  chrome,
  glass,
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
  wheel,
  type CarBuild,
  type P2,
  type Part,
  type WheelStyle,
} from './kit'

// A red city bus: a long rounded box on small wheels with a big windscreen and a lit destination sign, a
// band of black-framed windows down each side, folding doors on its right, a white stripe below the windows.
// 8.5 m long, 2.4 wide, 2.9 high.

const RED = paint('#d7263d')
const R = 0.45
const FRONT = 2.3
const REAR = -2.2
const TRACK = 0.98
const EDGE = 0.12

const BODY = surface(
  smooth([
    [4.02, 0.36, 0.15],
    ...arch(FRONT, R, 0.65, 0.36),
    ...arch(REAR, R, 0.65, 0.36),
    [-4.02, 0.36, 0.15],
    [-4.13, 1.2],
    [-4.1, 2.66, 0.25],
    [3.95, 2.66, 0.3],
    [4.13, 2.2, 0.15],
    [4.13, 0.6, 0.12],
  ]),
  plan({ half: 1.2, nose: 4.13, tail: -4.13, round: 0.35, pinch: 0.06, tailRound: 0.3, tailPinch: 0.05, tuck: 0.6, tuckIn: 0.1 }),
  EDGE,
)

const PANES = [
  [3.1, 2.25],
  [2.15, 1.2],
  [1.1, 0.15],
  [0.05, -0.9],
  [-1.0, -1.95],
  [-2.05, -3.0],
  [-3.1, -3.8],
]
const band = (x0: number, x1: number, y0 = 1.42, y1 = 2.38): P2[] => [
  [x0, y0],
  [x0, y1],
  [x1, y1],
  [x1, y0],
]

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.28,
  rim: 0.26,
  face: paint('#2b2d31'),
  dish: 0.02,
  rings: [{ r0: 0.2, r1: 0.26, material: paint('#3a3d42') }],
  cap: { r: 0.08, material: chrome },
  nuts: { n: 8, r: 0.13 },
}

export function buildCityBus(): CarBuild {
  const body = shell(BODY, 0.2)
  const both = (path: P2[], z0: number, z1: number, look: ReturnType<typeof lamp>, lift = 0.01) =>
    [1, -1].map((s) => part(rimPatch(path, BODY, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin: 0.02, lift }), look))
  const front = line([4.13, 1.25], [4.13, 2.12], 3)

  const parts: Part[] = [
    part(body, RED, undefined, undefined, true),

    // Windows: a black band with the panes in it; the windscreen, the destination sign above it; rear window
    ...bothSides((s) => sidePatch(band(3.45, -3.95, 1.36, 2.44), BODY, s, 0.003), blackTrim),
    ...PANES.flatMap(([a, b]) => bothSides((s) => sidePatch(band(a, b), BODY, s, 0.005), glass)),
    part(rimPatch(front, BODY, { margin: 0.1, lift: 0.006 }), glass),
    part(rimPatch(line([4.13, 2.2], [4.08, 2.42], 1), BODY, { z0: -0.9, z1: 0.9, lift: 0.006 }), blackTrim),
    part(rimPatch(line([4.13, 2.25], [4.09, 2.38], 1), BODY, { z0: -0.6, z1: 0.6, lift: 0.009 }), lamp('#ffb020', 0.9)),
    part(rimPatch(line([-4.12, 1.6], [-4.1, 2.35], 3), BODY, { z0: -0.8, z1: 0.8, lift: 0.006 }), glass),

    // Doors on the right (+z): the front one ahead of the front wheels, one in the middle
    ...[
      [3.95, 3.0],
      [0.1, -0.95],
    ].flatMap(([a, b]) => [
      part(sidePatch(band(a, b, 0.42, 2.44), BODY, 1, 0.004), blackTrim),
      part(sidePatch(band(a - 0.06, (a + b) / 2 + 0.02, 0.5, 2.36), BODY, 1, 0.007), glass),
      part(sidePatch(band((a + b) / 2 - 0.02, b + 0.06, 0.5, 2.36), BODY, 1, 0.007), glass),
    ]),

    // A white stripe under the windows, a black skirt along the bottom
    ...bothSides((s) => sideLine([[4.1, 1.18], [-4.1, 1.18]], 0.14, BODY, s, 0.006), paint('#f4f1ea')),
    ...bothSides((s) => sideLine([[1.6, 0.52], [-1.5, 0.52]], 0.12, BODY, s, 0.006), blackTrim),

    // Front: headlamps, a black grille, the bumper; back: tail lamps and bumper
    ...both(line([4.13, 0.66], [4.13, 0.82], 1), 0.72, 1.1, lamp('#eef3f6', 0.2)),
    ...both(line([4.13, 0.9], [4.13, 0.96], 1), 0.8, 1.1, lamp('#f5a623', 0.3)),
    part(rimPatch(line([4.13, 0.62], [4.13, 0.86], 1), BODY, { z0: -0.55, z1: 0.55, lift: 0.008 }), blackTrim),
    part(roundBox(0.18, 0.26, 2.3, 0.08), blackTrim, [4.2, 0.46, 0], undefined, true),
    ...both(line([-4.13, 0.75], [-4.12, 1.12], 2), 0.8, 1.1, lamp('#b3121c', 0.3)),
    part(roundBox(0.18, 0.26, 2.3, 0.08), blackTrim, [-4.2, 0.46, 0], undefined, true),

    // Big mirrors on arms out front
    ...pair(roundBox(0.06, 0.06, 0.35, 0.02), blackTrim, [4.1, 2.1, 1.25], [0, 0, 0]),
    ...pair(roundBox(0.1, 0.36, 0.14, 0.04), blackTrim, [4.1, 1.95, 1.43]),

    part(roundBox(1.35, 0.7, 1.9, 0.08), shadowy, [FRONT, 0.7, 0]),
    part(roundBox(1.35, 0.7, 1.9, 0.08), shadowy, [REAR, 0.7, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [body] }
}
