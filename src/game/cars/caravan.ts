import * as THREE from 'three'
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

// Dodge Grand Caravan (2011–20): a long, tall dark-blue minivan with a short sloping bonnet, the Dodge
// crosshair grille between big swept headlamps, a band of dark glass along the side with black pillars and a
// sliding door, tall tail lamps beside the tailgate and ten-spoke silver wheels. 5.15 m long, 2.0 wide, 1.73
// high.

const PAINT = paint('#263e69', true)
const R = 0.35
const FRONT = 1.595
const REAR = -1.483
const TRACK = 0.83
const EDGE = 0.07

const WINDSCREEN: [P2, P2] = [
  [1.58, 1.02],
  [0.45, 1.66],
]
const LIFTGATE: [P2, P2] = [
  [-2.25, 1.66],
  [-2.44, 1.06],
]

const BODY = surface(
  smooth([
    [2.35, 0.27, 0.08],
    ...arch(FRONT, R, 0.47, 0.28),
    ...arch(REAR, R, 0.47, 0.28),
    [-2.36, 0.29, 0.08],
    [-2.51, 0.46, 0.06],
    [-2.5, 1.02, 0.06],
    [1.5, 1.04],
    [2.15, 0.9, 0.35],
    [2.42, 0.8, 0.12],
    [2.505, 0.56, 0.12],
    [2.49, 0.34, 0.06],
  ]),
  plan({ half: 1.0, nose: 2.505, tail: -2.51, round: 0.7, pinch: 0.14, tailRound: 0.35, tailPinch: 0.06, tuck: 0.5, tuckIn: 0.15 }),
  EDGE,
)
const CABIN = surface(
  smooth([WINDSCREEN[0], [...WINDSCREEN[1], 0.25], [...LIFTGATE[0], 0.14], LIFTGATE[1]]),
  plan({ half: 0.94, nose: 1.58, tail: -2.44, round: 0.3, pinch: 0.05, tailRound: 0.25, tailPinch: 0.04, belt: 1.02, lean: 0.18 }),
  EDGE,
)

// The dark band down the side (it shows as black pillars between the windows), and the windows in it: a little
// quarter light, the front door, the sliding door and the rear quarter
const BAND: P2[] = [
  [1.44, 1.06],
  [0.52, 1.585],
  [-2.1, 1.595],
  [-2.24, 1.08],
]
const WINDOWS: P2[][] = [
  [
    [1.34, 1.09],
    [1.02, 1.27],
    [1.02, 1.09],
  ],
  [
    [0.94, 1.09],
    [0.94, 1.33],
    [0.56, 1.55],
    [-0.12, 1.555],
    [-0.12, 1.09],
  ],
  [
    [-0.22, 1.09],
    [-0.22, 1.555],
    [-1.18, 1.56],
    [-1.18, 1.09],
  ],
  [
    [-1.3, 1.09],
    [-1.3, 1.56],
    [-2.05, 1.57],
    [-2.17, 1.1],
  ],
]

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.225,
  rim: 0.22,
  face: silverWheel,
  dish: 0.016,
  holes: { n: 10, r0: 0.09, r1: 0.2, fill: 0.45 },
  rings: [{ r0: 0.205, r1: 0.22, material: paint('#dadde2') }],
  cap: { r: 0.055, material: chrome },
}

const along = ([a, b]: [P2, P2], t0: number, t1: number, n = 5) =>
  line([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], n)
const HEADLAMP = lamp('#e6edf2', 0.15)
const TAIL = lamp('#b3121c', 0.3)

