import type { useRapier } from '@react-three/rapier'
import { timetabled, timetabledVersion } from '../kinematic'

// Looking ahead. Everything that moves on a race course does so on a timetable (../kinematic), so where it
// will be a moment from now is known exactly. solidsAt(t) gives every such thing as it will stand at time t:
// each of its colliders as a ball, box or cylinder in the world, marked as a hazard (it knocks you about) or
// a floor (you can stand on it). On those: how far a point is from one (distance), and what a ray straight
// down hits (rayDown). Worked out once per moment and shared by every bot.

type Physics = ReturnType<typeof useRapier>

export const GRID = 0.05 // seconds between the moments looked at

const BALL = 0
const BOX = 1
const CYLINDER = 2 // its axis along its own y

export type Solid = {
  body: number
  hazard: boolean
  kind: number
  a: number // ball: radius; box: half extents a, b, c; cylinder: radius a, half height b
  b: number
  c: number
  x: number // where its middle is, and how it's turned (a quaternion)
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  bound: number // nothing of it is further than this from its middle
}

// One collider of a timetabled body, relative to the body
type Part = { kind: number; a: number; b: number; c: number; x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; bound: number }
// Its parts, whether that's all of it (or it has colliders of other shapes too), and how the body's turned
// when its timetable doesn't say
type Mover = { parts: Part[]; whole: boolean; qx: number; qy: number; qz: number; qw: number }

const movers = new Map<number, Mover | null>()
const frames = new Map<number, Solid[]>()
let version = -1

// v turned by q, into out
const out = { x: 0, y: 0, z: 0 }
function turn(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number) {
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  out.x = vx + qw * tx + (qy * tz - qz * ty)
  out.y = vy + qw * ty + (qz * tx - qx * tz)
  out.z = vz + qw * tz + (qx * ty - qy * tx)
  return out
}

function moverFor(physics: Physics, handle: number): Mover | null {
  const known = movers.get(handle)
  if (known !== undefined) return known
  const { world, rapier } = physics
  const rb = world.getRigidBody(handle)
  if (!rb) return null
  const n = rb.numColliders()
  if (n === 0) return null // not built yet: look again next time
  const bp = rb.translation()
  const bq = rb.rotation()
  const parts: Part[] = []
  let whole = true
  for (let i = 0; i < n; i++) {
    const c = rb.collider(i)
    if (c.isSensor()) continue
    const shape = c.shape as unknown as { type: number; radius?: number; halfHeight?: number; halfExtents?: { x: number; y: number; z: number } }
    let kind: number
    let a = 0
    let b = 0
    let cc = 0
    if (shape.type === rapier.ShapeType.Ball) {
      kind = BALL
      a = shape.radius!
    } else if (shape.type === rapier.ShapeType.Cuboid) {
      kind = BOX
      a = shape.halfExtents!.x
      b = shape.halfExtents!.y
      cc = shape.halfExtents!.z
    } else if (shape.type === rapier.ShapeType.Cylinder || shape.type === rapier.ShapeType.Cone) {
      kind = CYLINDER
      a = shape.radius!
      b = shape.halfHeight!
    } else if (shape.type === rapier.ShapeType.Capsule) {
      kind = CYLINDER
      a = shape.radius!
      b = shape.halfHeight! + shape.radius!
    } else {
      whole = false
      continue
    }
    // The collider relative to its body: undo the body's turn
    const cp = c.translation()
    const cq = c.rotation()
    const lp = turn(-bq.x, -bq.y, -bq.z, bq.w, cp.x - bp.x, cp.y - bp.y, cp.z - bp.z)
    const part: Part = {
      kind,
      a,
      b,
      c: cc,
      x: lp.x,
      y: lp.y,
      z: lp.z,
      // conj(bq) * cq
      qx: bq.w * cq.x - bq.x * cq.w - bq.y * cq.z + bq.z * cq.y,
      qy: bq.w * cq.y + bq.x * cq.z - bq.y * cq.w - bq.z * cq.x,
      qz: bq.w * cq.z - bq.x * cq.y + bq.y * cq.x - bq.z * cq.w,
      qw: bq.w * cq.w + bq.x * cq.x + bq.y * cq.y + bq.z * cq.z,
      bound: kind === BALL ? a : kind === BOX ? Math.hypot(a, b, cc) : Math.hypot(a, b),
    }
    parts.push(part)
  }
  const mover = { parts, whole: whole && parts.length > 0, qx: bq.x, qy: bq.y, qz: bq.z, qw: bq.w }
  movers.set(handle, mover)
  return mover
}

// Everything on a timetable, as it will stand at time t (to the nearest GRID)
export function solidsAt(physics: Physics, t: number): Solid[] {
  if (version !== timetabledVersion()) {
    version = timetabledVersion()
    movers.clear()
    frames.clear()
  }
  const key = Math.round(t / GRID)
  const known = frames.get(key)
  if (known) return known
  const time = key * GRID
  const solids: Solid[] = []
  for (const [handle, entry] of timetabled) {
    const mover = moverFor(physics, handle)
    if (!mover) continue
    const pose = entry.pose(time)
    const px = pose.position.x
    const py = pose.position.y
    const pz = pose.position.z
    if (py < -200) continue // put away
    const r = pose.rotation
    const bx = r ? r.x : mover.qx
    const by = r ? r.y : mover.qy
    const bz = r ? r.z : mover.qz
    const bw = r ? r.w : mover.qw
    for (const p of mover.parts) {
      const at = turn(bx, by, bz, bw, p.x, p.y, p.z)
      solids.push({
        body: handle,
        hazard: entry.hazard,
        kind: p.kind,
        a: p.a,
        b: p.b,
        c: p.c,
        x: px + at.x,
        y: py + at.y,
        z: pz + at.z,
        // bq * part q
        qx: bw * p.qx + bx * p.qw + by * p.qz - bz * p.qy,
        qy: bw * p.qy - bx * p.qz + by * p.qw + bz * p.qx,
        qz: bw * p.qz + bx * p.qy - by * p.qx + bz * p.qw,
        qw: bw * p.qw - bx * p.qx - by * p.qy - bz * p.qz,
        bound: p.bound,
      })
    }
  }
  frames.set(key, solids)
  return solids
}

