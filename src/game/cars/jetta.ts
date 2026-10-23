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

// Volkswagen Jetta Mk4 (1999–2005): a smooth silver saloon with a gently arched roof, a rising waistline and a
// short boot; a slatted grille with the VW roundel between clear headlamps, black door strips and five-spoke
// alloys. 4.38 m long, 1.74 wide, 1.45 high.

const PAINT = paint('#bfc2c7', true)
const R = 0.317
const FRONT = 1.333
const REAR = -1.18
const TRACK = 0.757
const EDGE = 0.06

const WINDSCREEN: [P2, P2] = [
  [0.88, 0.88],
  [0.02, 1.36],
]
const BACKLIGHT: [P2, P2] = [
  [-1.12, 1.34],
  [-1.52, 0.96],
]

const BODY = surface(
  smooth([
    [2.0, 0.26, 0.08],
    ...arch(FRONT, R, 0.4, 0.26),
    ...arch(REAR, R, 0.4, 0.26),
    [-1.98, 0.27, 0.08],
    [-2.12, 0.42, 0.06],
    [-2.13, 0.8, 0.08],
    [-2.05, 0.95, 0.12],
    [-1.48, 0.98],
    [0.86, 0.9],
    [1.7, 0.8, 0.4],
    [2.05, 0.72, 0.12],
    [2.128, 0.52, 0.1],
    [2.12, 0.34, 0.06],
  ]),
  plan({ half: 0.8675, nose: 2.128, tail: -2.13, round: 0.5, pinch: 0.12, tailRound: 0.35, tailPinch: 0.07, tuck: 0.45, tuckIn: 0.15 }),
  EDGE,
)
const CABIN = surface(
  smooth([WINDSCREEN[0], [...WINDSCREEN[1], 0.2], [-0.6, 1.39, 0.4], [...BACKLIGHT[0], 0.18], BACKLIGHT[1]]),
  plan({ half: 0.8, nose: 0.88, tail: -1.52, round: 0.3, pinch: 0.05, belt: 0.9, lean: 0.32 }),
  EDGE,
)

const WINDOWS: P2[][] = [
  [
    [0.7, 0.94],
    [0.08, 1.29],
    [-0.36, 1.31],
    [-0.36, 0.95],
  ],
  [
    [-0.46, 0.96],
    [-0.46, 1.31],
    [-0.92, 1.3],
    [-0.92, 0.97],
  ],
  [
    [-1.0, 0.97],
    [-1.0, 1.28],
    [-1.1, 1.27],
    [-1.3, 0.99],
  ],
]
const PILLARS: P2[][] = [
  [
    [-0.35, 0.93],
    [-0.35, 1.32],
    [-0.47, 1.32],
    [-0.47, 0.93],
  ],
  [
    [-0.91, 0.95],
    [-0.91, 1.31],
    [-1.01, 1.31],
    [-1.01, 0.95],
  ],
]

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.195,
  rim: 0.19,
  face: silverWheel,
  dish: 0.018,
  holes: { n: 5, r0: 0.075, r1: 0.175, fill: 0.62 },
  rings: [{ r0: 0.178, r1: 0.19, material: paint('#d3d6db', true) }],
  cap: { r: 0.045, material: chrome },
  nuts: { n: 5, r: 0.058 },
}

const along = ([a, b]: [P2, P2], t0: number, t1: number, n = 5) =>
  line([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], n)
const HEADLAMP = lamp('#e6edf2', 0.12)
const TAIL = lamp('#b3121c', 0.3)
const LEAN = 0.37 // the nose leans back this much (radians)

// The VW roundel: a flat ring with a V over a W, facing along x, tilted by `lean` to lie on the body
function roundel(x: number, y: number, r: number, lean: number): Part {
  const bar = (y0: number, z0: number, y1: number, z1: number): Part => {
    const len = Math.hypot(y1 - y0, z1 - z0) * r
    return part(roundBox(0.008, len + r * 0.15, r * 0.2, r * 0.06), chrome, [0, ((y0 + y1) / 2) * r, ((z0 + z1) / 2) * r], [Math.atan2(z1 - z0, y1 - y0), 0, 0])
  }
  return {
    position: [x, y, 0],
    rotation: [0, 0, lean],
    children: [
      part(new THREE.TorusGeometry(r, r * 0.1, 8, 32).rotateY(Math.PI / 2), chrome),
      bar(0.8, -0.5, 0.05, 0),
      bar(0.8, 0.5, 0.05, 0),
      bar(-0.15, -0.88, -0.8, -0.38),
      bar(-0.8, -0.38, -0.25, 0),
      bar(-0.25, 0, -0.8, 0.38),
      bar(-0.8, 0.38, -0.15, 0.88),
    ],
  }
}