export function buildCaravan(): CarBuild {
  const lower = shell(BODY)
  const cabin = shell(CABIN)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(BODY, x, y) + lift
  const both = (path: P2[], z0: number, z1: number, look: THREE.Material, lift = 0.009, surf = BODY) =>
    [1, -1].map((s) => part(rimPatch(path, surf, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin: 0.01, lift }), look))
  const grille = line([2.502, 0.57], [2.44, 0.79], 4)

  const parts: Part[] = [
    part(lower, PAINT, undefined, undefined, true),
    part(cabin, PAINT, undefined, undefined, true),

    // Glass
    part(rimPatch(along(WINDSCREEN, 0.06, 0.86, 6), CABIN, { margin: 0.07 }), glass),
    part(rimPatch(along(LIFTGATE, 0.12, 0.7), CABIN, { margin: 0.13 }), glass),
    ...bothSides((s) => sidePatch(BAND, CABIN, s, 0.002), blackTrim),
    ...WINDOWS.flatMap((w) => bothSides((s) => sidePatch(w, CABIN, s, 0.004), glass)),

    // Front: the crosshair grille in a chrome surround, swept headlamps, a black lower intake
    part(rimPatch(grille, BODY, { z0: -0.47, z1: 0.47, lift: 0.006 }), chrome),
    part(rimPatch(line([2.5, 0.595], [2.447, 0.77], 4), BODY, { z0: -0.43, z1: 0.43, lift: 0.009 }), blackTrim),
    part(rimPatch(line([2.482, 0.665], [2.474, 0.695], 1), BODY, { z0: -0.43, z1: 0.43, lift: 0.012 }), chrome),
    part(rimPatch(line([2.5, 0.595], [2.447, 0.77], 4), BODY, { z0: -0.022, z1: 0.022, lift: 0.012 }), chrome),
    ...both(line([2.49, 0.64], [2.43, 0.8], 3), 0.52, 1, HEADLAMP),
    ...bothSides((s) => sidePatch([[2.02, 0.87], [2.3, 0.85], [2.5, 0.76], [2.5, 0.64], [2.14, 0.73]], BODY, s, 0.009), HEADLAMP),
    part(rimPatch(line([2.49, 0.36], [2.505, 0.48], 2), BODY, { z0: -0.55, z1: 0.55, lift: 0.008 }), blackTrim),
    ...both(line([2.495, 0.4], [2.505, 0.47], 1), 0.64, 1, blackTrim, 0.008),

    // Back: tall tail lamps beside the tailgate, wrapping round the corners; number plate under a chrome strip;
    // a black bumper strip
    ...both(along(LIFTGATE, 0.55, 0.98, 3), 0.64, 1, TAIL, 0.008, CABIN),
    ...bothSides((s) => sidePatch([[-2.3, 1.05], [-2.26, 1.31], [-2.46, 1.3], [-2.51, 1.04]], CABIN, s, 0.008), TAIL),
    part(rimPatch(line([-2.505, 0.62], [-2.502, 0.78], 2), BODY, { z0: -0.26, z1: 0.26, lift: 0.006 }), paint('#eeeeea')),
    part(rimPatch(line([-2.501, 0.81], [-2.5, 0.84], 1), BODY, { z0: -0.36, z1: 0.36, lift: 0.006 }), chrome),
    part(rimPatch(line([-2.44, 0.3], [-2.51, 0.42], 2), BODY, { margin: 0.01, lift: 0.006 }), blackTrim),

    // Sides: black moulding along the doors, the sliding door's rail, shut lines, handles, black mirrors, aerial
    ...bothSides((s) => sideLine([[1.1, 0.58], [-1.0, 0.58]], 0.06, BODY, s, 0.006), blackTrim),
    ...bothSides((s) => sideLine([[-1.22, 1.035], [-2.2, 1.035]], 0.014, CABIN, s, 0.005), blackTrim),
    ...bothSides((s) => sideLine([[1.18, 0.36], [1.18, 0.9], [1.45, 1.03]], 0.01, BODY, s, 0.004), shadowy),
    ...[
      [-0.17, 0.3],
      [-1.24, 0.66],
    ].flatMap(([x, y]) => bothSides((s) => sideLine([[x, y], [x, 1.04]], 0.01, BODY, s, 0.004), shadowy)),
    ...[0.5, -0.35].flatMap((x) => pair(roundBox(0.16, 0.04, 0.035, 0.015), PAINT, [x, 0.97, onSide(x, 0.97, 0.012)])),
    ...pair(roundBox(0.15, 0.14, 0.22, 0.04), blackTrim, [1.33, 1.17, 1.07]),
    ...pair(roundBox(0.12, 0.06, 0.1, 0.02), blackTrim, [1.38, 1.11, 0.96]),
    part(new THREE.CylinderGeometry(0.004, 0.007, 0.8, 6), blackTrim, [1.6, 1.44, -0.86], [0.1, 0, 0.3]),

    ...pair(roundBox(0.02, 0.015, 0.55, 0.006), blackTrim, [1.56, 1.06, 0.26], [0, 0.2, 0.52]),
    part(roundBox(0.95, 0.55, 1.4, 0.05), shadowy, [FRONT, 0.55, 0]),
    part(roundBox(0.95, 0.55, 1.4, 0.05), shadowy, [REAR, 0.55, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [lower, cabin] }
}
