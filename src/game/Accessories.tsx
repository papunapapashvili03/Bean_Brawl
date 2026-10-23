import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { flagTexture, type FlagId } from './flags'
import { Outlined } from './Outlined'
import { SHADE_COLORS, useOutfit, type Outfit } from './outfit'
import { TOP, aroundBody, bodyRadiusAt, onFace, profileBand, toon, toonMap } from './toon'

// Wearables for the bean, in the body's local space (face towards +z). They ride on the body group,
// so they bob, lean and swing along with it. Same cel shading and ink outline as the character.

// A skin-tight layer wrapped around the body between two angles (0 = front) over a profile band.
// `bulge` pushes it out in places (a mask over the mouth); `keep` cuts holes (an eye slit).
function wrapGeometry(
  a0: number,
  a1: number,
  segments: number,
  band: { r: number; y: number }[],
  bulge?: (a: number, v: number) => number,
  keep?: (a: number, y: number) => boolean,
) {
  const cols = segments + 1
  const positions: number[] = []
  band.forEach(({ r, y }, j) => {
    const v = j / (band.length - 1)
    for (let i = 0; i < cols; i++) {
      const a = THREE.MathUtils.lerp(a0, a1, i / segments)
      const radius = r + (bulge?.(a, v) ?? 0)
      positions.push(radius * Math.sin(a), y, radius * Math.cos(a))
    }
  })
  const index: number[] = []
  for (let j = 0; j < band.length - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = THREE.MathUtils.lerp(a0, a1, (i + 0.5) / segments)
      if (keep && !keep(a, (band[j].y + band[j + 1].y) / 2)) continue
      const v00 = j * cols + i
      const v01 = v00 + cols
      index.push(v00, v00 + 1, v01, v00 + 1, v01 + 1, v01)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

// A round cord through points given as (angle around the body, height), lifted off the surface
function cordGeometry(path: [number, number][], lift: number, radius: number) {
  const curve = new THREE.CatmullRomCurve3(path.map(([a, y]) => aroundBody(a, y, lift)))
  return new THREE.TubeGeometry(curve, path.length * 8, radius, 6, false)
}

// A flat strap following the body surface through (angle, height) points
function strapGeometry(path: [number, number][], lift: number, width: number) {
  const curve = new THREE.CatmullRomCurve3(path.map(([a, y]) => aroundBody(a, y, lift)))
  const n = path.length * 8
  const positions: number[] = []
  const side = new THREE.Vector3()
  const outward = new THREE.Vector3()
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = curve.getPointAt(t)
    outward.set(p.x, 0, p.z).normalize()
    side.crossVectors(curve.getTangentAt(t), outward).normalize().multiplyScalar(width / 2)
    positions.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z)
  }
  const index: number[] = []
  for (let i = 0; i < n; i++) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

const mirror = (path: [number, number][]) => path.map(([a, y]): [number, number] => [-a, y])

// ---------------------------------------------------------------------------------------------------------
// Round sunglasses (the blue pair): two rounded lenses following the face, a bridge and temples
// wrapping round the head

const EYE_Y = 0.45
const lensRim = new THREE.CylinderGeometry(0.1, 0.1, 0.028, 28)
const lensGlass = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 28)
const bridgeGeometry = new THREE.CapsuleGeometry(0.014, 0.07, 4, 8)
const TEMPLE_PATH: [number, number][] = [
  [0.66, EYE_Y + 0.01],
  [1.1, EYE_Y + 0.03],
  [1.6, EYE_Y + 0.04],
  [2.05, EYE_Y + 0.02],
]
const templeGeometry = cordGeometry(TEMPLE_PATH, 0.05, 0.014)
const templeGeometryL = cordGeometry(mirror(TEMPLE_PATH), 0.05, 0.014)

const glassCache = new Map<string, THREE.MeshStandardMaterial>()
function glass(color: string) {
  let m = glassCache.get(color)
  if (!m) {
    // Tinted, glossy lenses: the frame colour darkened, with sharp highlights
    const tint = new THREE.Color(color).lerp(new THREE.Color('#050508'), 0.55)
    m = new THREE.MeshStandardMaterial({ color: tint, metalness: 0.5, roughness: 0.12 })
    glassCache.set(color, m)
  }
  return m
}

