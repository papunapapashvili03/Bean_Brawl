import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// A little kit for modelling cars out of their side silhouettes. The car runs along x (front towards +x), y is
// up from the ground and z across. A body part is a "shell": its side outline, pushed out sideways to a width
// that can vary along and up the car (rounding the corners off in plan, leaning the cabin in), with rounded
// edges all round. Windows, lights and trim are thin patches that sit on its surface.

export type P2 = [number, number]
export type Width = (x: number, y: number) => number // half-width of the flat side at (x, y)

const clamp = THREE.MathUtils.clamp

function signedArea(pts: P2[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}
const ccw = (pts: P2[]) => (signedArea(pts) >= 0 ? pts : [...pts].reverse())

// Round a polygon's corners off: each corner becomes an arc of radius r (less where the sides are short).
// `r` may be one radius for every corner or one per corner (0 keeps it sharp).
export function rounded(pts: P2[], r: number | number[], steps = 4): P2[] {
  const out: P2[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const radius = typeof r === 'number' ? r : r[i]
    const b = new THREE.Vector2(...pts[i])
    if (!radius) {
      out.push(pts[i])
      continue
    }
    const a = new THREE.Vector2(...pts[(i - 1 + n) % n])
    const c = new THREE.Vector2(...pts[(i + 1) % n])
    const u = a.clone().sub(b)
    const w = c.clone().sub(b)
    const lu = u.length()
    const lw = w.length()
    u.normalize()
    w.normalize()
    const angle = Math.acos(clamp(u.dot(w), -1, 1))
    if (angle > Math.PI - 0.01 || angle < 0.01) {
      out.push(pts[i])
      continue
    }
    const t = Math.min(radius / Math.tan(angle / 2), lu * 0.48, lw * 0.48)
    const rr = t * Math.tan(angle / 2)
    const t1 = b.clone().addScaledVector(u, t)
    const t2 = b.clone().addScaledVector(w, t)
    const centre = b.clone().addScaledVector(u.clone().add(w).normalize(), rr / Math.sin(angle / 2))
    const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x)
    let a2 = Math.atan2(t2.y - centre.y, t2.x - centre.x)
    // The short way round
    while (a2 - a1 > Math.PI) a2 -= Math.PI * 2
    while (a1 - a2 > Math.PI) a2 += Math.PI * 2
    for (let s = 0; s <= steps; s++) {
      const ang = a1 + ((a2 - a1) * s) / steps
      out.push([centre.x + rr * Math.cos(ang), centre.y + rr * Math.sin(ang)])
    }
  }
  return out
}

// An outline given as points, some with a corner radius as a third number: those corners get rounded
export function smooth(pts: ([number, number] | [number, number, number])[], steps = 5): P2[] {
  return rounded(
    pts.map((p) => [p[0], p[1]] as P2),
    pts.map((p) => p[2] ?? 0),
    steps,
  )
}

// A polygon grown outwards by d all round (for a frame round a window)
export function grow(poly: P2[], d: number): P2[] {
  const pts = ccw(poly)
  const n = pts.length
  return pts.map(([x, y], i) => {
    const [xa, ya] = pts[(i - 1 + n) % n]
    const [xb, yb] = pts[(i + 1) % n]
    const n1 = new THREE.Vector2(y - ya, -(x - xa)).normalize()
    const n2 = new THREE.Vector2(yb - y, -(xb - x)).normalize()
    const m = n1.clone().add(n2).normalize()
    const k = d / Math.max(0.3, m.dot(n1))
    return [x + m.x * k, y + m.y * k] as P2
  })
}

// Points along a straight line from a to b (for a patch's path)
export function line(a: P2, b: P2, n = 4): P2[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P2)
}

// Extra points along long sides, so a width that varies along the car bends the surface smoothly
export function densify(pts: P2[], step = 0.12): P2[] {
  const out: P2[] = []
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return out
}

