import type { GrabEdge } from '../grab'
import { box, buildingPieces, door, placed, stairs, window, type Building, type Hull, type Opening, type P3, type Piece, type Ramp } from '../maps/kit'
import type { MatKey } from '../maps/textures'

// Building blocks for Dust Bowl Valley's places (./sites): everything is made in a place's own frame (its
// middle at the origin, its ground at y = 0, its front towards +z), then turned and set down where it goes.

export type Group = { pieces: Piece[]; ramps: Ramp[]; hulls: Hull[]; holds: GrabEdge[] }
export const group = (): Group => ({ pieces: [], ramps: [], hulls: [], holds: [] })

export function building(g: Group, b: Building) {
  const built = buildingPieces(b)
  g.pieces.push(...built.pieces)
  g.hulls.push(...built.hulls)
}

export function flight(g: Group, from: [number, number], to: [number, number], y0: number, y1: number, width: number, mat: MatKey) {
  const s = stairs(from, to, y0, y1, width, mat)
  g.pieces.push(...s.pieces)
  g.ramps.push(s.ramp)
}

// A box from min to max, solid and climbable unless told otherwise
export const block = (g: Group, min: P3, max: P3, mat: MatKey, extra: Partial<Piece> = {}) => g.pieces.push(box(min, max, mat, extra))

// A crate (or a stack of them)
export function crates(g: Group, x: number, z: number, count = 1, size = 1.1, mat: MatKey = 'wood') {
  for (let k = 0; k < count; k++) block(g, [x - size / 2, k * size, z - size / 2], [x + size / 2, (k + 1) * size, z + size / 2], mat, { grab: true })
}

// A wall (or fence) from a to b, standing at height y0
export function wall(g: Group, a: [number, number], b: [number, number], h: number, thick: number, mat: MatKey, extra: Partial<Piece> = {}, y0 = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  g.pieces.push({
    centre: [(a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2],
    size: [len, h, thick],
    rotY: -Math.atan2(b[1] - a[1], b[0] - a[0]),
    mat,
    ...extra,
  })
}

// A wall round a polygon (closed), leaving out the sides listed in `gaps` (by index)
export function fenceRing(g: Group, points: [number, number][], h: number, mat: MatKey, gaps: number[] = [], grab = false) {
  points.forEach((p, i) => {
    if (gaps.includes(i)) return
    wall(g, p, points[(i + 1) % points.length], h, 0.12, mat, { grab })
  })
}

// An upright cylinder (a tank, a silo, a tower's shaft), as a convex solid you can stand on top of
export function cylinder(g: Group, x: number, z: number, r: number, y0: number, y1: number, mat: MatKey, sides = 16) {
  const points: number[] = []
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2
    for (const y of [y0, y1]) points.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r)
  }
  g.hulls.push({ points, mat })
}

// A cone (a heap of gravel, a roof cap)
export function cone(g: Group, x: number, z: number, r: number, y0: number, y1: number, mat: MatKey, sides = 14) {
  const points: number[] = [x, y1, z]
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2
    points.push(x + Math.cos(a) * r, y0, z + Math.sin(a) * r)
  }
  g.hulls.push({ points, mat })
}

// A dome (half a ball) on a base at height y
export function dome(g: Group, x: number, z: number, r: number, y: number, mat: MatKey) {
  const points: number[] = []
  for (let i = 0; i <= 4; i++) {
    const up = (i / 4) * (Math.PI / 2)
    const ring = Math.cos(up) * r
    const n = i === 4 ? 1 : 16
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      points.push(x + Math.cos(a) * ring, y + Math.sin(up) * r, z + Math.sin(a) * ring)
    }
  }
  g.hulls.push({ points, mat })
}

// A ladder up a face: rungs to see, and a handhold on each to climb by (hop from one to the next). `out` is
// the way the face looks (the climber hangs on that side).
export function ladder(g: Group, x: number, z: number, y0: number, y1: number, out: [number, number]) {
  const [ox, oz] = out
  const along: [number, number] = [-oz, ox]
  for (let y = y0; y <= y1 + 0.01; y += 1.05) {
    g.holds.push({
      kind: 'hold',
      a: { x: x - along[0] * 0.18, y, z: z - along[1] * 0.18 },
      b: { x: x + along[0] * 0.18, y, z: z + along[1] * 0.18 },
      out: { x: ox, z: oz },
    })
    g.pieces.push({ centre: [x + ox * 0.06, y - 0.05, z + oz * 0.06], size: [0.5, 0.06, 0.06], rotY: -Math.atan2(along[1], along[0]), mat: 'darkFrame', solid: false })
  }
  for (const s of [-1, 1]) {
    const px = x + along[0] * 0.27 * s + ox * 0.06
    const pz = z + along[1] * 0.27 * s + oz * 0.06
    g.pieces.push(box([px - 0.04, y0 - 1, pz - 0.04], [px + 0.04, y1 + 0.3, pz + 0.04], 'darkFrame', { solid: false }))
  }
}

