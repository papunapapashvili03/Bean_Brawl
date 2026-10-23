import * as THREE from 'three'
import type { GrabEdge } from '../grab'
import type { MatKey } from './textures'

// Building kit for the gunfight maps (Hillside, Suburb). Everything is made of boxes ("pieces"): walls with holes for doors and windows,
// floor slabs with stairwells, roofs with parapets, stairs (drawn as steps, walked as a ramp). Pieces are
// merged into one mesh per material, and each solid one gets a box collider.
//
// World axes: +x east, +z south, y up. A footprint is [x0, z0]..[x1, z1]; its sides are north (z0), south
// (z1), west (x0) and east (x1).

export type P3 = [number, number, number]
// solid: false is drawn but not walked into; hidden is walked into but not drawn (an unseen wall)
export type Piece = { centre: P3; size: P3; rotY?: number; mat: MatKey; solid?: boolean; grab?: boolean; hidden?: boolean }
export type Ramp = { centre: P3; half: P3; rotation: P3 } // a collider only (a stair's slope)
export type Hull = { points: number[]; mat: MatKey } // a convex solid (e.g. a pitched roof), drawn and walked as-is
// Ground cover laid over the paving: a polygon (points are (x, z)), or a ring round a centre
export type Zone = { mat: MatKey; outline?: [number, number][]; ring?: { centre: [number, number]; r0: number; r1: number } }

export const box = (min: P3, max: P3, mat: MatKey, extra: Partial<Piece> = {}): Piece => ({
  centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  mat,
  ...extra,
})

// Texture coordinates in metres, projected along whichever axis a face looks down: textures tile evenly and
// line up across neighbouring pieces
export function worldUV(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    let u: number
    let v: number
    if (ay >= ax && ay >= az) [u, v] = [p.getX(i), p.getZ(i)]
    else if (ax >= az) [u, v] = [p.getZ(i), p.getY(i)]
    else [u, v] = [p.getX(i), p.getY(i)]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

export function pieceGeometry({ centre, size, rotY = 0 }: Piece) {
  return worldUV(new THREE.BoxGeometry(...size).rotateY(rotY).translate(...centre))
}

// The top edges of a piece you can catch and climb over
export function pieceLedges({ centre, size, rotY = 0 }: Piece): GrabEdge[] {
  const [cx, cy, cz] = centre
  const hx = size[0] / 2
  const hz = size[2] / 2
  const y = cy + size[1] / 2
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  // Local (x, z) to world, turning about the vertical by rotY
  const at = (x: number, z: number) => ({ x: cx + x * c + z * s, y, z: cz - x * s + z * c })
  const dir = (x: number, z: number) => ({ x: x * c + z * s, z: -x * s + z * c })
  return [
    { kind: 'ledge', a: at(-hx, hz), b: at(hx, hz), out: dir(0, 1) },
    { kind: 'ledge', a: at(-hx, -hz), b: at(hx, -hz), out: dir(0, -1) },
    { kind: 'ledge', a: at(hx, -hz), b: at(hx, hz), out: dir(1, 0) },
    { kind: 'ledge', a: at(-hx, -hz), b: at(-hx, hz), out: dir(-1, 0) },
  ]
}

// ---------------------------------------------------------------------------------------------------------
// Walls with openings

export type Side = 'n' | 's' | 'w' | 'e'
export type Opening = { side: Side; at: number; width: number; bottom: number; top: number; floor?: number }
export const door = (side: Side, at: number, floor = 0, width = 1.4): Opening => ({ side, at, width, bottom: 0, top: 2.4, floor })
export const window = (side: Side, at: number, floor = 0, width = 1.5): Opening => ({ side, at, width, bottom: 1.05, top: 2.35, floor })

// A straight wall from `a` to `b` (along x or along z) at height y0..y0+h, with holes cut for openings (their
// `at` is measured along the wall from `a`). Returns the pieces between and round the holes.
export function wallPieces(a: [number, number], b: [number, number], y0: number, h: number, thick: number, mat: MatKey, holes: { at: number; width: number; bottom: number; top: number }[]) {
  const alongX = a[1] === b[1]
  const length = alongX ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1])
  const sign = alongX ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1])
  const pieces: Piece[] = []
  const put = (u0: number, u1: number, v0: number, v1: number) => {
    if (u1 - u0 < 0.02 || v1 - v0 < 0.02) return
    const p0 = alongX ? a[0] + sign * u0 : a[1] + sign * u0
    const p1 = alongX ? a[0] + sign * u1 : a[1] + sign * u1
    const lo = Math.min(p0, p1)
    const hi = Math.max(p0, p1)
    pieces.push(
      alongX
        ? box([lo, y0 + v0, a[1] - thick / 2], [hi, y0 + v1, a[1] + thick / 2], mat)
        : box([a[0] - thick / 2, y0 + v0, lo], [a[0] + thick / 2, y0 + v1, hi], mat),
    )
  }
  const sorted = [...holes].sort((p, q) => p.at - q.at)
  let u = 0
  for (const hole of sorted) {
    const u0 = Math.max(0, hole.at - hole.width / 2)
    const u1 = Math.min(length, hole.at + hole.width / 2)
    put(u, u0, 0, h)
    put(u0, u1, 0, hole.bottom)
    put(u0, u1, hole.top, h)
    u = u1
  }
  put(u, length, 0, h)
  return pieces
}

