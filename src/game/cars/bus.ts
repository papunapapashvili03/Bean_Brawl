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
  smooth,
  surface,
  surfaceZ,
  wheel,
  type CarBuild,
  type P2,
  type P3,
  type Part,
  type WheelStyle,
} from './kit'

// Volkswagen Type 2 "Samba" bus (T1, 1960s): two-tone, orange below and cream above with a cream V down the
// front, a big VW roundel, a split windscreen, round headlamps, rows of side windows and skylights along the
// roof, painted bumpers, chrome hubcaps on cream wheels and whitewall tyres. 4.28 m long, 1.75 wide, 1.94 high.

const ORANGE = paint('#e05a1e')
const CREAM = paint('#ece6d7')
const R = 0.325
const FRONT = 1.36
const REAR = -1.04
const TRACK = 0.685
const EDGE = 0.09
const BELT = 0.96

// Orange below the waist, cream above. The cream part is a touch wider and comes down over the top of the
// orange one, so the colours meet in a clean line just under the chrome strip at the waist.
const LOWER = surface(
  smooth([
    [1.9, 0.4, 0.08],
    ...arch(FRONT, R, 0.46, 0.38),
    ...arch(REAR, R, 0.46, 0.38),
    [-1.82, 0.4, 0.1],
    [-2.04, 0.55, 0.12],
    [-2.05, BELT],
    [2.05, BELT],
    [2.06, 0.58, 0.14],
  ]),
  plan({ half: 0.875, nose: 2.06, tail: -2.05, round: 0.6, pinch: 0.22, tailRound: 0.55, tailPinch: 0.2, tuck: 0.62, tuckIn: 0.12 }),
  EDGE,
)
const UPPER = surface(
  smooth([
    [2.06, BELT - 0.01],
    [1.97, 1.55, 0.3],
    [1.62, 1.85, 0.3],
    [-1.72, 1.85, 0.4],
    [-2.05, 1.35, 0.25],
    [-2.05, BELT - 0.01],
  ]),
  plan({ half: 0.886, nose: 2.06, tail: -2.05, round: 0.6, pinch: 0.22, tailRound: 0.55, tailPinch: 0.2, belt: 1.0, lean: 0.07 }),
  EDGE,
)

// Windows: the cab door, four down the side, the rear corner one wrapping round; skylights along the roof
const box = (x0: number, x1: number, y0: number, y1: number, r: number): P2[] =>
  smooth([
    [x0, y0, r],
    [x0, y1, r],
    [x1, y1, r],
    [x1, y0, r],
  ])
const WINDOWS: P2[][] = [
  box(1.72, 1.18, 1.1, 1.56, 0.05),
  ...[
    [1.02, 0.44],
    [0.32, -0.26],
    [-0.38, -0.96],
    [-1.08, -1.66],
  ].map(([a, b]) => box(a, b, 1.12, 1.56, 0.06)),
  smooth([
    [-1.76, 1.12, 0.06],
    [-1.76, 1.56, 0.06],
    [-2.03, 1.52, 0.1],
    [-2.13, 1.12, 0.05],
  ]),
]
const SKYLIGHTS: P2[][] = Array.from({ length: 8 }, (_, i) => box(1.38 - i * 0.36, 1.1 - i * 0.36, 1.66, 1.77, 0.03))

const WHEEL: WheelStyle = {
  radius: R,
  width: 0.15,
  rim: 0.205,
  face: CREAM,
  dish: 0.01,
  cap: { r: 0.12, material: chrome, dome: 0.07 },
  whitewall: [0.225, 0.285],
}

// The V down the front: its half-width at height y (narrowing to a point above the bumper)
const V_TOP = 0.93
const V_TIP = 0.5
const vHalf = (_x: number, y: number) => 0.05 + ((y - V_TIP) / (V_TOP - V_TIP)) * 0.55

// A thin chrome bar from (y0, z0) to (y1, z1) on the front, in the plane x
function bar(x: number, [y0, z0]: [number, number], [y1, z1]: [number, number], thick = 0.018): Part {
  const len = Math.hypot(y1 - y0, z1 - z0)
  return part(roundBox(0.012, len + thick * 0.6, thick, thick * 0.4), chrome, [x, (y0 + y1) / 2, (z0 + z1) / 2], [Math.atan2(z1 - z0, y1 - y0), 0, 0])
}

// The VW roundel: a ring with a V over a W
function roundel([x, y, z]: P3, r: number): Part[] {
  const k = r / 0.13
  const p = (dy: number, dz: number): [number, number] => [y + dy * k, z + dz * k]
  return [
    part(new THREE.TorusGeometry(r, 0.013 * k, 8, 40).rotateY(Math.PI / 2), chrome, [x, y, z]),
    bar(x, p(0.105, -0.065), p(0.005, 0)),
    bar(x, p(0.105, 0.065), p(0.005, 0)),
    bar(x, p(-0.02, -0.115), p(-0.105, -0.05)),
    bar(x, p(-0.105, -0.05), p(-0.03, 0)),
    bar(x, p(-0.03, 0), p(-0.105, 0.05)),
    bar(x, p(-0.105, 0.05), p(-0.02, 0.115)),
  ]
}

// A round lamp in a chrome ring, facing along x (dir +1 forwards, -1 back), turned out by `yaw`
function roundLamp(at: P3, r: number, look: THREE.Material, dir: 1 | -1, yaw: number): Part {
  const face = dir > 0 ? Math.PI / 2 : -Math.PI / 2
  return {
    position: at,
    rotation: [0, face + yaw, 0],
    children: [
      part(new THREE.TorusGeometry(r, r * 0.16, 8, 32), chrome),
      part(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).rotateX(Math.PI / 2), look),
    ],
  }
}