function RoundSunglasses({ color }: { color: string }) {
  const frame = toon(color)
  const bridgeZ = bodyRadiusAt(EYE_Y + 0.02) + 0.045
  return (
    <group>
      {[-1, 1].map((s) => {
        const f = onFace(s * 0.15, EYE_Y, -0.04)
        return (
          <group key={s} position={f.position} rotation={[-0.12, f.yaw, 0]}>
            <Outlined geometry={lensRim} material={frame} rotation={[Math.PI / 2, 0, 0]} scale={[1.18, 1, 0.8]} />
            <mesh geometry={lensGlass} material={glass(color)} position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[1.02, 1, 0.66]} />
          </group>
        )
      })}
      <Outlined geometry={bridgeGeometry} material={frame} position={[0, EYE_Y + 0.02, bridgeZ]} rotation={[0, 0, Math.PI / 2]} />
      <mesh geometry={templeGeometry} material={frame} />
      <mesh geometry={templeGeometryL} material={frame} />
    </group>
  )
}

// Straight sunglasses: one flat front across the face with big lenses (straight top, gently tapering
// sides, full rounded bottom corners), a thick brow bar and straight arms back to the sides of the head

const LENS = { w: 0.27, h: 0.2 }
const LENS_X = LENS.w / 2 + 0.035 // lens centres at ±LENS_X
const RIM = 0.022
const BROW = 0.04 // the top bar is thicker than the rest of the rim
const FRAME_DEPTH = 0.028
const FRONT_Z = 0.47 // clear of the eyes and a medical mask

// One lens outline around (cx, 0); `side` mirrors it so the outer edge faces away from the nose
function lensOutline(path: THREE.Path, cx: number, side: 1 | -1) {
  const { w, h } = LENS
  const x = (dx: number) => cx + side * dx
  path.moveTo(x(-w / 2), h / 2)
  path.lineTo(x(w / 2), h / 2)
  path.lineTo(x(w / 2 - 0.006), -h / 2 + 0.08)
  path.quadraticCurveTo(x(w / 2 - 0.015), -h / 2, x(w / 2 - 0.09), -h / 2)
  path.lineTo(x(-w / 2 + 0.09), -h / 2 + 0.004)
  path.quadraticCurveTo(x(-w / 2 + 0.03), -h / 2 + 0.01, x(-w / 2 + 0.022), -h / 2 + 0.07)
  path.lineTo(x(-w / 2), h / 2 - 0.02)
  path.closePath()
  return path
}

// The whole front: rim round both lenses, joined by a keyhole bridge arching over the nose
function frameFront() {
  const X = LENS_X + LENS.w / 2 + RIM
  const T = LENS.h / 2 + BROW
  const B = -LENS.h / 2 - RIM
  const inner = LENS_X - LENS.w / 2 // the lenses' nose-side edges
  const s = new THREE.Shape()
  s.moveTo(-X, T)
  s.lineTo(X, T)
  s.lineTo(X - 0.004, B + 0.1)
  s.quadraticCurveTo(X - 0.015, B, X - 0.105, B)
  s.lineTo(inner + 0.09, B + 0.004)
  s.quadraticCurveTo(inner + 0.02, B + 0.01, inner, B + 0.075)
  s.quadraticCurveTo(0.018, 0.06, 0, 0.06)
  s.quadraticCurveTo(-0.018, 0.06, -inner, B + 0.075)
  s.quadraticCurveTo(-inner - 0.02, B + 0.01, -inner - 0.09, B + 0.004)
  s.lineTo(-(X - 0.105), B)
  s.quadraticCurveTo(-(X - 0.015), B, -(X - 0.004), B + 0.1)
  s.closePath()
  s.holes.push(lensOutline(new THREE.Path(), LENS_X, 1), lensOutline(new THREE.Path(), -LENS_X, -1))
  return new THREE.ExtrudeGeometry(s, { depth: FRAME_DEPTH, bevelEnabled: false, curveSegments: 10 })
}
const squareFront = frameFront()
const squareLenses = [1, -1].map((side) =>
  new THREE.ExtrudeGeometry(lensOutline(new THREE.Shape(), side * LENS_X, side as 1 | -1) as THREE.Shape, {
    depth: 0.008,
    bevelEnabled: false,
    curveSegments: 10,
  }),
)