// ---------------------------------------------------------------------------------------------------------
// Buildings

export type Building = {
  min: [number, number]
  max: [number, number]
  floors: number
  height?: number // per floor
  wall: MatKey
  openings?: Opening[]
  solid?: boolean // a closed block with window panes on its faces, rather than rooms to go into
  roof: 'flat' | 'pitched'
  roofMat?: MatKey
  parapet?: number // height of the low wall round a flat roof (0: none)
  parapetGaps?: { side: Side; at: number; width: number }[] // where stairs come up onto the roof
  grabParapet?: boolean // the parapet's top can be caught (to climb onto the roof)
  stairwells?: { floor: number; min: [number, number]; max: [number, number] }[] // holes in a floor slab
  partitions?: { a: [number, number]; b: [number, number]; floor?: number; doors?: number[] }[] // inside walls
  windowsEvery?: number // solid buildings: spacing of the window panes
  base?: number // standing on something (e.g. a room on a roof): its floor's height
  floorMat?: MatKey // the floor inside (rooms you can go into)
  grabRoof?: boolean // a flat roof's edge can be caught (to climb onto it)
  trim?: MatKey // frames round the doors and windows, outside
}

const THICK = 0.3
const SLAB = 0.3
export const FLOOR = 3.4

// The ground-floor sides of a footprint, each as a line from `a` to `b` (openings measure `at` from `a`)
function sides(min: [number, number], max: [number, number]) {
  const [x0, z0] = min
  const [x1, z1] = max
  const t = THICK / 2
  return {
    n: { a: [x0, z0 + t] as [number, number], b: [x1, z0 + t] as [number, number] },
    s: { a: [x0, z1 - t] as [number, number], b: [x1, z1 - t] as [number, number] },
    w: { a: [x0 + t, z0 + THICK] as [number, number], b: [x0 + t, z1 - THICK] as [number, number] },
    e: { a: [x1 - t, z0 + THICK] as [number, number], b: [x1 - t, z1 - THICK] as [number, number] },
  }
}

// A slab over a footprint with rectangular holes cut in it (split into strips round each hole)
function slabPieces(min: [number, number], max: [number, number], y0: number, y1: number, mat: MatKey, holes: { min: [number, number]; max: [number, number] }[]): Piece[] {
  if (!holes.length) return [box([min[0], y0, min[1]], [max[0], y1, max[1]], mat)]
  const [hole, ...rest] = holes
  const parts: [[number, number], [number, number]][] = [
    [min, [max[0], hole.min[1]]],
    [[min[0], hole.max[1]], max],
    [[min[0], hole.min[1]], [hole.min[0], hole.max[1]]],
    [[hole.max[0], hole.min[1]], [max[0], hole.max[1]]],
  ]
  return parts
    .filter(([a, b]) => b[0] - a[0] > 0.02 && b[1] - a[1] > 0.02)
    .flatMap(([a, b]) => slabPieces(a, b, y0, y1, mat, rest.filter((h) => h.min[0] < b[0] && h.max[0] > a[0] && h.min[1] < b[1] && h.max[1] > a[1])))
}