// A lookout tower: a square frame with a deck every `rise` metres and a railed platform on top. The stairs
// zig-zag up its north side in two lanes (east-going flights in the outer lane, west-going in the inner),
// meeting at landings at either end. `size` across (7 or more). Returns the top's height.
export function stairTower(g: Group, x: number, z: number, levels: number, rise: number, size: number, mat: MatKey = 'wood', frame: MatKey = 'wood') {
  const h = size / 2
  const top = levels * rise
  const lane = 1.5
  const inner = z - h + 2 * lane // the decks start south of the two lanes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = x + sx * (h - 0.15)
    const pz = z + sz * (h - 0.15)
    block(g, [px - 0.15, 0, pz - 0.15], [px + 0.15, top + 1.1, pz + 0.15], frame)
  }
  const rail = (a: [number, number], b: [number, number], y: number) => wall(g, a, b, 1, 0.1, frame, {}, y)
  for (let k = 1; k <= levels; k++) {
    const y = k * rise
    const eastEnd = (k - 1) % 2 === 0 // where the flight up to here arrives
    const [l0, l1] = eastEnd ? [x + h - 1.2, x + h] : [x - h, x - h + 1.2]
    block(g, [x - h, y - 0.2, inner], [x + h, y, z + h], mat)
    block(g, [l0, y - 0.2, z - h], [l1, y, inner], mat)
    rail([x - h, z + h], [x + h, z + h], y)
    rail([x - h, z - h], [x - h, z + h], y)
    rail([x + h, z - h], [x + h, z + h], y)
    // Rail along a line across the lanes, except over the landing
    const along = (zl: number) => rail(eastEnd ? [x - h, zl] : [l1, zl], eastEnd ? [l0, zl] : [x + h, zl], y)
    if (k === levels) {
      // On top: cover the lane the last flight didn't use, rail round the one it did
      const lastInOuter = eastEnd
      const [c0, c1] = lastInOuter ? [z - h + lane, inner] : [z - h, z - h + lane]
      block(g, [x - h, y - 0.2, c0], [x + h, y, c1], mat)
      if (lastInOuter) {
        along(z - h)
        along(z - h + lane)
      } else {
        rail([x - h, z - h], [x + h, z - h], y)
        along(inner)
      }
    } else {
      along(inner)
    }
  }
  for (let k = 0; k < levels; k++) {
    const east = k % 2 === 0
    const zc = east ? z - h + lane / 2 : z - h + lane * 1.5
    flight(g, [east ? x - h + 1.2 : x + h - 1.2, zc], [east ? x + h - 1.2 : x - h + 1.2, zc], k * rise, (k + 1) * rise, lane - 0.1, mat)
  }
  return top
}

// An open-ended shipping container you can run through (doors open at both ends)
export function container(g: Group, x: number, z: number, rotY: number, mat: MatKey, y = 0) {
  const c = group()
  building(c, { min: [-6, -1.25], max: [6, 1.25], floors: 1, height: 2.6, wall: mat, roof: 'flat', roofMat: 'metal', grabRoof: true, base: y, openings: [{ side: 'w', at: 1.25, width: 2.1, bottom: 0, top: 2.3 }, { side: 'e', at: 1.25, width: 2.1, bottom: 0, top: 2.3 }] })
  inset(g, c, [x, z], rotY)
}

// A tank: a cylinder you can climb (a ladder up its front) and stand on
export function tank(g: Group, x: number, z: number, r: number, h: number, mat: MatKey = 'metal') {
  cylinder(g, x, z, r, 0, h, mat)
  ladder(g, x, z + r + 0.05, 1.3, h - 0.6, [0, 1])
}

// A water tower: a tank on four legs, a deck round it, a ladder up a leg
export function waterTower(g: Group, x: number, z: number) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(g, [x + sx * 2 - 0.2, 0, z + sz * 2 - 0.2], [x + sx * 2 + 0.2, 7, z + sz * 2 + 0.2], 'wood')
  block(g, [x - 2.6, 7, z - 2.6], [x + 2.6, 7.3, z + 2.6], 'deckWood', { grab: true })
  cylinder(g, x, z, 2, 7.3, 11, 'wood')
  cone(g, x, z, 2.3, 11, 12.2, 'shingle')
  ladder(g, x, z + 2.25, 1.3, 6.6, [0, 1])
}

