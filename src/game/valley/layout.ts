import type { Pick, RackLayout } from '../experimental/guns/GunDisplay'
import type { GrabEdge } from '../grab'
import { box, pieceLedges, stairs, type Hull, type P3, type Piece, type Ramp } from '../maps/kit'
import { setDown, toWorld } from './build'
import { HALF_X, HALF_Z, PLAY_RIM, ROADS, canyonCut, height, rim, roadY } from './ground'
import { MESA, PIT, PLACES, RESERVOIR, type Place } from './places'
import { SITES, type CarSpot, type Feature } from './sites'

// Dust Bowl Valley put together: every place's buildings set down where it goes (turned to face the mesa),
// the mesa's grand staircase and zip lines, bridges where the roads cross the canyon, the unseen wall at the
// foot of the mountains, jump pads, the spawn points, and rocks, cacti and bales scattered for cover.

// Each place faces the mesa, except where the lie of the land says otherwise
const TURN: Record<string, number> = { mesa: 0, dam: 0, gorge: 0, airstrip: 0, ghost: 0.193 }
export const turnOf = (p: Place) => TURN[p.id] ?? Math.atan2(-p.x, -p.z)

const pieces: Piece[] = []
const ramps: Ramp[] = []
const hulls: Hull[] = []
const holds: GrabEdge[] = []
export type WorldCar = CarSpot & { y: number }
export type WorldFeature = Feature & { y: number; yaw: number; turn: number }
const cars: WorldCar[] = []
const features: WorldFeature[] = []
const racks: RackLayout[] = []

const gun = (index: number, x: number) => ({ pick: { gun: index } as Pick, x })

for (const p of PLACES) {
  const site = SITES[p.id]()
  const turn = turnOf(p)
  const world = setDown(site.group, p.x, p.z, p.base, turn)
  pieces.push(...world.pieces)
  ramps.push(...world.ramps)
  hulls.push(...world.hulls)
  holds.push(...world.holds)
  for (const r of site.racks) {
    const [x, z] = toWorld(r.x, r.z, [p.x, p.z], turn)
    racks.push({ x, z, y: p.base + (r.y ?? 0), yaw: r.yaw + turn, items: r.guns.map((g, i) => gun(g, (i - (r.guns.length - 1) / 2) * 1.9)) })
  }
  for (const c of site.cars) {
    const [x, z] = toWorld(c.x, c.z, [p.x, p.z], turn)
    cars.push({ ...c, x, z, y: p.base, yaw: c.yaw + turn })
  }
  for (const f of site.features) {
    const [x, z] = toWorld(f.x, f.z, [p.x, p.z], turn)
    features.push({ ...f, x, z, y: p.base + (f.y ?? 0), yaw: (f.yaw ?? 0) + turn, turn })
  }
}

// ---------------------------------------------------------------------------------------------------------
// The mesa: a grand staircase up its north face, and zip lines from its top out across the valley

const stairFoot = height(0, -64)
pieces.push(box([-3.2, stairFoot - 4, -64], [3.2, stairFoot, -46], 'stone'))
{
  const s = stairs([0, -64], [0, -38], stairFoot, MESA.top, 6, 'stone')
  pieces.push(...s.pieces)
  ramps.push(s.ramp)
}
// Each zip line: from a frame at the mesa's edge, down to a post out in the valley
export type ZipLine = { from: P3; to: P3 }
const ZIP_DROP = 3.1 // the cable runs this high above the ground at both ends
export const ZIPS: ZipLine[] = (
  [
    [6, -33, 16, -88],
    [33, 4, 88, 10],
    [-4, 33, -10, 88],
    [-33, -4, -88, -10],
  ] as const
).map(([x0, z0, x1, z1]) => ({ from: [x0, MESA.top + ZIP_DROP, z0], to: [x1, height(x1, z1) + ZIP_DROP, z1] }))
for (const { from, to } of ZIPS) {
  for (const [p, foot] of [
    [from, MESA.top],
    [to, height(to[0], to[2])],
  ] as const) {
    const dx = to[0] - from[0]
    const dz = to[2] - from[2]
    const len = Math.hypot(dx, dz)
    const [sx, sz] = [-dz / len, dx / len]
    for (const s of [-1, 1]) pieces.push(box([p[0] + sx * 0.9 * s - 0.15, foot - 0.5, p[2] + sz * 0.9 * s - 0.15], [p[0] + sx * 0.9 * s + 0.15, p[1] + 0.4, p[2] + sz * 0.9 * s + 0.15], 'darkFrame'))
    pieces.push({ centre: [p[0], p[1] + 0.45, p[2]], size: [2.1, 0.18, 0.18], rotY: -Math.atan2(sz, sx), mat: 'darkFrame', solid: false })
  }
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const len = Math.hypot(dx, dz)
  holds.push({ kind: 'zip', a: { x: from[0], y: from[1], z: from[2] }, b: { x: to[0], y: to[1], z: to[2] }, out: { x: -dz / len, z: dx / len } })
}