export function buildBus(): CarBuild {
  const lower = shell(LOWER)
  const upper = shell(UPPER)
  const onSide = (x: number, y: number, lift = 0.005) => surfaceZ(LOWER, x, y) + lift
  const bumper = (x: number, dir: 1 | -1): Part[] => [
    part(roundBox(0.09, 0.13, 1.72, 0.04), CREAM, [x, 0.42, 0], undefined, true),
    ...pair(roundBox(0.08, 0.34, 0.08, 0.035), CREAM, [x + dir * 0.03, 0.5, 0.42]),
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.84, 12).rotateX(Math.PI / 2), CREAM, [x + dir * 0.03, 0.64, 0]),
  ]

  const parts: Part[] = [
    part(lower, ORANGE, undefined, undefined, true),
    part(upper, CREAM, undefined, undefined, true),

    // Glass: the split windscreen, side windows, skylights, the rear window
    ...[1, -1].map((s) => part(rimPatch(line([2.04, 1.07], [1.985, 1.47], 4), UPPER, { z0: s > 0 ? 0.035 : -1, z1: s > 0 ? 1 : -0.035, margin: 0.05 }), glass)),
    ...[...WINDOWS, ...SKYLIGHTS].flatMap((w) => bothSides((s) => sidePatch(w, UPPER, s, 0.004), glass)),
    part(rimPatch(line([-2.02, 1.42], [-1.84, 1.7], 4), UPPER, { z0: -0.5, z1: 0.5, margin: 0.05 }), glass),

    // Front: the cream V edged in chrome, the roundel, round headlamps, bullet indicators, the bumper
    part(rimPatch(line([2.06, V_TOP], [2.06, V_TIP], 6), LOWER, { z0: (x, y) => -vHalf(x, y), z1: vHalf, lift: 0.005 }), CREAM),
    ...[1, -1].map((s) =>
      part(
        rimPatch(line([2.06, V_TOP], [2.06, V_TIP], 6), LOWER, {
          z0: (x, y) => (s > 0 ? vHalf(x, y) : -vHalf(x, y) - 0.022),
          z1: (x, y) => (s > 0 ? vHalf(x, y) + 0.022 : -vHalf(x, y)),
          lift: 0.007,
        }),
        chrome,
      ),
    ),
    ...roundel([2.155, 0.83, 0], 0.13),
    ...[1, -1].map((s) => roundLamp([2.13, 0.8, s * 0.52], 0.09, lamp('#eef3f6', 0.2), 1, -s * 0.3)),
    ...pair(new THREE.CapsuleGeometry(0.028, 0.05, 4, 10).rotateZ(Math.PI / 2), lamp('#f3efe6', 0.2), [2.12, 1.02, 0.62]),
    ...bumper(2.23, 1),

    // Back: the engine lid with its vents and a small roundel, round tail lamps, number plate, the bumper
    part(rimPatch(line([-2.05, 0.58], [-2.05, 0.9], 3), LOWER, { z0: -0.44, z1: 0.44, lift: 0.004 }), paint('#d4501b')),
    ...[0.8, 0.83, 0.86].map((y) => part(rimPatch(line([-2.05, y - 0.007], [-2.05, y + 0.007], 1), LOWER, { z0: -0.3, z1: 0.3, lift: 0.007 }), shadowy)),
    ...roundel([-2.15, 0.7, 0], 0.06),
    ...[1, -1].map((s) => roundLamp([-2.14, 0.84, s * 0.56], 0.05, lamp('#b3121c', 0.3), -1, s * 0.3)),
    part(rimPatch(line([-2.05, 0.6], [-2.05, 0.66], 1), LOWER, { z0: -0.2, z1: 0.2, lift: 0.007 }), paint('#eeeeea')),
    ...bumper(-2.24, -1),

    // Sides: chrome at the waist and on the sills, shut lines, handles, engine vents, mirrors on long arms
    ...bothSides((s) => sideLine([[2.08, 0.925], [-2.08, 0.925]], 0.035, UPPER, s, 0.008), chrome),
    ...bothSides((s) => sideLine([[0.88, 0.4], [-0.56, 0.4]], 0.025, LOWER, s, 0.006), chrome),
    ...[1.78, 1.14, 0.98, 0.02, -0.94].flatMap((x) => bothSides((s) => sideLine([[x, 0.44], [x, 0.95]], 0.01, LOWER, s, 0.004), shadowy)),
    ...[1.22, 0.1].flatMap((x) => pair(roundBox(0.1, 0.03, 0.03, 0.01), chrome, [x, 0.9, onSide(x, 0.9, 0.012)])),
    ...[0.66, 0.7, 0.74, 0.78, 0.82, 0.86].flatMap((y) => bothSides((s) => sideLine([[-1.55, y], [-1.85, y]], 0.014, LOWER, s, 0.005), paint('#9c3a12'))),
    ...pair(roundBox(0.02, 0.02, 0.25, 0.008), chrome, [1.9, 1.2, 0.92], [0.3, 0, 0]),
    ...pair(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20).rotateZ(Math.PI / 2), chrome, [1.88, 1.25, 1.05]),

    ...pair(roundBox(0.015, 0.015, 0.45, 0.005), blackTrim, [2.06, 1.07, 0.3], [0, 0, 0.1]),
    part(roundBox(0.85, 0.55, 1.2, 0.05), shadowy, [FRONT, 0.6, 0]),
    part(roundBox(0.85, 0.55, 1.2, 0.05), shadowy, [REAR, 0.6, 0]),
    ...[FRONT, REAR].flatMap((x) => [wheel(WHEEL, [x, R, TRACK], 1), wheel(WHEEL, [x, R, -TRACK], -1)]),
  ]
  return { parts, hulls: [lower, upper] }
}