// A straight bar from a to b: box centre, orientation (+z along the bar) and length
function barBetween(a: THREE.Vector3, b: THREE.Vector3) {
  const o = new THREE.Object3D()
  o.position.copy(a).add(b).multiplyScalar(0.5)
  o.lookAt(b)
  return {
    position: o.position.toArray() as [number, number, number],
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z] as [number, number, number],
    length: a.distanceTo(b),
  }
}
// Arms run straight back from the hinges at the top outer corners, just clearing the head (and a full mask)
const ARM_Y = EYE_Y + LENS.h / 2 + BROW - 0.03
const squareArms = [1, -1].map((side) =>
  barBetween(
    new THREE.Vector3(side * (LENS_X + LENS.w / 2 + RIM - 0.012), ARM_Y, FRONT_Z + 0.01),
    new THREE.Vector3(side * 0.49, ARM_Y, -0.05),
  ),
)
const armGeometry = new THREE.BoxGeometry(0.022, 0.03, squareArms[0].length)

function SquareSunglasses({ color }: { color: string }) {
  const frame = toon(color)
  return (
    <group>
      <group position={[0, EYE_Y, FRONT_Z]}>
        <Outlined geometry={squareFront} material={frame} />
        {squareLenses.map((g, i) => (
          <mesh key={i} geometry={g} material={glass(color)} position={[0, 0, 0.01]} />
        ))}
      </group>
      {squareArms.map((arm, i) => (
        <Outlined key={i} geometry={armGeometry} material={frame} position={arm.position} rotation={arm.rotation} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Medical mask: a pleated light-blue mask over the mouth, with elastic loops round the sides

const MASK_Y0 = 0.16
const MASK_Y1 = 0.42
const MASK_SPAN = 1.25
const medicalGeometry = wrapGeometry(
  -MASK_SPAN,
  MASK_SPAN,
  36,
  profileBand(MASK_Y0, MASK_Y1, 0.03, 12),
  // Three horizontal pleats, and a gentle puff over the mouth that flattens towards the cheeks
  (a, v) => 0.006 * Math.sin(v * Math.PI * 6) + 0.03 * Math.cos(a) ** 2 * Math.sin(Math.PI * v),
)
const LOOP_PATH: [number, number][] = [
  [MASK_SPAN - 0.02, MASK_Y1 - 0.03],
  [1.55, 0.44],
  [1.85, 0.32],
  [1.6, 0.2],
  [MASK_SPAN - 0.02, MASK_Y0 + 0.03],
]
const loopGeometry = cordGeometry(LOOP_PATH, 0.03, 0.011)
const loopGeometryL = cordGeometry(mirror(LOOP_PATH), 0.03, 0.011)

function MedicalMask() {
  const elastic = toon('#ffffff')
  return (
    <group>
      <Outlined geometry={medicalGeometry} material={toon('#bfe2f0', THREE.DoubleSide)} />
      <mesh geometry={loopGeometry} material={elastic} />
      <mesh geometry={loopGeometryL} material={elastic} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Full face mask: black knit over the whole head with a slit for the eyes and a rolled cuff at the neck

const FULL_MASK_Y0 = 0.12
const EYE_SLIT = { y0: 0.365, y1: 0.525, halfAngle: 0.58 }
const fullMaskGeometry = wrapGeometry(
  -Math.PI,
  Math.PI,
  56,
  profileBand(FULL_MASK_Y0, TOP.y + TOP.ry, 0.026, 14),
  undefined,
  (a, y) => !(y > EYE_SLIT.y0 && y < EYE_SLIT.y1 && Math.abs(a) < EYE_SLIT.halfAngle),
)
const cuffGeometry = new THREE.TorusGeometry(bodyRadiusAt(FULL_MASK_Y0) + 0.03, 0.028, 8, 48)

function FullMask() {
  const knit = toon('#18181c', THREE.DoubleSide)
  return (
    <group>
      <Outlined geometry={fullMaskGeometry} material={knit} />
      <Outlined geometry={cuffGeometry} material={knit} position={[0, FULL_MASK_Y0, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Shells shaped on the head's own dome (cap crown, helmets), so they sit snugly on the bean.
// `edgeY(a)` is the height of the bottom edge at angle a around the head (0 = front);
// `lift(u)` how far the shell stands off the head, from the edge (u = 0) to the top (u = 1).

type Shell = { edgeY: (a: number) => number; lift: (u: number) => number }

function shellPoint(shell: Shell, a: number, u: number, out = new THREE.Vector3()) {
  const t0 = Math.asin(THREE.MathUtils.clamp((shell.edgeY(a) - TOP.y) / TOP.ry, 0, 1))
  const t = THREE.MathUtils.lerp(t0, Math.PI / 2, u)
  const lift = shell.lift(u)
  const r = (TOP.rx + lift) * Math.cos(t)
  return out.set(r * Math.sin(a), TOP.y + (TOP.ry + lift) * Math.sin(t), r * Math.cos(a))
}

function shellGeometry(shell: Shell, segments = 48, rows = 12) {
  const cols = segments + 1
  const positions: number[] = []
  const p = new THREE.Vector3()
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      shellPoint(shell, -Math.PI + (2 * Math.PI * i) / segments, j / rows, p)
      positions.push(p.x, p.y, p.z)
    }
  }
  const index: number[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segments; i++) {
      const v00 = j * cols + i
      const v01 = v00 + cols
      index.push(v00, v00 + 1, v01, v00 + 1, v01 + 1, v01)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

// A closed ring of tube round the shell at height u, pushed `out` further from the head (a rim or band)
function shellRing(shell: Shell, u: number, radius: number, out = 0) {
  const points = Array.from({ length: 40 }, (_, i) => {
    const a = (2 * Math.PI * i) / 40
    const p = shellPoint(shell, a, u)
    const flat = Math.hypot(p.x, p.z)
    return p.set((p.x * (flat + out)) / flat, p.y, (p.z * (flat + out)) / flat)
  })
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 120, radius, 6, true)
}

// A peak or bill: a half disc reaching forward from the shell's front edge, curving down at its sides
function peakGeometry(radius: number, reach: number, thickness: number, droop: number) {
  const g = new THREE.CylinderGeometry(radius, radius, thickness, 32, 1, false, -Math.PI / 2, Math.PI)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius
    p.setZ(i, (p.getZ(i) * reach) / radius)
    p.setY(i, p.getY(i) - droop * x * x)
  }
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------------------------------------------------
// Dark blue baseball cap: the band runs just above the brows at the front and dips lower at the back,
// and the crown puffs up slightly towards the top button

const CAP: Shell = {
  edgeY: (a) => 0.6 + 0.06 * Math.cos(a),
  lift: (u) => 0.03 + 0.03 * u,
}
const capCrown = shellGeometry(CAP)
const capBand = shellRing(CAP, 0, 0.016)
const capTop = shellPoint(CAP, 0, 1)
const capButton = new THREE.SphereGeometry(0.04, 12, 8)
const BILL_TILT = 0.1
const billFront = shellPoint(CAP, 0, 0)
const capBill = peakGeometry(0.385, 0.78, 0.03, 0.035)

function Cap() {
  const navy = toon('#1e2c55', THREE.DoubleSide)
  return (
    <group>
      <Outlined geometry={capCrown} material={navy} />
      <mesh geometry={capBand} material={toon('#2d4178')} />
      <Outlined geometry={capBill} material={navy} position={[0, billFront.y + 0.008, 0]} rotation={[BILL_TILT, 0, 0]} />
      <Outlined geometry={capButton} material={navy} position={[0, capTop.y, 0]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Yellow safety helmet: a hard glossy shell standing off the head, three raised ribs over the top,
// a flared rim with a short peak at the front, and the grey suspension harness showing at the back

const HARD_HAT: Shell = {
  edgeY: (a) => 0.6 + 0.03 * Math.cos(a),
  lift: (u) => 0.07 + 0.015 * u,
}
const hardHatShell = shellGeometry(HARD_HAT)
const hardHatRim = shellRing(HARD_HAT, 0, 0.024, 0.012)
const hardHatFront = shellPoint(HARD_HAT, 0, 0)
const hardHatPeak = peakGeometry(Math.hypot(hardHatFront.x, hardHatFront.z), 0.62, 0.032, 0.03)
// Ribs run front to back parallel to each other (at fixed x), riding on the shell
function ribGeometry(x: number) {
  const lift = 0.078
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 16; i++) {
    const z = THREE.MathUtils.lerp(0.36, -0.4, i / 16)
    const cos = Math.min(Math.hypot(x, z) / (TOP.rx + lift), 1)
    points.push(new THREE.Vector3(x, TOP.y + (TOP.ry + lift) * Math.sqrt(1 - cos * cos), z))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.024, 8, false)
}
const hardHatRibs = [-0.1, 0, 0.1].map(ribGeometry)
const HARNESS_PATH: [number, number][] = [
  [1.9, 0.56],
  [2.4, 0.55],
  [Math.PI, 0.54],
  [2 * Math.PI - 2.4, 0.55],
  [2 * Math.PI - 1.9, 0.56],
]
const harnessGeometry = cordGeometry(HARNESS_PATH, 0.02, 0.02)
const ratchetGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16)
const ratchetZ = -(bodyRadiusAt(0.53) + 0.04)

function HardHat() {
  const yellow = toon('#ffc61a')
  const grey = toon('#8a8d93')
  return (
    <group>
      <Outlined geometry={hardHatShell} material={toon('#ffc61a', THREE.DoubleSide)} />
      <Outlined geometry={hardHatRim} material={yellow} />
      {hardHatRibs.map((g, i) => (
        <Outlined key={i} geometry={g} material={yellow} />
      ))}
      <Outlined geometry={hardHatPeak} material={yellow} position={[0, hardHatFront.y + 0.004, 0]} rotation={[0.12, 0, 0]} />
      <mesh geometry={harnessGeometry} material={grey} />
      <Outlined geometry={ratchetGeometry} material={grey} position={[0, 0.53, ratchetZ]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Military green helmet: a combat helmet cut high over the brow and low over the sides and back,
// flaring slightly at the edge, with a darker rim, an elastic band, a front mount plate, side rails
// and a chin strap

const COMBAT: Shell = {
  edgeY: (a) => 0.5 + 0.19 * Math.max(0, Math.cos(a)) ** 1.5,
  lift: (u) => 0.085 + 0.02 * (1 - u) ** 3,
}
const combatShell = shellGeometry(COMBAT)
const combatRim = shellRing(COMBAT, 0, 0.02, 0.004)
const combatBand = shellRing(COMBAT, 0.3, 0.014, 0.004)
const MOUNT_U = 0.35
const mountPoint = shellPoint(COMBAT, 0, MOUNT_U)
const mountTilt = Math.atan2(mountPoint.y - TOP.y, mountPoint.z) // turn the plate to face along the shell
const mountGeometry = new RoundedBoxGeometry(0.13, 0.08, 0.035, 2, 0.012)
const railGeometry = new RoundedBoxGeometry(0.035, 0.045, 0.26, 2, 0.01)
const rails = [1, -1].map((s) => shellPoint(COMBAT, s * 1.5, 0.12))
const CHIN_PATH: [number, number][] = [
  [1.45, 0.5],
  [1.35, 0.36],
  [1.0, 0.24],
  [0.5, 0.18],
  [0, 0.17],
  [-0.5, 0.18],
  [-1.0, 0.24],
  [-1.35, 0.36],
  [-1.45, 0.5],
]
const chinStrap = cordGeometry(CHIN_PATH, 0.036, 0.012)

function CombatHelmet() {
  const olive = toon('#5b6b3a', THREE.DoubleSide)
  const dark = toon('#3b4527')
  return (
    <group>
      <Outlined geometry={combatShell} material={olive} />
      <Outlined geometry={combatRim} material={dark} />
      <mesh geometry={combatBand} material={dark} />
      <Outlined geometry={mountGeometry} material={dark} position={mountPoint.toArray()} rotation={[-mountTilt, 0, 0]} />
      {rails.map((p, i) => (
        <Outlined key={i} geometry={railGeometry} material={dark} position={p.toArray()} />
      ))}
      <mesh geometry={chinStrap} material={dark} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Tall black top hat: flared felt crown, grosgrain band with a bow, brim curling up at the sides

const HAT_Y = 0.8
const BRIM_R = 0.46
const CROWN_H = 0.7
// Curl the brim up towards the sides, more the further out it goes
function curlBrim(g: THREE.BufferGeometry) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / BRIM_R
    const d = Math.hypot(p.getX(i), p.getZ(i)) / BRIM_R
    p.setY(i, p.getY(i) + 0.1 * x * x * d * d)
    p.setZ(i, p.getZ(i) * 0.9) // slightly oval, longer side to side
  }
  g.computeVertexNormals()
  return g
}
const hatBrim = curlBrim(new THREE.CylinderGeometry(BRIM_R, BRIM_R, 0.03, 48, 1))
const hatBrimEdge = curlBrim(new THREE.TorusGeometry(BRIM_R, 0.022, 8, 64).rotateX(Math.PI / 2))
const hatCrown = new THREE.CylinderGeometry(0.305, 0.28, CROWN_H, 36)
const hatBand = new THREE.CylinderGeometry(0.288, 0.285, 0.12, 36, 1, true)
const bowKnot = new THREE.BoxGeometry(0.04, 0.07, 0.05)
const bowLoop = new THREE.BoxGeometry(0.018, 0.06, 0.07)

function TopHat() {
  const felt = toon('#232328')
  const ribbon = toon('#0b0b0e', THREE.DoubleSide)
  const bandY = HAT_Y + 0.08
  return (
    <group>
      <Outlined geometry={hatBrim} material={felt} position={[0, HAT_Y, 0]} />
      <mesh geometry={hatBrimEdge} material={ribbon} position={[0, HAT_Y + 0.005, 0]} />
      <Outlined geometry={hatCrown} material={felt} position={[0, HAT_Y + 0.015 + CROWN_H / 2, 0]} />
      <mesh geometry={hatBand} material={ribbon} position={[0, bandY, 0]} />
      {/* Bow on one side of the band */}
      <group position={[-0.29, bandY, 0.02]}>
        <mesh geometry={bowKnot} material={ribbon} />
        <mesh geometry={bowLoop} material={ribbon} position={[-0.005, 0, 0.055]} rotation={[0.3, 0, 0]} />
        <mesh geometry={bowLoop} material={ribbon} position={[-0.005, 0, -0.055]} rotation={[-0.3, 0, 0]} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Backpack: a soft blue daypack with a zipped front pocket, side pockets, a haul loop and light-blue
// cord pulls. Straps come round under the arms, up the chest and back over the shoulders.

const PACK = { w: 0.64, h: 0.8, d: 0.28, y: 0.06 }
const PACK_Z = -(bodyRadiusAt(PACK.y) + PACK.d / 2 - 0.01)
const PACK_BACK = PACK_Z - PACK.d / 2 // the outer face
const packBody = new RoundedBoxGeometry(PACK.w, PACK.h, PACK.d, 4, 0.11)
const packPocket = new RoundedBoxGeometry(0.52, 0.36, 0.09, 3, 0.04)
const sidePocket = new RoundedBoxGeometry(0.05, 0.3, 0.2, 2, 0.02)
const zipperGeometry = new THREE.BoxGeometry(0.44, 0.016, 0.02)
const pullCord = new THREE.CapsuleGeometry(0.012, 0.05, 4, 6)
const pullKnot = new THREE.SphereGeometry(0.024, 10, 8)
const patchGeometry = new RoundedBoxGeometry(0.1, 0.045, 0.012, 2, 0.006)
const haulLoop = new THREE.TorusGeometry(0.07, 0.02, 8, 16, Math.PI)
const STRAP_PATH: [number, number][] = [
  [2.7, -0.18], // from the bottom of the pack
  [2.1, -0.3],
  [1.4, -0.3], // under the arm
  [0.75, -0.15],
  [0.62, 0.08], // up the chest
  [0.78, 0.3],
  [1.2, 0.42], // over the shoulder
  [1.8, 0.43],
  [2.4, 0.36],
  [2.75, 0.24], // into the top of the pack
]
const strapGeometryR = strapGeometry(STRAP_PATH, 0.026, 0.085)
const strapGeometryL = strapGeometry(mirror(STRAP_PATH), 0.026, 0.085)

function Backpack() {
  const blue = toon('#2f63ad')
  const deep = toon('#1d4585')
  const accent = toon('#8fc6e8')
  const strap = toon('#24508f', THREE.DoubleSide)
  const pocketZ = PACK_BACK - 0.02
  const front = pocketZ - 0.045 // outer face of the front pocket
  return (
    <group>
      <Outlined geometry={packBody} material={blue} position={[0, PACK.y, PACK_Z]} />
      <Outlined geometry={packPocket} material={blue} position={[0, PACK.y - 0.18, pocketZ]} />
      {[-1, 1].map((s) => (
        <Outlined key={s} geometry={sidePocket} material={deep} position={[s * (PACK.w / 2 + 0.01), PACK.y - 0.16, PACK_Z]} />
      ))}
      {/* Pocket zip with a knotted cord pull, and a small light-blue patch (the back faces -z, so -x is its right) */}
      <mesh geometry={zipperGeometry} material={deep} position={[0, PACK.y - 0.07, front]} />
      <mesh geometry={pullCord} material={accent} position={[0.2, PACK.y - 0.11, front - 0.012]} />
      <mesh geometry={pullKnot} material={accent} position={[0.2, PACK.y - 0.15, front - 0.012]} />
      <mesh geometry={patchGeometry} material={accent} position={[-0.19, PACK.y - 0.3, front - 0.004]} />
      {/* Haul loop and the main zip's cord pulls on top */}
      <Outlined geometry={haulLoop} material={deep} position={[0, PACK.y + PACK.h / 2 - 0.02, PACK_Z]} />
      <mesh geometry={pullKnot} material={accent} position={[0.06, PACK.y + PACK.h / 2 - 0.005, PACK_Z + 0.05]} />
      <mesh geometry={pullKnot} material={accent} position={[0.1, PACK.y + PACK.h / 2 - 0.02, PACK_Z + 0.06]} />
      <mesh geometry={strapGeometryR} material={strap} castShadow />
      <mesh geometry={strapGeometryL} material={strap} castShadow />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Military backpack: a boxy olive assault pack with a top pocket (flag patch and a centre strap with a
// buckle), a lower pocket covered in MOLLE webbing rows, side compression straps and a grab handle

const MIL = { w: 0.6, h: 0.84, d: 0.3, y: 0.04 }
const MIL_Z = -(bodyRadiusAt(MIL.y) + MIL.d / 2 - 0.01)
const MIL_BACK = MIL_Z - MIL.d / 2
const milBody = new RoundedBoxGeometry(MIL.w, MIL.h, MIL.d, 3, 0.06)
const milTopPocket = new RoundedBoxGeometry(0.5, 0.22, 0.08, 3, 0.025)
const milLowPocket = new RoundedBoxGeometry(0.5, 0.42, 0.09, 3, 0.03)
const TOP_POCKET_Y = MIL.y + 0.24
const LOW_POCKET_Y = MIL.y - 0.14
const topFace = MIL_BACK - 0.04 // outer faces of the pockets
const lowFace = MIL_BACK - 0.045
const molleRow = new THREE.BoxGeometry(0.5, 0.026, 0.012)
const MOLLE_ROWS = 5
const centreStrap = new THREE.BoxGeometry(0.045, 0.3, 0.012)
const buckleGeometry = new RoundedBoxGeometry(0.06, 0.04, 0.018, 2, 0.006)
const buckleRing = new THREE.TorusGeometry(0.028, 0.007, 6, 16)
const velcroPanel = new THREE.BoxGeometry(0.09, 0.06, 0.008)
const sideStrap = new THREE.BoxGeometry(0.012, 0.035, MIL.d + 0.02)
const sideBuckle = new RoundedBoxGeometry(0.02, 0.05, 0.04, 2, 0.006)
const grabHandle = new THREE.TorusGeometry(0.06, 0.016, 6, 12, Math.PI)
const flagPatch = new THREE.PlaneGeometry(0.15, 0.1)
const flagBorder = new RoundedBoxGeometry(0.168, 0.118, 0.006, 2, 0.01)
const milStrapR = strapGeometry(STRAP_PATH, 0.026, 0.095)
const milStrapL = strapGeometry(mirror(STRAP_PATH), 0.026, 0.095)

function MilitaryPack({ flag }: { flag: FlagId | 'none' }) {
  const olive = toon('#6e6a3c')
  const webbing = toon('#5b5831')
  const hardware = toon('#3a3a35')
  const strap = toon('#5f5c34', THREE.DoubleSide)
  return (
    <group>
      <Outlined geometry={milBody} material={olive} position={[0, MIL.y, MIL_Z]} />
      <Outlined geometry={milTopPocket} material={olive} position={[0, TOP_POCKET_Y, MIL_BACK]} />
      <Outlined geometry={milLowPocket} material={olive} position={[0, LOW_POCKET_Y, MIL_BACK]} />
      {/* MOLLE webbing rows across the lower pocket, a velcro panel above them */}
      {Array.from({ length: MOLLE_ROWS }, (_, i) => (
        <mesh key={i} geometry={molleRow} material={webbing} position={[0, LOW_POCKET_Y + 0.1 - i * 0.065, lowFace - 0.004]} />
      ))}
      <mesh geometry={velcroPanel} material={webbing} position={[0, LOW_POCKET_Y + 0.165, lowFace - 0.002]} />
      {/* Centre strap down the top pocket, buckle at the top and a ring at the bottom */}
      <mesh geometry={centreStrap} material={webbing} position={[0, TOP_POCKET_Y + 0.07, topFace - 0.004]} />
      <mesh geometry={buckleGeometry} material={hardware} position={[0, TOP_POCKET_Y + 0.13, topFace - 0.012]} />
      <mesh geometry={buckleRing} material={hardware} position={[0, TOP_POCKET_Y - 0.09, topFace - 0.008]} />
      {/* Compression straps round each side with buckles at the front corners */}
      {[-1, 1].map((s) =>
        [MIL.y + 0.12, MIL.y - 0.2].map((y) => (
          <group key={`${s}${y}`}>
            <mesh geometry={sideStrap} material={webbing} position={[s * (MIL.w / 2 + 0.004), y, MIL_Z]} />
            <mesh geometry={sideBuckle} material={hardware} position={[s * (MIL.w / 2 + 0.01), y, MIL_BACK + 0.03]} />
          </group>
        )),
      )}
      <Outlined geometry={grabHandle} material={webbing} position={[0, MIL.y + MIL.h / 2 - 0.01, MIL_Z]} scale={[1, 0.6, 1]} />
      {/* Flag patch on the top pocket, on the wearer's left (the pack faces -z, so that is +x) */}
      {flag !== 'none' && (
        <group position={[0.13, TOP_POCKET_Y + 0.01, topFace - 0.004]} rotation={[0, Math.PI, 0]}>
          <mesh geometry={flagBorder} material={hardware} position={[0, 0, -0.002]} />
          <mesh geometry={flagPatch} material={toonMap(flagTexture(flag))} position={[0, 0, 0.002]} />
        </group>
      )}
      <mesh geometry={milStrapR} material={strap} castShadow />
      <mesh geometry={milStrapL} material={strap} castShadow />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------

// `head`: things worn on the face and head, which slide round with the face; `back`: things on the back.
// What's worn is your own outfit (the Wardrobe's), or `outfit` (someone else's, e.g. another player online).
export function Accessories({ part, outfit }: { part: 'head' | 'back'; outfit?: Outfit }) {
  const own = useOutfit()
  const { hat, face, shades, back, flag } = outfit ?? own
  if (part === 'back') {
    return (
      <>
        {back === 'backpack' && <Backpack />}
        {back === 'military' && <MilitaryPack flag={flag} />}
      </>
    )
  }
  return (
    <>
      {face === 'medical' && <MedicalMask />}
      {face === 'fullMask' && <FullMask />}
      {shades === 'blue' && <RoundSunglasses color={SHADE_COLORS.blue} />}
      {shades !== 'none' && shades !== 'blue' && <SquareSunglasses color={SHADE_COLORS[shades]} />}
      {hat === 'cap' && <Cap />}
      {hat === 'topHat' && <TopHat />}
      {hat === 'hardHat' && <HardHat />}
      {hat === 'combatHelmet' && <CombatHelmet />}
    </>
  )
}