// A wheel arch cut into the bottom edge: the circle round (cx, cy) from where it meets the sill in front,
// over the top, down to the sill behind (the order a bottom edge is walked from the front to the back)
export function arch(cx: number, cy: number, r: number, sill: number, steps = 12): P2[] {
  const a0 = Math.asin(clamp((sill - cy) / r, -1, 1))
  const pts: P2[] = []
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((Math.PI - 2 * a0) * s) / steps
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

// How wide a body is: `half` the flat width at its widest, rounding off in plan towards the nose and tail
// (losing `pinch` of the half-width at the very ends, over the last `round` metres), leaning in above `belt`
// (`lean` metres per metre up) and tucking in below `tuck`
export function plan({
  half,
  nose,
  tail,
  round,
  pinch,
  tailRound = round,
  tailPinch = pinch,
  belt = Infinity,
  lean = 0,
  tuck = -Infinity,
  tuckIn = 0,
}: {
  half: number
  nose: number
  tail: number
  round: number
  pinch: number
  tailRound?: number
  tailPinch?: number
  belt?: number
  lean?: number
  tuck?: number
  tuckIn?: number
}): Width {
  return (x, y) => {
    const front = clamp(1 - (nose - x) / round, 0, 1)
    const back = clamp(1 - (x - tail) / tailRound, 0, 1)
    const corner = Math.max(pinch * (1 - Math.sqrt(1 - front * front)), tailPinch * (1 - Math.sqrt(1 - back * back)))
    let w = half * (1 - corner)
    if (y > belt) w -= (y - belt) * lean
    if (y < tuck) w -= (tuck - y) * tuckIn
    return w
  }
}

function inside(pts: P2[], x: number, y: number) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
function distanceToOutline(pts: P2[], x: number, y: number) {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const dx = x1 - x0
    const dy = y1 - y0
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    best = Math.min(best, Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)))
  }
  return best
}

// Triangles filling a polygon, with a grid of points inside so the fill can bend
function fill(pts: P2[], grid: number) {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const inner: P2[] = []
  for (let x = Math.min(...xs) + grid / 2; x < Math.max(...xs); x += grid) {
    for (let y = Math.min(...ys) + grid / 2; y < Math.max(...ys); y += grid) {
      if (inside(pts, x, y) && distanceToOutline(pts, x, y) > grid * 0.6) inner.push([x, y])
    }
  }
  const faces = THREE.ShapeUtils.triangulateShape(
    pts.map((p) => new THREE.Vector2(...p)),
    inner.map((p) => [new THREE.Vector2(...p)]),
  )
  return { points: [...pts, ...inner], faces }
}

// A triangle's corners in counter-clockwise order (so it faces +z)
function ccwFace(points: P2[], [a, b, c]: number[]) {
  const [xa, ya] = points[a]
  const [xb, yb] = points[b]
  const [xc, yc] = points[c]
  return (xb - xa) * (yc - ya) - (yb - ya) * (xc - xa) >= 0 ? [a, b, c] : [a, c, b]
}

// Outward normals of a closed counter-clockwise outline, at each point
function outlineNormals(pts: P2[]) {
  return pts.map((_, i) => {
    const [xa, ya] = pts[(i - 1 + pts.length) % pts.length]
    const [xb, yb] = pts[(i + 1) % pts.length]
    const n = new THREE.Vector2(yb - ya, -(xb - xa))
    return n.normalize()
  })
}

// A body part's surface: its side outline (points, counter-clockwise), how wide it is, and how round its rim
// is (the rounding sits outside the outline: the part's silhouette is the outline grown by r)
export type Surface = { outline: P2[]; width: Width; r: number }
export function surface(outline: P2[], width: Width, r: number): Surface {
  return { outline: ccw(densify(outline, 0.1)), width, r }
}

// How far out from the middle the surface is at (x, y): the flat side inside the outline, curling round the
// rounded rim just outside it
export function surfaceZ({ outline, width, r }: Surface, x: number, y: number) {
  const hw = width(x, y)
  if (inside(outline, x, y)) return hw
  const d = Math.min(distanceToOutline(outline, x, y), r)
  return hw - r + Math.sqrt(r * r - d * d)
}

// The point on the outline nearest (x, y), and the outward normal there
function nearestOnOutline(pts: P2[], x: number, y: number) {
  let best = { d: Infinity, x, y, nx: 0, ny: 1 }
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / (len * len), 0, 1)
    const px = x0 + t * dx
    const py = y0 + t * dy
    const d = Math.hypot(x - px, y - py)
    if (d < best.d) best = { d, x: px, y: py, nx: dy / len, ny: -dx / len }
  }
  return best
}