export function buildingPieces(bl: Building): { pieces: Piece[]; hulls: Hull[] } {
  const built = buildingAtGround(bl)
  const base = bl.base ?? 0
  if (!base) return built
  return {
    pieces: built.pieces.map((p) => ({ ...p, centre: [p.centre[0], p.centre[1] + base, p.centre[2]] as P3 })),
    hulls: built.hulls.map((h) => ({ ...h, points: h.points.map((v, i) => (i % 3 === 1 ? v + base : v)) })),
  }
}

function buildingAtGround(bl: Building): { pieces: Piece[]; hulls: Hull[] } {
  const h = bl.height ?? FLOOR
  const top = h * bl.floors
  const [x0, z0] = bl.min
  const [x1, z1] = bl.max
  const pieces: Piece[] = []
  const hulls: Hull[] = []
  if (bl.solid) {
    pieces.push(box([x0, 0, z0], [x1, top, z1], bl.wall))
    pieces.push(...windowPanes(bl, h))
  } else {
    // The floor inside (thin: on the ground, or on the roof it stands on)
    pieces.push(box([x0 + THICK, 0, z0 + THICK], [x1 - THICK, 0.04, z1 - THICK], bl.floorMat ?? 'concrete', { solid: false }))
    const s = sides(bl.min, bl.max)
    for (let f = 0; f < bl.floors; f++) {
      for (const side of ['n', 's', 'w', 'e'] as const) {
        const { a, b } = s[side]
        const holes = (bl.openings ?? []).filter((o) => o.side === side && (o.floor ?? 0) === f)
        // Openings are measured from the footprint's west/north corner; the side walls start one wall in
        const shift = side === 'w' || side === 'e' ? THICK : 0
        pieces.push(...wallPieces(a, b, f * h, h, THICK, bl.wall, holes.map((o) => ({ ...o, at: o.at - shift }))))
        pieces.push(...sills(side, a, holes, f * h, shift))
        if (bl.trim) pieces.push(...frames(side, a, holes, f * h, shift, bl.trim))
      }
      for (const p of bl.partitions ?? []) {
        if ((p.floor ?? 0) !== f) continue
        pieces.push(...wallPieces(p.a, p.b, f * h, h - SLAB, 0.2, bl.wall, (p.doors ?? []).map((at) => ({ at, width: 1.4, bottom: 0, top: 2.4 }))))
      }
      // The floor above (the roof slab over the top floor)
      const holes = f + 1 < bl.floors ? (bl.stairwells ?? []).filter((w) => w.floor === f + 1) : []
      pieces.push(...slabPieces([x0 + THICK, z0 + THICK], [x1 - THICK, z1 - THICK], (f + 1) * h - SLAB, (f + 1) * h, 'concrete', holes))
    }
  }
  // The roof
  if (bl.roof === 'flat') {
    pieces.push(box([x0 - 0.15, top, z0 - 0.15], [x1 + 0.15, top + 0.2, z1 + 0.15], bl.roofMat ?? 'roofGravel', { grab: bl.grabRoof }))
    const ph = bl.parapet ?? 0
    if (ph > 0) {
      const t = 0.25
      const y = top + 0.2
      const gaps = bl.parapetGaps ?? []
      const cut = (side: Side) => gaps.filter((g) => g.side === side).map((g) => ({ at: g.at, width: g.width, bottom: 0, top: ph + 1 }))
      const parapet = [
        ...wallPieces([x0 - 0.15, z0 - 0.15 + t / 2], [x1 + 0.15, z0 - 0.15 + t / 2], y, ph, t, bl.wall, cut('n')),
        ...wallPieces([x0 - 0.15, z1 + 0.15 - t / 2], [x1 + 0.15, z1 + 0.15 - t / 2], y, ph, t, bl.wall, cut('s')),
        ...wallPieces([x0 - 0.15 + t / 2, z0 - 0.15 + t], [x0 - 0.15 + t / 2, z1 + 0.15 - t], y, ph, t, bl.wall, cut('w')),
        ...wallPieces([x1 + 0.15 - t / 2, z0 - 0.15 + t], [x1 + 0.15 - t / 2, z1 + 0.15 - t], y, ph, t, bl.wall, cut('e')),
      ]
      pieces.push(...parapet.map((p) => ({ ...p, grab: bl.grabParapet })))
    }
  } else {
    // A pitched roof along the longer side, overhanging a little
    const o = 0.4
    const alongX = x1 - x0 >= z1 - z0
    const rise = (alongX ? z1 - z0 : x1 - x0) * 0.35
    const [a0, a1, b0, b1] = alongX ? [x0 - o, x1 + o, z0 - o, z1 + o] : [z0 - o, z1 + o, x0 - o, x1 + o]
    const mid = (b0 + b1) / 2
    const pts: number[] = []
    for (const a of [a0, a1]) {
      for (const [b, y] of [
        [b0, top],
        [b1, top],
        [mid, top + rise],
      ] as const) {
        pts.push(...(alongX ? [a, y, b] : [b, y, a]))
      }
    }
    hulls.push({ points: pts, mat: bl.roofMat ?? 'roofTile' })
    pieces.push(box([x0, top, z0], [x1, top + 0.05, z1], bl.wall))
  }
  return { pieces, hulls }
}