// Moments that have gone by are no use to anyone
export function forgetBefore(t: number) {
  const key = Math.round(t / GRID)
  for (const k of frames.keys()) if (k < key) frames.delete(k)
}

// How far the point is from the solid's surface (negative inside it)
export function distance(s: Solid, x: number, y: number, z: number) {
  const l = turn(-s.qx, -s.qy, -s.qz, s.qw, x - s.x, y - s.y, z - s.z)
  if (s.kind === BALL) return Math.hypot(l.x, l.y, l.z) - s.a
  if (s.kind === BOX) {
    const dx = Math.abs(l.x) - s.a
    const dy = Math.abs(l.y) - s.b
    const dz = Math.abs(l.z) - s.c
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0)
  }
  const dr = Math.hypot(l.x, l.z) - s.a
  const dy = Math.abs(l.y) - s.b
  return Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) + Math.min(Math.max(dr, dy), 0)
}

// A ray straight down from (x, y, z): how far until it meets the solid (0 if it starts inside; -1 if it
// misses, or the solid is further than `reach`), and in `rayUp` how much the surface it meets faces up
// (1: level ground; 0: a wall)
export const ray = { up: 0 }
export function rayDown(s: Solid, x: number, y: number, z: number, reach: number) {
  const o = turn(-s.qx, -s.qy, -s.qz, s.qw, x - s.x, y - s.y, z - s.z)
  const ox = o.x
  const oy = o.y
  const oz = o.z
  const d = turn(-s.qx, -s.qy, -s.qz, s.qw, 0, -1, 0)
  const dx = d.x
  const dy = d.y
  const dz = d.z
  let t = -1
  let nx = 0
  let ny = 0
  let nz = 0
  if (s.kind === BALL) {
    const b = ox * dx + oy * dy + oz * dz
    const c = ox * ox + oy * oy + oz * oz - s.a * s.a
    if (c <= 0) return 0
    const disc = b * b - c
    if (disc < 0 || b > 0) return -1
    t = -b - Math.sqrt(disc)
    nx = (ox + dx * t) / s.a
    ny = (oy + dy * t) / s.a
    nz = (oz + dz * t) / s.a
  } else if (s.kind === BOX) {
    let near = -Infinity
    let far = Infinity
    let axis = 0
    const os = [ox, oy, oz]
    const ds = [dx, dy, dz]
    const hs = [s.a, s.b, s.c]
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ds[i]) < 1e-9) {
        if (Math.abs(os[i]) > hs[i]) return -1
        continue
      }
      let t0 = (-hs[i] - os[i]) / ds[i]
      let t1 = (hs[i] - os[i]) / ds[i]
      if (t0 > t1) [t0, t1] = [t1, t0]
      if (t0 > near) {
        near = t0
        axis = i
      }
      if (t1 < far) far = t1
    }
    if (near > far || far < 0) return -1
    if (near <= 0) return 0
    t = near
    const sign = ds[axis] > 0 ? -1 : 1
    nx = axis === 0 ? sign : 0
    ny = axis === 1 ? sign : 0
    nz = axis === 2 ? sign : 0
  } else {
    // The caps, then the round side
    let best = Infinity
    if (Math.abs(dy) > 1e-9) {
      const cap = dy < 0 ? s.b : -s.b // the cap facing the ray
      const tc = (cap - oy) / dy
      const hx = ox + dx * tc
      const hz = oz + dz * tc
      if (tc >= 0 && hx * hx + hz * hz <= s.a * s.a) {
        best = tc
        nx = 0
        ny = dy < 0 ? 1 : -1
        nz = 0
      }
    }
    const a = dx * dx + dz * dz
    if (a > 1e-9) {
      const b = ox * dx + oz * dz
      const c = ox * ox + oz * oz - s.a * s.a
      const disc = b * b - a * c
      if (disc >= 0) {
        const ts = (-b - Math.sqrt(disc)) / a
        const hy = oy + dy * ts
        if (ts >= 0 && ts < best && Math.abs(hy) <= s.b) {
          best = ts
          nx = (ox + dx * ts) / s.a
          ny = 0
          nz = (oz + dz * ts) / s.a
        }
      }
    }
    if (best === Infinity) {
      // No way in from here: inside it, or a miss
      return Math.abs(oy) <= s.b && ox * ox + oz * oz <= s.a * s.a ? 0 : -1
    }
    if (Math.abs(oy) <= s.b && ox * ox + oz * oz <= s.a * s.a) return 0
    t = best
  }
  if (t > reach) return -1
  // How much the surface faces up: its normal against the world's up, which in its own frame is -d
  ray.up = -(nx * dx + ny * dy + nz * dz)
  return t
}

// Whether a timetabled body is all in solidsAt (every collider it has a ball, box or cylinder): anything else
// (a convex hull, a mesh) has to be looked for some other way
export function foreseen(physics: Physics, handle: number) {
  return moverFor(physics, handle)?.whole ?? false
}
