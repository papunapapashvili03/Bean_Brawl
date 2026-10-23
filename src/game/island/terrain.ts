import * as THREE from 'three'

export const TERRAIN_SIZE = 150
const SEGMENTS = 190
export const SEA_LEVEL = -1.5

// Layout: a river runs along a plateau in the north and pours off the cliff edge
// into a plunge pool below. The player spawns south of the pool, facing it.
export const PLATEAU_HEIGHT = 21
export const CLIFF_TOP_Z = -31
const CLIFF_BASE_Z = -26
const CHANNEL_DEPTH = 1.6
const CHANNEL_SPREAD = 26 // controls channel width: depth falls off as exp(-x² / spread)
export const RIVER_LEVEL = PLATEAU_HEIGHT - CHANNEL_DEPTH + 0.6
export const RIVER_WIDTH = 9
export const RIVER_START_Z = -54
export const POOL = { x: 0, z: -19, level: 0.9, rim: 1.8, radius: 8.5 }
const SPAWN_XZ = { x: 0, z: 16 }

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
const bump = (x: number, z: number, cx: number, cz: number, r: number) =>
  Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r))

export function terrainHeight(x: number, z: number): number {
  let hills =
    1.4 * Math.sin(x * 0.11) * Math.cos(z * 0.09) +
    0.9 * Math.sin((x + z) * 0.07 + 1.3) +
    0.45 * Math.sin(x * 0.31 + 2) * Math.sin(z * 0.27)
  // Landmark highs and lows
  hills += 6 * bump(x, z, 26, 2, 9) + 4.5 * bump(x, z, -27, 6, 8) + 3 * bump(x, z, 12, 30, 7)
  hills -= 2.2 * bump(x, z, -14, 26, 7)
  let h = 2.4 + hills

  h = lerp(h, 2.4, bump(x, z, SPAWN_XZ.x, SPAWN_XZ.z, 6))
  const poolDist = Math.hypot(x - POOL.x, z - POOL.z)
  h = lerp(h, POOL.rim, smoothstep(POOL.radius + 5, POOL.radius + 1, poolDist))

  // Plateau with a ragged cliff line; kept straight behind the waterfall so the fall stays clean
  const ragged = smoothstep(6, 10, Math.abs(x))
  const cliffShift = ragged * (1.6 * Math.sin(x * 0.45) + 0.8 * Math.sin(x * 1.3 + 1))
  const plateau =
    smoothstep(CLIFF_BASE_Z + cliffShift, CLIFF_TOP_Z + cliffShift, z) * smoothstep(30, 20, Math.abs(x))
  h = lerp(h, PLATEAU_HEIGHT, plateau)
  // Rocky ledges only on the cliff faces, where the plateau mask is mid-transition
  const face = 1 - Math.abs(plateau * 2 - 1)
  h += face * ragged * (1.3 * Math.sin(x * 0.9 + z * 0.4) * Math.cos(z * 1.1) + 0.8 * Math.sin(x * 2.1 - z))
  h -= plateau * CHANNEL_DEPTH * Math.exp(-(x * x) / CHANNEL_SPREAD)

  h -= 3.6 * bump(x, z, POOL.x, POOL.z, 5)

  const d = Math.hypot(x, z * 0.92)
  return lerp(h, -14, smoothstep(50, 64, d))
}

export function terrainSlope(x: number, z: number) {
  const e = 0.5
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  return Math.hypot(dx, dz) / (2 * e)
}

export const SPAWN: [number, number, number] = [
  SPAWN_XZ.x,
  terrainHeight(SPAWN_XZ.x, SPAWN_XZ.z) + 2,
  SPAWN_XZ.z,
]

// Places where vegetation should not grow: water, the river bed, and the spawn point.
export function isClearGround(x: number, z: number, margin = 0) {
  if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.radius + margin) return false
  if (Math.abs(x) < RIVER_WIDTH / 2 + 1 + margin && z < CLIFF_TOP_Z + 2 && z > RIVER_START_Z - 3) return false
  if (Math.hypot(x - SPAWN_XZ.x, z - SPAWN_XZ.z) < 3 + margin) return false
  return true
}

// Deterministic PRNG so the island looks the same on every load
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SAND = new THREE.Color('#f2d59b')
const WET_SAND = new THREE.Color('#c9a66b')
const GRASS = new THREE.Color('#4fa83c')
const GRASS_DARK = new THREE.Color('#3a8c33')
const ROCK = new THREE.Color('#9a8f7e')
const ROCK_DARK = new THREE.Color('#6f665b')
const rock = new THREE.Color()

export function buildTerrainGeometry() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)))
  }
  geo.computeVertexNormals()

  const normals = geo.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const grassMix = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.cos(z * 0.19) * 2)
    c.copy(GRASS).lerp(GRASS_DARK, grassMix)
    c.lerp(SAND, smoothstep(SEA_LEVEL + 2.2, SEA_LEVEL + 1.2, y))
    c.lerp(WET_SAND, smoothstep(SEA_LEVEL + 0.2, SEA_LEVEL - 1.5, y))
    // Horizontal strata on steep faces
    rock.copy(ROCK).lerp(ROCK_DARK, 0.5 + 0.5 * Math.sin(y * 1.6 + Math.sin(x * 0.3) * 0.8))
    c.lerp(rock, smoothstep(0.78, 0.6, normals.getY(i)))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}