// Stone sills under the windows (sticking out a little)
function sills(side: Side, a: [number, number], holes: Opening[], y0: number, shift: number): Piece[] {
  return holes
    .filter((o) => o.bottom > 0.3)
    .map((o) => {
      const along = o.at - shift
      const y = y0 + o.bottom
      const out = side === 'n' ? -1 : side === 's' ? 1 : side === 'w' ? -1 : 1
      if (side === 'n' || side === 's') {
        const x = a[0] + along
        return box([x - o.width / 2 - 0.1, y - 0.08, a[1] + (out > 0 ? 0 : -0.3)], [x + o.width / 2 + 0.1, y, a[1] + (out > 0 ? 0.3 : 0)], 'frame', { solid: false })
      }
      const z = a[1] + along
      return box([a[0] + (out > 0 ? 0 : -0.3), y - 0.08, z - o.width / 2 - 0.1], [a[0] + (out > 0 ? 0.3 : 0), y, z + o.width / 2 + 0.1], 'frame', { solid: false })
    })
}

// Frames round the openings on a wall's outer face: a post either side and a head across the top
function frames(side: Side, a: [number, number], holes: Opening[], y0: number, shift: number, mat: MatKey): Piece[] {
  const t = 0.12
  const outer = side === 'n' || side === 'w' ? -THICK / 2 : THICK / 2
  const out: Piece[] = []
  for (const o of holes) {
    const along = o.at - shift
    const parts: [number, number, number, number][] = [
      [along - o.width / 2 - t, along - o.width / 2, o.bottom, o.top],
      [along + o.width / 2, along + o.width / 2 + t, o.bottom, o.top],
      [along - o.width / 2 - t, along + o.width / 2 + t, o.top, o.top + t],
    ]
    for (const [u0, u1, v0, v1] of parts) {
      if (side === 'n' || side === 's') {
        const z = a[1] + outer
        out.push(box([a[0] + u0, y0 + v0, z - 0.05], [a[0] + u1, y0 + v1, z + 0.05], mat, { solid: false }))
      } else {
        const x = a[0] + outer
        out.push(box([x - 0.05, y0 + v0, a[1] + u0], [x + 0.05, y0 + v1, a[1] + u1], mat, { solid: false }))
      }
    }
  }
  return out
}

