import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SEA_LEVEL, isClearGround, mulberry32, terrainHeight, terrainSlope } from './terrain'

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

// A clump of five curved, tapered blades. Normals point up so the grass is lit evenly from any angle.
function buildGrassClump() {
  const positions: number[] = []
  const shade: number[] = []
  const rng = mulberry32(3)
  for (let b = 0; b < 5; b++) {
    const angle = (b / 5) * Math.PI * 2 + rng()
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const height = 0.6 + rng() * 0.5
    const lean = 0.25 + rng() * 0.35
    const width = 0.08
    const levels = 4
    const point = (s: number, offset: number) =>
      dir
        .clone()
        .multiplyScalar(lean * s * s + 0.06)
        .add(new THREE.Vector3(0, s * height, 0))
        .addScaledVector(side, offset * width * (1 - s))
    for (let k = 0; k < levels; k++) {
      const s0 = k / levels
      const s1 = (k + 1) / levels
      const l0 = point(s0, -1)
      const r0 = point(s0, 1)
      const l1 = point(s1, -1)
      const r1 = point(s1, 1)
      positions.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z)
      shade.push(s0, s0, s1)
      if (k < levels - 1) {
        positions.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, l1.x, l1.y, l1.z)
        shade.push(s0, s1, s1)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const colors = shade.flatMap((s) => {
    // Darker roots blend into the ground; tips go brighter than the ground so blades stand out
    const v = 0.62 + 0.6 * s
    return [v, v, v]
  })
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  return geo
}

// Wind clock shared by the grass shader, advanced once per frame by <Grass>
const windTime = { value: 0 }

function createGrassMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = instanceMatrix[3].xyz;
        float gust = sin(uTime * 1.7 + root.x * 0.35 + root.z * 0.2) * 0.6 + sin(uTime * 3.1 + root.z * 0.5) * 0.25;
        transformed.xz += vec2(0.18, 0.1) * gust * position.y * position.y;`,
      )
  }
  return mat
}

const GRASS_COLORS = ['#8fd63f', '#a5e04d', '#76c83a', '#b8e85a', '#6cbf35']

export function Grass({ count = 7000 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => buildGrassClump(), [])
  const material = useMemo(() => createGrassMaterial(), [])

  useLayoutEffect(() => {
    const mesh = ref.current!
    const rng = mulberry32(11)
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 6; tries++) {
      const x = (rng() - 0.5) * 120
      const z = (rng() - 0.5) * 120
      const y = terrainHeight(x, z)
      if (y < SEA_LEVEL + 1.3 || terrainSlope(x, z) > 0.55 || !isClearGround(x, z)) continue
      dummy.position.set(x, y - 0.05, z)
      dummy.rotation.set(0, rng() * Math.PI * 2, 0)
      dummy.scale.setScalar(0.7 + rng() * 0.7)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
      mesh.setColorAt(placed, tmpColor.set(GRASS_COLORS[Math.floor(rng() * GRASS_COLORS.length)]))
      placed++
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [count])

  useFrame((state) => {
    windTime.value = state.clock.elapsedTime
  })

  return <instancedMesh ref={ref} args={[geometry, material, count]} receiveShadow frustumCulled={false} />
}

const LEAF_COLORS = ['#2f8f3a', '#3aa04a', '#277a33', '#4cb050', '#1f6b2c']
const FLOWER_COLORS = ['#ff4f7a', '#ff7a3d', '#ffd23f', '#ff5ec4', '#ffffff']

export function Bushes({ count = 55 }: { count?: number }) {
  const leaves = useRef<THREE.InstancedMesh>(null)
  const flowers = useRef<THREE.InstancedMesh>(null)
  const maxBlobs = count * 5
  const maxFlowers = count * 6

  useLayoutEffect(() => {
    const rng = mulberry32(21)
    let blobs = 0
    let blooms = 0
    let bushes = 0
    for (let tries = 0; bushes < count && tries < count * 40; tries++) {
      const x = (rng() - 0.5) * 115
      const z = (rng() - 0.5) * 115
      const y = terrainHeight(x, z)
      if (y < SEA_LEVEL + 1 || terrainSlope(x, z) > 0.6 || !isClearGround(x, z, 1)) continue
      bushes++
      const size = 0.7 + rng() * 0.7
      const parts = 3 + Math.floor(rng() * 3)
      for (let p = 0; p < parts; p++) {
        const a = rng() * Math.PI * 2
        const r = rng() * size * 0.8
        const s = size * (0.55 + rng() * 0.45)
        const bx = x + Math.cos(a) * r
        const bz = z + Math.sin(a) * r
        dummy.position.set(bx, y + s * 0.55, bz)
        dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3)
        dummy.scale.set(s, s * (0.75 + rng() * 0.3), s)
        dummy.updateMatrix()
        leaves.current!.setMatrixAt(blobs, dummy.matrix)
        leaves.current!.setColorAt(blobs, tmpColor.set(LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)]))
        blobs++
      }
      if (rng() < 0.65) {
        const bloom = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)]
        const n = 3 + Math.floor(rng() * 4)
        for (let f = 0; f < n; f++) {
          const a = rng() * Math.PI * 2
          const up = 0.3 + rng() * 0.6
          const dir = new THREE.Vector3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize()
          dummy.position.set(x, y + size * 0.55, z).addScaledVector(dir, size * 0.95)
          dummy.rotation.set(rng() * 3, rng() * 3, 0)
          dummy.scale.setScalar(0.14 + rng() * 0.08)
          dummy.updateMatrix()
          flowers.current!.setMatrixAt(blooms, dummy.matrix)
          flowers.current!.setColorAt(blooms, tmpColor.set(bloom))
          blooms++
        }
      }
    }
    for (const [mesh, n] of [
      [leaves.current!, blobs],
      [flowers.current!, blooms],
    ] as const) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [count])

  return (
    <>
      <instancedMesh ref={leaves} args={[undefined, undefined, maxBlobs]} castShadow receiveShadow frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[undefined, undefined, maxFlowers]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading roughness={0.6} />
      </instancedMesh>
    </>
  )
}