function indexed(pos: number[], index: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

// A body part: the outline pushed out to its width either side of the middle, with a rounded rim
export function shell({ outline: pts, width, r }: Surface, grid = 0.14, arcSteps = 4) {
  const n = pts.length
  const normals = outlineNormals(pts)
  const { points, faces } = fill(pts, grid)
  const hw = points.map(([x, y]) => Math.max(width(x, y), r + 0.01))
  const pos: number[] = []
  const add = (x: number, y: number, z: number) => pos.push(x, y, z) / 3 - 1
  const left = points.map(([x, y], i) => add(x, y, -hw[i]))
  const right = points.map(([x, y], i) => add(x, y, hw[i]))
  const index: number[] = []
  for (const face of faces) {
    const [a, b, c] = ccwFace(points, face)
    index.push(right[a], right[b], right[c])
    index.push(left[a], left[c], left[b])
  }
  // The rounded rim: rings of points round the outline, from the left face over to the right
  const rings: number[][] = [left.slice(0, n)]
  const ring = (angle: number, side: -1 | 1) =>
    pts.map(([x, y], i) => {
      const k = Math.sin(angle) * r
      return add(x + normals[i].x * k, y + normals[i].y * k, side * (hw[i] - r + r * Math.cos(angle)))
    })
  for (let s = 1; s <= arcSteps; s++) rings.push(ring(((Math.PI / 2) * s) / arcSteps, -1))
  for (let s = arcSteps; s >= 1; s--) rings.push(ring(((Math.PI / 2) * s) / arcSteps, 1))
  rings.push(right.slice(0, n))
  const p = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2])
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const cross = new THREE.Vector3()
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const a = rings[k][i]
      const b = rings[k][j]
      const c = rings[k + 1][j]
      const d = rings[k + 1][i]
      // Wind each triangle to face outwards (away from the middle of the rim)
      const out = new THREE.Vector3(normals[i].x, normals[i].y, 0)
      const tri = (i0: number, i1: number, i2: number) => {
        const p0 = p(i0)
        cross.crossVectors(e1.subVectors(p(i1), p0), e2.subVectors(p(i2), p0))
        if (cross.dot(out) >= 0) index.push(i0, i1, i2)
        else index.push(i0, i2, i1)
      }
      tri(a, b, c)
      tri(a, c, d)
    }
  }
  return indexed(pos, index)
}

// A thin patch on a part's side (a window, a lamp, a badge), lifted just off it. Where it runs over the edge
// it curls round the rounded rim. side: +1 for the right (+z), -1 for the left.
export function sidePatch(poly: P2[], surf: Surface, side: 1 | -1, lift = 0.004, grid = 0.045) {
  const pts = ccw(densify(poly, 0.045))
  const { points, faces } = fill(pts, grid)
  const pos: number[] = []
  for (const [x, y] of points) pos.push(x, y, side * (surfaceZ(surf, x, y) + lift))
  const index: number[] = []
  for (const face of faces) {
    const [a, b, c] = ccwFace(points, face)
    if (side > 0) index.push(a, b, c)
    else index.push(a, c, b)
  }
  return indexed(pos, index)
}

// A patch on a part's rim (a windscreen, a lamp, a grille), along `path` and across from z0 to z1 (clamped
// to the rim's flat part, `margin` in from its edges; either may vary along the path). The path's points are
// moved onto the outline, so it only has to be roughly right.
type Across = number | ((x: number, y: number) => number)
export function rimPatch(
  path: P2[],
  { outline, width, r }: Surface,
  {
    z0 = -Infinity as Across,
    z1 = Infinity as Across,
    margin = 0.02,
    lift = 0.004,
    across = 8,
  }: { z0?: Across; z1?: Across; margin?: number; lift?: number; across?: number } = {},
) {
  const zAt = (z: Across, x: number, y: number) => (typeof z === 'number' ? z : z(x, y))
  const pos: number[] = []
  const index: number[] = []
  const outs: THREE.Vector3[] = []
  for (const [px, py] of path) {
    const { x, y, nx, ny } = nearestOnOutline(outline, px, py)
    const flat = Math.max(width(x, y) - r - margin, 0)
    const a = clamp(zAt(z0, x, y), -flat, flat)
    const b = clamp(zAt(z1, x, y), -flat, flat)
    for (let k = 0; k <= across; k++) pos.push(x + nx * (r + lift), y + ny * (r + lift), a + ((b - a) * k) / across)
    outs.push(new THREE.Vector3(nx, ny, 0))
  }
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const at = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2])
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < across; k++) {
      const a = i * (across + 1) + k
      const b = a + 1
      const c = a + across + 2
      const d = a + across + 1
      const n = new THREE.Vector3().crossVectors(e1.subVectors(at(b), at(a)), e2.subVectors(at(c), at(a)))
      if (n.dot(outs[i]) >= 0) index.push(a, b, c, a, c, d)
      else index.push(a, c, b, a, d, c)
    }
  }
  return indexed(pos, index)
}