// ---------------------------------------------------------------------------------------------------------
// Bridges carrying the roads over the canyon: a deck under the road wherever the ground falls away, rails
// along both sides, piers down to the floor

for (const road of ROADS) {
  const pts = road.points
  let sinceSupport = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.ceil(len / 1.5)
    const rotY = -Math.atan2(bz - az, bx - ax)
    const [sx, sz] = [-(bz - az) / len, (bx - ax) / len]
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * (k + 0.5)) / n
      const z = az + ((bz - az) * (k + 0.5)) / n
      if (canyonCut(x, z) < 0.35) {
        sinceSupport = 0
        continue
      }
      const y = roadY(x, z) - 0.05
      const step = len / n + 0.1
      pieces.push({ centre: [x, y - 0.3, z], size: [step, 0.6, road.width + 1.2], rotY, mat: 'concrete' })
      for (const s of [-1, 1]) pieces.push({ centre: [x + sx * s * (road.width / 2 + 0.45), y + 0.5, z + sz * s * (road.width / 2 + 0.45)], size: [step, 1, 0.3], rotY, mat: 'concreteDark', grab: true })
      sinceSupport += step
      if (sinceSupport > 8) {
        sinceSupport = 0
        const floor = height(x, z)
        pieces.push({ centre: [x, (floor + y - 0.6) / 2, z], size: [1.2, y - 0.6 - floor + 0.5, road.width - 1], rotY, mat: 'concreteDark' })
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// The unseen wall round the valley, at the foot of the mountains (too steep to climb anyway)

{
  const n = 120
  const at = (i: number): [number, number] => {
    const a = (i / n) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const k = PLAY_RIM + 0.03
    return [HALF_X * k * Math.sign(c) * Math.sqrt(Math.abs(c)), HALF_Z * k * Math.sign(s) * Math.sqrt(Math.abs(s))]
  }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = at(i)
    const [x1, z1] = at(i + 1)
    const len = Math.hypot(x1 - x0, z1 - z0)
    pieces.push({ centre: [(x0 + x1) / 2, 60, (z0 + z1) / 2], size: [len + 1, 160, 1], rotY: -Math.atan2(z1 - z0, x1 - x0), mat: 'stone', hidden: true })
  }
}

// ---------------------------------------------------------------------------------------------------------
// Jump pads: up onto the mesa from its foot (steer in towards the top as you rise), out of the quarry pit

export type JumpPad = { x: number; y: number; z: number; launch: number }
export const PADS: JumpPad[] = [
  { x: 47.5, y: height(47.5, 0), z: 0, launch: 30 },
  { x: -47.5, y: height(-47.5, 0), z: 0, launch: 30 },
  { x: 0, y: height(0, 47.5), z: 47.5, launch: 30 },
  { x: PIT.x + 3, y: height(PIT.x + 3, PIT.z + 3), z: PIT.z + 3, launch: 22 },
]

