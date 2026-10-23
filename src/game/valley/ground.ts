import { GORGE_CAMPS, MESA, PIT, PLACES, RESERVOIR } from './places'

// Dust Bowl Valley's ground: a broad valley floor that rolls gently, rising to highlands in the north and to a
// ring of mountains all round (too steep to climb). The mesa stands in the middle; a dry canyon winds in from
// the north-east, deepening into a gorge, then curls round the south of the mesa and out to the west. Every
// place is levelled; the quarry is a pit.

export const HALF_X = 295 // the mountains' foot (the valley's superellipse rim)
export const HALF_Z = 270
export const PLAY_RIM = 0.93 // beyond this, the mountains climb (and an unseen wall stops you)

// The terrain mesh and its collider: a grid of heights GRID metres apart over SPAN
export const GRID = 2
export const SPAN = { x: 640, z: 590 }
export const COLS = SPAN.x / GRID // cells across
export const ROWS = SPAN.z / GRID

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Layered sines: plenty for gentle ground
const noise = (x: number, z: number) =>
  Math.sin(x * 0.031 + 1.7) * Math.cos(z * 0.027 + 0.3) + 0.5 * Math.sin(x * 0.067 + z * 0.051 + 2.2) + 0.25 * Math.sin(x * 0.13 - z * 0.11 + 0.4)

// 0 in the middle of the valley, 1 at the mountains' foot
export const rim = (x: number, z: number) => Math.pow((Math.abs(x) / HALF_X) ** 4 + (Math.abs(z) / HALF_Z) ** 4, 0.25)

// ---------------------------------------------------------------------------------------------------------
// The canyon: a line of points, each with its half-width and depth

type CanyonPoint = { x: number; z: number; w: number; d: number }
export const CANYON: CanyonPoint[] = [
  { x: 252, z: -222, w: 14, d: 6 },
  { x: 222, z: -110, w: 12, d: 10 },
  { x: 215, z: -40, w: 9, d: 20 }, // the gorge, under the rope bridge
  { x: 178, z: 22, w: 12, d: 10 },
  { x: 111, z: 48, w: 13, d: 7 },
  { x: 60, z: 54, w: 13, d: 6 },
  { x: 0, z: 74, w: 13, d: 6 },
  { x: -60, z: 54, w: 13, d: 6 },
  { x: -111, z: 48, w: 13, d: 7 },
  { x: -160, z: 86, w: 13, d: 7 },
  { x: -210, z: 102, w: 13, d: 6 },
  { x: -300, z: 112, w: 14, d: 6 },
]

// How far (x, z) is from the canyon's middle line, and the half-width and depth there
export function canyonAt(x: number, z: number) {
  let best = Infinity
  let w = 13
  let d = 6
  for (let i = 0; i < CANYON.length - 1; i++) {
    const a = CANYON[i]
    const b = CANYON[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
    const dist = Math.hypot(x - a.x - dx * t, z - a.z - dz * t)
    if (dist < best) {
      best = dist
      w = lerp(a.w, b.w, t)
      d = lerp(a.d, b.d, t)
    }
  }
  return { dist: best, w, d }
}

// How deep the canyon cuts at (x, z): a flat sandy floor, walls sloping up to the rim (the gorge's are sheer)
export function canyonCut(x: number, z: number) {
  const { dist, w, d } = canyonAt(x, z)
  if (dist >= w) return 0
  return d * (1 - smoothstep(0.28 * w, w, dist))
}

// ---------------------------------------------------------------------------------------------------------
// Heights

// Everything but the canyon and the quarry pit (the level a bridge crosses at)
export function baseHeight(x: number, z: number) {
  const r = rim(x, z)
  let h = 1.1 * noise(x, z) + 0.45 * noise(z * 1.7 + 30, x * 1.7)
  // Highlands to the north
  h += smoothstep(-90, -210, z) * (11 + 3 * noise(x * 0.6, z * 0.6))
  // The mountains: a steep climb from the rim, then on up
  h += smoothstep(PLAY_RIM - 0.02, 1, r) * 38 + Math.max(0, r - 1) * 420 + Math.max(0, r - 0.97) * 20 * (1 + noise(x * 0.4, z * 0.4))
  h = Math.min(h, 140 + 50 * Math.sin(x * 0.006 + 1) * Math.cos(z * 0.007)) // the peaks level off far out
  // The mesa: sheer cliffs up to a flat top
  const dm = Math.hypot(x - MESA.x, z - MESA.z)
  h = lerp(h, MESA.top, 1 - smoothstep(MESA.topR, MESA.footR, dm))
  // Level ground for every place
  for (const p of PLACES) {
    if (p.r <= 0) continue
    const d = p.to ? segmentDistance(x, z, p.x, p.z, p.to[0], p.to[1]) : Math.hypot(x - p.x, z - p.z)
    h = lerp(h, p.base, 1 - smoothstep(p.r, p.r + 14, d))
  }
  for (const c of GORGE_CAMPS) h = lerp(h, 0, 1 - smoothstep(c.r, c.r + 8, Math.hypot(x - c.x, z - c.z)))
  h = lerp(h, RESERVOIR.floor, 1 - smoothstep(RESERVOIR.r, RESERVOIR.r + 10, Math.hypot(x - RESERVOIR.x, z - RESERVOIR.z)))
  return h
}

// Roads lie just over the ground, and level across the canyon (where a bridge carries them)
export const roadY = (x: number, z: number) => baseHeight(x, z) + 0.12

export function height(x: number, z: number) {
  const pit = PIT.depth * (1 - smoothstep(6, PIT.r, Math.hypot(x - PIT.x, z - PIT.z)))
  return baseHeight(x, z) - canyonCut(x, z) - pit
}

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - ax - dx * t, z - az - dz * t)
}

// The heights for the terrain's collider and mesh: (COLS + 1) x (ROWS + 1) points, x fastest
export function terrainHeights() {
  const out = new Float32Array((COLS + 1) * (ROWS + 1))
  for (let j = 0; j <= ROWS; j++) {
    const z = -SPAN.z / 2 + j * GRID
    for (let i = 0; i <= COLS; i++) out[i + j * (COLS + 1)] = height(-SPAN.x / 2 + i * GRID, z)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------
// Roads: the highway round the mesa, and dirt tracks out to the far places

export type Road = { points: [number, number][]; width: number; kind: 'highway' | 'track' }

const RING = 100
const ring: [number, number][] = Array.from({ length: 73 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2
  return [Math.sin(a) * RING, -Math.cos(a) * RING]
})
// A track from the ring (at the angle of `to`) out to it
const track = (to: [number, number], end: [number, number] = to): Road => {
  const a = Math.atan2(to[0], -to[1])
  return { points: [[Math.sin(a) * RING, -Math.cos(a) * RING], end], width: 6, kind: 'track' }
}
export const ROADS: Road[] = [
  { points: ring, width: 9, kind: 'highway' },
  { points: [[0, -RING], [0, -66]], width: 6, kind: 'track' }, // up to the mesa's steps
  track([85, -182], [85, -160]),
  track([200, -40], [196, -40]),
  track([205, 78], [180, 76]),
  track([88, 185], [88, 160]),
  track([-88, 185], [-88, 156]),
  track([-222, -10], [-206, -10]),
  track([-160, -140], [-142, -124]),
  track([-85, -185], [-80, -163]),
]