// Points along an open line, no more than `step` apart
function densifyOpen(pts: P2[], step: number): P2[] {
  const out: P2[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return out
}

// A strip along a line on a part's side (a shut line, a pinstripe, a rubbing strip)
export function sideLine(line: P2[], thick: number, surf: Surface, side: 1 | -1, lift = 0.006) {
  const pts = densifyOpen(line, 0.1)
  const pos: number[] = []
  const index: number[] = []
  const flat: P2[] = []
  pts.forEach(([x, y], i) => {
    const [xa, ya] = pts[Math.max(0, i - 1)]
    const [xb, yb] = pts[Math.min(pts.length - 1, i + 1)]
    const n = new THREE.Vector2(-(yb - ya), xb - xa).normalize().multiplyScalar(thick / 2)
    for (const s of [-1, 1]) {
      const px = x + n.x * s
      const py = y + n.y * s
      pos.push(px, py, side * (surfaceZ(surf, px, py) + lift))
      flat.push([px, py])
    }
  })
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2
    for (const face of [
      [a, a + 1, a + 2],
      [a + 1, a + 3, a + 2],
    ]) {
      const [p, q, r] = ccwFace(flat, face)
      if (side > 0) index.push(p, q, r)
      else index.push(p, r, q)
    }
  }
  return indexed(pos, index)
}

// ---------------------------------------------------------------------------------------------------------
// Wheels

// A tyre round the z axis: rounded shoulders, a sidewall down to the rim
export function tyreGeometry(radius: number, width: number, rim: number) {
  const c = Math.min(width * 0.28, (radius - rim) * 0.45)
  const h = width / 2
  const profile: THREE.Vector2[] = [new THREE.Vector2(rim, -h * 0.92)]
  profile.push(new THREE.Vector2(radius - c, -h))
  for (let s = 1; s < 5; s++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (s / 5)
    profile.push(new THREE.Vector2(radius - c + c * Math.cos(a), -h + c + c * Math.sin(a)))
  }
  profile.push(new THREE.Vector2(radius, -h + c), new THREE.Vector2(radius, h - c))
  for (let s = 1; s < 5; s++) {
    const a = (Math.PI / 2) * (s / 5)
    profile.push(new THREE.Vector2(radius - c + c * Math.cos(a), h - c + c * Math.sin(a)))
  }
  profile.push(new THREE.Vector2(radius - c, h), new THREE.Vector2(rim, h * 0.92))
  return new THREE.LatheGeometry(profile, 36).rotateX(Math.PI / 2)
}

// Openings in a wheel's face between its spokes: n wedges between radii r0 and r1, each `fill` of its share of
// the circle (so spokes take the rest)
export function spokeHoles(n: number, r0: number, r1: number, fill = 0.55, round = 0.3) {
  const shapes: THREE.Shape[] = []
  for (let i = 0; i < n; i++) {
    const mid = (i / n) * Math.PI * 2
    const half = (Math.PI / n) * fill
    const pts: P2[] = []
    const steps = 8
    for (let s = 0; s <= steps; s++) {
      const a = mid - half + (2 * half * s) / steps
      pts.push([r1 * Math.cos(a), r1 * Math.sin(a)])
    }
    const inner = half * (r0 / r1) * 0.6
    pts.push([r0 * Math.cos(mid + inner), r0 * Math.sin(mid + inner)], [r0 * Math.cos(mid - inner), r0 * Math.sin(mid - inner)])
    shapes.push(new THREE.Shape(rounded(pts, (r1 - r0) * round, 3).map((p) => new THREE.Vector2(...p))))
  }
  return new THREE.ShapeGeometry(shapes, 6)
}