// Solid buildings: rows of dark window panes in light frames on every face, floor by floor
function windowPanes(bl: Building, h: number): Piece[] {
  const [x0, z0] = bl.min
  const [x1, z1] = bl.max
  const every = bl.windowsEvery ?? 3
  const out: Piece[] = []
  for (let f = 0; f < bl.floors; f++) {
    const y0 = f * h + 1.05
    const y1 = f * h + 2.35
    const faces: [number, number, number, 'x' | 'z'][] = [
      [x0, x1, z0, 'x'],
      [x0, x1, z1, 'x'],
      [z0, z1, x0, 'z'],
      [z0, z1, x1, 'z'],
    ]
    for (const [u0, u1, w, axis] of faces) {
      const n = Math.floor((u1 - u0) / every)
      const off = (u1 - u0 - n * every) / 2 + every / 2
      const outward = w === z1 || w === x1 ? 1 : -1
      for (let i = 0; i < n; i++) {
        const u = u0 + off + i * every
        const [a, b] = [u - 0.65, u + 0.65]
        const frame = axis === 'x' ? box([a - 0.08, y0 - 0.08, w - 0.06], [b + 0.08, y1 + 0.08, w + 0.06], 'frame', { solid: false }) : box([w - 0.06, y0 - 0.08, a - 0.08], [w + 0.06, y1 + 0.08, b + 0.08], 'frame', { solid: false })
        const pane = axis === 'x' ? box([a, y0, w + outward * 0.06 - 0.03], [b, y1, w + outward * 0.06 + 0.03], 'glass', { solid: false }) : box([w + outward * 0.06 - 0.03, y0, a], [w + outward * 0.06 + 0.03, y1, b], 'glass', { solid: false })
        out.push(frame, pane)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------
// Stairs: steps from `from` (bottom, on the centre line) to `to` (top), straight along x or z, drawn as
// blocks and walked as a smooth slope

export function stairs(from: [number, number], to: [number, number], y0: number, y1: number, width: number, mat: MatKey): { pieces: Piece[]; ramp: Ramp } {
  const alongX = from[1] === to[1]
  const run = alongX ? to[0] - from[0] : to[1] - from[1]
  const n = Math.max(2, Math.round((y1 - y0) / 0.25))
  const step = (y1 - y0) / n
  const tread = run / n
  const pieces: Piece[] = []
  for (let k = 0; k < n; k++) {
    const u0 = k * tread
    const u1 = (k + 1) * tread
    const top = y0 + (k + 1) * step
    const [a, b] = [Math.min(u0, u1), Math.max(u0, u1)]
    pieces.push(
      alongX
        ? box([from[0] + a, y0, from[1] - width / 2], [from[0] + b, top, from[1] + width / 2], mat, { solid: false })
        : box([from[0] - width / 2, y0, from[1] + a], [from[0] + width / 2, top, from[1] + b], mat, { solid: false }),
    )
  }
  // The slope through the middle of each tread
  const len = Math.hypot(run, y1 - y0)
  const angle = Math.atan2(y1 - y0, Math.abs(run))
  const thick = 0.4
  const mid: P3 = alongX ? [(from[0] + to[0]) / 2, (y0 + y1) / 2 + step / 2, from[1]] : [from[0], (y0 + y1) / 2 + step / 2, (from[1] + to[1]) / 2]
  // Turn the slab so its length climbs towards `to`, and push it down by half its thickness under the slope
  const dir = Math.sign(run)
  const rotation: P3 = alongX ? [0, 0, dir * angle] : [-dir * angle, 0, 0]
  const normal = alongX ? new THREE.Vector3(-dir * Math.sin(angle), Math.cos(angle), 0) : new THREE.Vector3(0, Math.cos(angle), -dir * Math.sin(angle))
  const centre = new THREE.Vector3(...mid).addScaledVector(normal, -thick / 2)
  return {
    pieces,
    ramp: {
      centre: centre.toArray() as P3,
      half: alongX ? [len / 2 + 0.1, thick / 2, width / 2] : [width / 2, thick / 2, len / 2 + 0.1],
      rotation,
    },
  }
}

// ---------------------------------------------------------------------------------------------------------
// Set at an angle: pieces (with their stairs' slopes and roofs' hulls) built round (0, 0) in their own frame,
// turned by rotY about the vertical and moved to `at` (the same turn as a piece's own rotY)

const turnQ = new THREE.Quaternion()
const ownQ = new THREE.Quaternion()
const euler = new THREE.Euler()
export function placed({ pieces = [], ramps = [], hulls = [] }: { pieces?: Piece[]; ramps?: Ramp[]; hulls?: Hull[] }, at: [number, number], rotY: number) {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  const move = (x: number, z: number): [number, number] => [at[0] + x * c + z * s, at[1] - x * s + z * c]
  turnQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
  return {
    pieces: pieces.map((p) => {
      const [x, z] = move(p.centre[0], p.centre[2])
      return { ...p, centre: [x, p.centre[1], z] as P3, rotY: (p.rotY ?? 0) + rotY }
    }),
    ramps: ramps.map((r) => {
      const [x, z] = move(r.centre[0], r.centre[2])
      ownQ.setFromEuler(euler.set(...r.rotation))
      euler.setFromQuaternion(ownQ.premultiply(turnQ))
      return { ...r, centre: [x, r.centre[1], z] as P3, rotation: [euler.x, euler.y, euler.z] as P3 }
    }),
    hulls: hulls.map((h) => {
      const points = [...h.points]
      for (let i = 0; i < points.length; i += 3) [points[i], points[i + 2]] = move(points[i], points[i + 2])
      return { ...h, points }
    }),
  }
}