// A small house: rooms on one or two floors (stairs inside), a door front and back, windows round
export function house(g: Group, x: number, z: number, rotY: number, floors: 1 | 2, wall: MatKey, roof: MatKey = 'shingle') {
  const h = group()
  const openings: Opening[] = [door('s', 3, 0, 1.3), door('n', 7, 0, 1.3), window('s', 7.5), window('e', 4), window('w', 4)]
  if (floors === 2) openings.push(window('s', 3, 1), window('s', 7.5, 1), window('n', 5, 1), window('e', 4, 1))
  building(h, {
    min: [-5, -4],
    max: [5, 4],
    floors,
    wall,
    floorMat: 'wood',
    roof: 'pitched',
    roofMat: roof,
    trim: 'trim',
    openings,
    stairwells: floors === 2 ? [{ floor: 1, min: [-4.7, -3.7], max: [0.6, -2.3] }] : [],
  })
  if (floors === 2) flight(h, [-4.4, -3], [0.4, -3], 0, 3.4, 1.3, 'wood')
  inset(g, h, [x, z], rotY)
}

// A boxy little plane parked on the apron: fuselage, low wings, tail
export function plane(g: Group, x: number, z: number, rotY: number) {
  const p = group()
  block(p, [-4.5, 0.9, -0.8], [4.5, 2.5, 0.8], 'paintWhite', { grab: true })
  block(p, [4.5, 1.1, -0.6], [5.5, 2.2, 0.6], 'paintWhite')
  block(p, [-0.6, 1.4, -5.5], [1.2, 1.7, 5.5], 'paintWhite', { grab: true })
  block(p, [-4.4, 2.5, -0.12], [-3.2, 4, 0.12], 'paintRed')
  block(p, [-4.4, 2.3, -2], [-3.4, 2.45, 2], 'paintWhite')
  for (const [wx, wz] of [
    [0.6, -1.6],
    [0.6, 1.6],
    [4, 0],
  ])
    block(p, [wx - 0.25, 0, wz - 0.25], [wx + 0.25, 0.9, wz + 0.25], 'darkFrame')
  inset(g, p, [x, z], rotY)
}

// ---------------------------------------------------------------------------------------------------------
// Moving things about

// `sub` turned by rotY and moved to `at`, added into `g` (same ground level)
export function inset(g: Group, sub: Group, at: [number, number], rotY: number) {
  const p = placed(sub, at, rotY)
  g.pieces.push(...p.pieces)
  g.ramps.push(...p.ramps)
  g.hulls.push(...p.hulls)
  g.holds.push(...sub.holds.map((e) => turnEdge(e, at, rotY, 0)))
}

// A place's group set down in the world: turned by rotY, moved to (x, z), raised to `base`
export function setDown(g: Group, x: number, z: number, base: number, rotY: number): Group {
  const p = placed(g, [x, z], rotY)
  return {
    pieces: p.pieces.map((q) => ({ ...q, centre: [q.centre[0], q.centre[1] + base, q.centre[2]] as P3 })),
    ramps: p.ramps.map((r) => ({ ...r, centre: [r.centre[0], r.centre[1] + base, r.centre[2]] as P3 })),
    hulls: p.hulls.map((h) => ({ ...h, points: h.points.map((v, i) => (i % 3 === 1 ? v + base : v)) })),
    holds: g.holds.map((e) => turnEdge(e, [x, z], rotY, base)),
  }
}

// A point in a place's frame, in the world (the same turn as a piece's rotY)
export function toWorld(x: number, z: number, at: [number, number], rotY: number): [number, number] {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  return [at[0] + x * c + z * s, at[1] - x * s + z * c]
}

function turnEdge(e: GrabEdge, at: [number, number], rotY: number, base: number): GrabEdge {
  const [ax, az] = toWorld(e.a.x, e.a.z, at, rotY)
  const [bx, bz] = toWorld(e.b.x, e.b.z, at, rotY)
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  return {
    ...e,
    a: { x: ax, y: e.a.y + base, z: az },
    b: { x: bx, y: e.b.y + base, z: bz },
    out: { x: e.out.x * c + e.out.z * s, z: -e.out.x * s + e.out.z * c },
  }
}