// Thin radial slots round a wheel's face
export function slots(n: number, r0: number, r1: number, wide: number) {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const g = new RoundedBoxGeometry(r1 - r0, wide, 0.004, 1, Math.min(wide / 2, 0.01)).translate((r0 + r1) / 2, 0, 0).rotateZ(a)
    parts.push(g)
  }
  return parts
}

// ---------------------------------------------------------------------------------------------------------
// Materials

const paints = new Map<string, THREE.MeshStandardMaterial>()
// Car paint: glossy; metallic paints a little more so
export function paint(color: string, metallic = false) {
  const key = `${color}:${metallic}`
  let m = paints.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: metallic ? 0.3 : 0.38, metalness: metallic ? 0.25 : 0.1 })
    paints.set(key, m)
  }
  return m
}
export const glass = new THREE.MeshStandardMaterial({ color: '#34444f', roughness: 0.08, metalness: 0.35 })
export const rubber = new THREE.MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.9 })
export const blackTrim = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.6 })
export const plasticGrey = new THREE.MeshStandardMaterial({ color: '#4d4f55', roughness: 0.75 })
export const chrome = new THREE.MeshStandardMaterial({ color: '#e3e6ea', roughness: 0.18, metalness: 0.75 })
export const silverWheel = new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.3, metalness: 0.55 })
export const shadowy = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 1 })
export function lamp(color: string, glow = 0.25) {
  const key = `lamp:${color}:${glow}`
  let m = paints.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: 0.15, metalness: 0.2 })
    paints.set(key, m)
  }
  return m
}

const boxes = new Map<string, RoundedBoxGeometry>()
// A rounded box, shared by size
export function roundBox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.3) {
  const key = [w, h, d, r].map((v) => v.toFixed(3)).join(',')
  let g = boxes.get(key)
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.0005))
    boxes.set(key, g)
  }
  return g
}

// ---------------------------------------------------------------------------------------------------------
// What a car model is made of: meshes (nested, each placed in its parent's frame) and the convex shapes its
// collider is built from. Everything in real-world metres; the parking lot scales it to the characters.

export type P3 = [number, number, number]
// Cars are modelled at real size and shown a touch bigger, so the characters (about 1.9 m tall) stand next to
// them like people would
export const CAR_SCALE = 1.1
export type Part = {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material
  position?: P3
  rotation?: P3
  shadow?: boolean
  children?: Part[]
}
export type CarBuild = { parts: Part[]; hulls: THREE.BufferGeometry[] }

// Fewer draw calls: the parts that sit where they were built (no transform of their own) are merged into one
// mesh per material
export function mergeParts(parts: Part[]): Part[] {
  const groups = new Map<string, { material: THREE.Material; shadow: boolean; geometries: THREE.BufferGeometry[] }>()
  const out: Part[] = []
  for (const p of parts) {
    if (!p.geometry || !p.material || p.position || p.rotation || p.children) {
      out.push(p)
      continue
    }
    const key = `${p.material.uuid}:${!!p.shadow}`
    let g = groups.get(key)
    if (!g) {
      g = { material: p.material, shadow: !!p.shadow, geometries: [] }
      groups.set(key, g)
    }
    g.geometries.push(p.geometry)
  }
  for (const { material, shadow, geometries } of groups.values()) {
    const merged = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0]
    if (merged) out.push(part(merged, material, undefined, undefined, shadow))
    else out.push(...geometries.map((g) => part(g, material, undefined, undefined, shadow)))
  }
  return out
}

export const part = (geometry: THREE.BufferGeometry, material: THREE.Material, position?: P3, rotation?: P3, shadow = false): Part => ({
  geometry,
  material,
  position,
  rotation,
  shadow,
})
// The same geometry and material on both sides (for patches built per side)
export const bothSides = (make: (side: 1 | -1) => THREE.BufferGeometry, material: THREE.Material): Part[] => [
  part(make(1), material),
  part(make(-1), material),
]
// A part and its mirror image across the car (z -> -z)
export const pair = (geometry: THREE.BufferGeometry, material: THREE.Material, [x, y, z]: P3, rotation: P3 = [0, 0, 0], shadow = false): Part[] => [
  part(geometry, material, [x, y, z], rotation, shadow),
  part(geometry, material, [x, y, -z], [-rotation[0], -rotation[1], rotation[2]], shadow),
]