export function buildJetta(): CarBuild {
  const lower = shell(BODY)
  const cabin = shell(CABIN)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(BODY, x, y) + lift
  const both = (path: P2[], z0: number, z1: number, look: THREE.Material, lift = 0.009) =>
    [1, -1].map((s) => part(rimPatch(path, BODY, { z0: s > 0 ? z0 : -z1, z1: s > 0 ? z1 : -z0, margin: 0.01, lift }), look))
  const nose = line([2.12, 0.56], [2.08, 0.7], 3)
  const tail = line([-2.13, 0.7], [-2.12, 0.84], 2)

  const parts: Part[] = [
    part(lower, PAINT, undefined, undefined, true),
    part(cabin, PAINT, undefined, undefined, true),

    // Glass in black frames, black pillars
    part(rimPatch(along(WINDSCREEN, 0.06, 0.86, 6), CABIN, { margin: 0.07 }), glass),
    part(rimPatch(along(BACKLIGHT, 0.12, 0.92), CABIN, { margin: 0.08 }), glass),
    ...WINDOWS.flatMap((w) => [
      ...bothSides((s) => sidePatch(grow(w, 0.018), CABIN, s, 0.002), blackTrim),
      ...bothSides((s) => sidePatch(w, CABIN, s, 0.004), glass),
    ]),
    ...PILLARS.flatMap((p) => bothSides((s) => sidePatch(p, CABIN, s, 0.002), blackTrim)),

    // Front: a slatted grille in a chrome surround with the roundel, clear headlamps with twin round lenses
    // wrapping round the corners, a black lower intake
    part(rimPatch(line([2.123, 0.55], [2.085, 0.705], 3), BODY, { z0: -0.36, z1: 0.36, lift: 0.005 }), chrome),
    part(rimPatch(line([2.12, 0.56], [2.09, 0.69], 3), BODY, { z0: -0.34, z1: 0.34, lift: 0.007 }), blackTrim),
    ...[0.59, 0.625, 0.66].map((y) => part(rimPatch(line([2.12, y - 0.005], [2.1, y + 0.005], 1), BODY, { z0: -0.32, z1: 0.32, lift: 0.01 }), chrome)),
    roundel(2.158, 0.625, 0.052, LEAN),
    ...both(nose, 0.38, 1, HEADLAMP),
    ...bothSides((s) => sidePatch([[1.86, 0.62], [1.88, 0.72], [2.06, 0.72], [2.16, 0.58], [2.02, 0.56]], BODY, s, 0.009), HEADLAMP),
    ...[0.48, 0.61].flatMap((z) =>
      pair(new THREE.CircleGeometry(0.04, 20).rotateY(Math.PI / 2), chrome, [2.157, 0.63, z], [0, 0, LEAN]),
    ),
    part(rimPatch(line([2.1, 0.3], [2.128, 0.42], 2), BODY, { z0: -0.52, z1: 0.52, lift: 0.008 }), blackTrim),

    // Back: red tail lamps with a clear band, wrapping round the corners; number plate between; roundel above
    ...both(tail, 0.3, 1, TAIL),
    ...both(tail, 0.3, 0.4, lamp('#f1f1ee', 0.2), 0.011),
    ...bothSides((s) => sidePatch([[-1.9, 0.72], [-1.9, 0.86], [-2.12, 0.86], [-2.19, 0.71]], BODY, s, 0.008), TAIL),
    part(rimPatch(tail, BODY, { z0: -0.26, z1: 0.26, lift: 0.007 }), paint('#eeeeea')),
    roundel(-2.19, 0.9, 0.045, -0.35),
    part(rimPatch(line([-2.02, 0.29], [-2.12, 0.38], 1), BODY, { margin: 0.01, lift: 0.006 }), blackTrim),

    // Sides: black strips on the doors, shut lines, handles, the repeater, mirrors, the aerial
    ...bothSides((s) => sideLine([[1.02, 0.58], [-0.88, 0.58]], 0.045, BODY, s, 0.006), blackTrim),
    ...[
      [0.92, 0.3],
      [-0.4, 0.28],
      [-1.02, 0.64],
    ].flatMap(([x, y]) => bothSides((s) => sideLine([[x, y], [x, 0.93]], 0.01, BODY, s, 0.004), shadowy)),
    ...[0.28, -0.8].flatMap((x) => pair(roundBox(0.15, 0.035, 0.03, 0.013), PAINT, [x, 0.85, onSide(x, 0.85, 0.012)])),
    ...pair(roundBox(0.05, 0.02, 0.015, 0.007), lamp('#f5a623', 0.3), [1.75, 0.66, onSide(1.75, 0.66)]),
    ...pair(roundBox(0.1, 0.11, 0.18, 0.035), PAINT, [0.8, 1.0, 0.93]),
    ...pair(roundBox(0.1, 0.05, 0.08, 0.015), blackTrim, [0.82, 0.96, 0.84]),
    part(new THREE.CylinderGeometry(0.004, 0.008, 0.28, 6), blackTrim, [-0.95, 1.52, 0], [0, 0, 0.4]),

    ...pair(roundBox(0.02, 0.015, 0.5, 0.006), blackTrim, [0.86, 0.915, 0.22], [0, 0.25, 0.5]),
    part(roundBox(0.8, 0.5, 1.26, 0.05), shadowy, [FRONT, 0.5, 0]),
    part(roundBox(0.8, 0.5, 1.26, 0.05), shadowy, [REAR, 0.5, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [lower, cabin] }
}
