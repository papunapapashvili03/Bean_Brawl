import { useMemo } from 'react'
import { HeightfieldCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { material } from '../maps/textures'
import { COLS, GRID, ROADS, ROWS, SPAN, canyonCut, height, rim, roadY, terrainHeights, type Road } from './ground'

// Dust Bowl Valley's ground (./ground): the walkable terrain with its collider, the mountains beyond (just
// scenery), and the roads laid over it.

const SAND = new THREE.Color('#cfb48a')
const DRY = new THREE.Color('#a8995c')
const ROCK = new THREE.Color('#9b7457')
const RED_ROCK = new THREE.Color('#a8603f')
const FLOOR = new THREE.Color('#dcc69e')

// Fine speckle over the vertex colours, a metre or so across, so the ground doesn't look like plastic
function grainTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.fillStyle = '#e8e3da'
  g.fillRect(0, 0, size, size)
  let s = 11
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < 9000; i++) {
    const v = 175 + rand() * 80
    g.fillStyle = `rgba(${v}, ${v * 0.95}, ${v * 0.88}, 0.5)`
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2)
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(110, 90, 70, ${0.05 + rand() * 0.08})`
    g.beginPath()
    g.arc(rand() * size, rand() * size, 4 + rand() * 18, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

const groundMaterial = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 1 })

// Colour by what the ground is: sand, dry grass in the highlands, rock on anything steep, red rock up the
// mountains, pale sand on the canyon floor
function colourGround(g: THREE.BufferGeometry) {
  g.computeVertexNormals()
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const colours = new Float32Array(p.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const steep = THREE.MathUtils.smoothstep(1 - n.getY(i), 0.18, 0.45)
    const grass = THREE.MathUtils.clamp(0.25 + Math.sin(x * 0.045) * Math.cos(z * 0.05) * 0.35 + THREE.MathUtils.smoothstep(-z, 90, 200) * 0.5, 0, 0.85)
    c.copy(SAND).lerp(DRY, grass)
    if (canyonCut(x, z) > 0.8) c.lerp(FLOOR, 0.7)
    c.lerp(ROCK, steep)
    c.lerp(RED_ROCK, THREE.MathUtils.smoothstep(rim(x, z), 0.95, 1.05) * 0.8 + THREE.MathUtils.smoothstep(y, 30, 90) * 0.2)
    colours.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  // Texture coordinates in metres (the speckle repeats every 4 m)
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / 4
    uv[i * 2 + 1] = p.getZ(i) / 4
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

// A grid of heights as a mesh (x across, z down), points `step` apart over w x d centred on the origin
function gridGeometry(cols: number, rows: number, step: number, heightAt: (i: number, j: number, x: number, z: number) => number) {
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3)
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = -(cols * step) / 2 + i * step
      const z = -(rows * step) / 2 + j * step
      positions.set([x, heightAt(i, j, x, z), z], (i + j * (cols + 1)) * 3)
    }
  }
  const index: number[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = i + j * (cols + 1)
      const b = a + 1
      const c = a + cols + 1
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setIndex(index)
  return g
}

export function Terrain() {
  const ground = useMemo(() => {
    const heights = terrainHeights()
    // The collider wants the heights a column at a time (z fastest)
    const byColumn: number[] = new Array(heights.length)
    for (let i = 0; i <= COLS; i++) for (let j = 0; j <= ROWS; j++) byColumn[j + i * (ROWS + 1)] = heights[i + j * (COLS + 1)]
    const map = grainTexture()
    return {
      byColumn,
      geometry: colourGround(gridGeometry(COLS, ROWS, GRID, (i, j) => heights[i + j * (COLS + 1)])),
      // The mountains beyond, coarser, dipping just under the near terrain where they overlap it
      far: colourGround(
        gridGeometry(150, 150, 16, (_, __, x, z) => {
          const inside = Math.abs(x) < SPAN.x / 2 - 16 && Math.abs(z) < SPAN.z / 2 - 16
          return inside ? height(x, z) - 3 : height(x, z)
        }),
      ),
      material: groundMaterial(map),
    }
  }, [])
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <HeightfieldCollider args={[ROWS, COLS, ground.byColumn, { x: SPAN.x, y: 1, z: SPAN.z }]} />
      </RigidBody>
      <mesh geometry={ground.geometry} material={ground.material} receiveShadow />
      <mesh geometry={ground.far} material={ground.material} />
      <Roads />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Roads: ribbons laid just over the ground (and level across the canyon, where a bridge carries them)

function ribbon(points: [number, number][], width: number) {
  // Even steps along the line
  const pts: [number, number][] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]
    const [bx, bz] = points[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2))
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n])
  }
  pts.push(points[points.length - 1])
  const positions: number[] = []
  const uvs: number[] = []
  let along = 0
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    let dx = next[0] - prev[0]
    let dz = next[1] - prev[1]
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    for (const s of [-1, 1]) {
      const x = pts[i][0] - dz * s * (width / 2)
      const z = pts[i][1] + dx * s * (width / 2)
      positions.push(x, roadY(x, z), z)
      uvs.push(s * (width / 2), along)
    }
  }
  const index: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

// Dashes down the middle of the highway
function dashes(road: Road) {
  const parts: number[] = []
  const pts = road.points
  let d = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    for (let t = 0; t < len; t += 1) {
      if (Math.floor((d + t) / 3) % 2) continue
      const x = ax + ((bx - ax) * t) / len
      const z = az + ((bz - az) * t) / len
      parts.push(x, z, Math.atan2(bx - ax, bz - az))
    }
    d += len
  }
  return parts
}

function Roads() {
  const meshes = useMemo(() => {
    const out = ROADS.map((road: Road) => ({ geometry: ribbon(road.points, road.width), kind: road.kind }))
    const dash = dashes(ROADS[0])
    const g = new THREE.BufferGeometry()
    const pos: number[] = []
    for (let i = 0; i < dash.length; i += 3) {
      const [x, z, a] = [dash[i], dash[i + 1], dash[i + 2]]
      const ux = Math.sin(a) * 0.5
      const uz = Math.cos(a) * 0.5
      const vx = Math.cos(a) * 0.09
      const vz = -Math.sin(a) * 0.09
      const y = roadY(x, z) + 0.02
      pos.push(x - ux - vx, y, z - uz - vz, x + ux - vx, y, z + uz - vz, x + ux + vx, y, z + uz + vz)
      pos.push(x - ux - vx, y, z - uz - vz, x + ux + vx, y, z + uz + vz, x - ux + vx, y, z - uz + vz)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return { roads: out, dashes: g }
  }, [])
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8c547', roughness: 0.8, side: THREE.DoubleSide }), [])
  return (
    <>
      {meshes.roads.map((r, i) => (
        <mesh key={i} geometry={r.geometry} material={material(r.kind === 'highway' ? 'asphalt' : 'gravel')} receiveShadow />
      ))}
      <mesh geometry={meshes.dashes} material={paint} />
    </>
  )
}