export type WheelStyle = {
  radius: number
  width: number
  rim: number // radius of the wheel's face (the rim or hubcap)
  face: THREE.Material
  dish?: number // how far the face sits in from the tyre's outer edge
  holes?: { n: number; r0: number; r1: number; fill?: number } // dark openings between spokes
  slots?: { n: number; r0: number; r1: number; wide: number; material?: THREE.Material }
  rings?: { r0: number; r1: number; material: THREE.Material }[] // bands on the face (a lip, a trim ring)
  cap?: { r: number; material: THREE.Material; dome?: number } // the centre cap (a dome for a hubcap)
  nuts?: { n: number; r: number } // wheel nuts round the centre
  whitewall?: [number, number] // a white band on the tyre's sidewall, between these radii
}

const tyres = new Map<string, THREE.BufferGeometry>()
const faces = new Map<string, THREE.BufferGeometry>()
const cached = (map: Map<string, THREE.BufferGeometry>, key: string, make: () => THREE.BufferGeometry) => {
  let g = map.get(key)
  if (!g) {
    g = make()
    map.set(key, g)
  }
  return g
}
const whiteWall = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.8 })
const nutLook = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.3, metalness: 0.6 })

// A wheel at `at`, its face towards `side` (+1 the right, -1 the left)
export function wheel(s: WheelStyle, at: P3, side: 1 | -1): Part {
  const h = s.width / 2
  const k = `${s.radius},${s.width},${s.rim}`
  const face = h * 0.92 - (s.dish ?? 0.015)
  const children: Part[] = [
    part(cached(tyres, k, () => tyreGeometry(s.radius, s.width, s.rim)), rubber, undefined, undefined, true),
    part(cached(faces, `disc${s.rim}`, () => new THREE.CircleGeometry(s.rim, 40)), s.face, [0, 0, face]),
    // The inside of the wheel, closed off
    part(cached(faces, `back${s.rim}`, () => new THREE.CircleGeometry(s.rim, 24).rotateY(Math.PI)), shadowy, [0, 0, -h * 0.9]),
  ]
  if (s.holes) {
    const { n, r0, r1, fill: f } = s.holes
    children.push(part(cached(faces, `holes${n},${r0},${r1},${f}`, () => spokeHoles(n, r0, r1, f)), shadowy, [0, 0, face + 0.002]))
  }
  if (s.slots) {
    const { n, r0, r1, wide, material } = s.slots
    const g = cached(faces, `slots${n},${r0},${r1},${wide}`, () => mergeGeometries(slots(n, r0, r1, wide))!)
    children.push(part(g, material ?? shadowy, [0, 0, face + 0.002]))
  }
  for (const ring of s.rings ?? []) {
    children.push(part(cached(faces, `ring${ring.r0},${ring.r1}`, () => new THREE.RingGeometry(ring.r0, ring.r1, 48)), ring.material, [0, 0, face + 0.003]))
  }
  if (s.nuts) {
    const nut = cached(faces, 'nut', () => new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6).rotateX(Math.PI / 2))
    for (let i = 0; i < s.nuts.n; i++) {
      const a = (i / s.nuts.n) * Math.PI * 2
      children.push(part(nut, nutLook, [Math.cos(a) * s.nuts.r, Math.sin(a) * s.nuts.r, face + 0.01]))
    }
  }
  if (s.cap) {
    const dome = s.cap.dome ?? 0
    const g = dome
      ? cached(faces, `dome${s.cap.r},${dome}`, () =>
          new THREE.SphereGeometry(s.cap!.r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, dome / s.cap!.r, 1).rotateX(Math.PI / 2),
        )
      : cached(faces, `cap${s.cap.r}`, () => new THREE.CircleGeometry(s.cap!.r, 28))
    children.push(part(g, s.cap.material, [0, 0, face + 0.004], undefined, !!dome))
  }
  if (s.whitewall) {
    const [r0, r1] = s.whitewall
    children.push(part(cached(faces, `ww${r0},${r1}`, () => new THREE.RingGeometry(r0, r1, 48)), whiteWall, [0, 0, h + 0.002]))
  }
  return { position: at, rotation: [0, side > 0 ? 0 : Math.PI, 0], children }
}