// ---------------------------------------------------------------------------------------------------------
// Spawn points: spread over the open valley, clear of the places, the canyon, the roads and each other

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
function roadDistance(x: number, z: number) {
  let best = Infinity
  for (const road of ROADS) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i]
      const [bx, bz] = road.points[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - road.width / 2)
    }
  }
  return best
}
// Distance from the edge of the nearest place's flat ground (negative inside it)
function placeDistance(x: number, z: number) {
  let best = Infinity
  for (const p of PLACES) {
    const r = p.id === 'mesa' ? MESA.footR + 6 : p.id === 'gorge' ? 30 : p.r
    const d = p.to
      ? (() => {
          const dx = p.to[0] - p.x
          const dz = p.to[1] - p.z
          const t = Math.min(1, Math.max(0, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz)))
          return Math.hypot(x - p.x - dx * t, z - p.z - dz * t)
        })()
      : Math.hypot(x - p.x, z - p.z)
    best = Math.min(best, d - r)
  }
  return best
}
const flatEnough = (x: number, z: number) => Math.abs(height(x + 1.5, z) - height(x - 1.5, z)) < 1.2 && Math.abs(height(x, z + 1.5) - height(x, z - 1.5)) < 1.2
const inPlay = (x: number, z: number, margin = 0.04) => rim(x, z) < PLAY_RIM - margin

const spawnPoints: P3[] = []
{
  const rand = seeded(2024)
  for (let tries = 0; tries < 6000 && spawnPoints.length < 60; tries++) {
    const x = (rand() * 2 - 1) * HALF_X
    const z = (rand() * 2 - 1) * HALF_Z
    if (!inPlay(x, z, 0.05) || canyonCut(x, z) > 0.2 || roadDistance(x, z) < 4 || placeDistance(x, z) < 6 || !flatEnough(x, z)) continue
    if (Math.hypot(x - RESERVOIR.x, z - RESERVOIR.z) < RESERVOIR.r + 6) continue
    if (spawnPoints.some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < 30)) continue
    spawnPoints.push([x, height(x, z) + 1.3, z])
  }
}
export const SPAWNS = spawnPoints

// ---------------------------------------------------------------------------------------------------------
// Cover strewn over the open ground: rocks everywhere (boulders in the canyon), cacti and drums on the flats,
// hay bales round the farm and the ranch, shrubs up in the highlands

export type ScatterKind = 'rock' | 'cactus' | 'bale' | 'drum' | 'shrub'
export type Scatter = { kind: ScatterKind; x: number; y: number; z: number; yaw: number; scale: number }
const scatter: Scatter[] = []
{
  const rand = seeded(77)
  const STEP = 14
  for (let gz = -HALF_Z; gz <= HALF_Z; gz += STEP) {
    for (let gx = -HALF_X; gx <= HALF_X; gx += STEP) {
      const x = gx + (rand() - 0.5) * STEP * 0.8
      const z = gz + (rand() - 0.5) * STEP * 0.8
      const pick = rand()
      if (!inPlay(x, z) || roadDistance(x, z) < 3 || placeDistance(x, z) < 2) continue
      if (Math.hypot(x - RESERVOIR.x, z - RESERVOIR.z) < RESERVOIR.r + 3) continue
      if (spawnPoints.some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < 3)) continue
      if (PADS.some((p) => Math.hypot(p.x - x, p.z - z) < 4) || Math.hypot(x, z + 55) < 12) continue
      const inCanyon = canyonCut(x, z) > 1
      const highlands = z < -110
      const nearFields = Math.hypot(x + 132, z) < 70 || Math.hypot(x + 160, z + 140) < 60
      let kind: ScatterKind
      if (inCanyon) kind = 'rock'
      else if (highlands) kind = pick < 0.55 ? 'rock' : 'shrub'
      else if (nearFields && pick < 0.5) kind = 'bale'
      else kind = pick < 0.42 ? 'cactus' : pick < 0.82 ? 'rock' : 'drum'
      const scale = kind === 'rock' ? 0.8 + rand() * 1.6 : 0.85 + rand() * 0.4
      scatter.push({ kind, x, y: height(x, z), z, yaw: rand() * Math.PI * 2, scale })
    }
  }
}
export const SCATTER = scatter

// ---------------------------------------------------------------------------------------------------------

export const PIECES = pieces
export const RAMPS = ramps
export const HULLS = hulls
export const EDGES: GrabEdge[] = [...pieces.filter((p) => p.grab).flatMap(pieceLedges), ...holds]
export const RACKS = racks
export const CARS = cars
export const FEATURES = features

