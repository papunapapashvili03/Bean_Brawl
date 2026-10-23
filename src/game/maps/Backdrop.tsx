import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
// Around a gunfight map's walls: rolling hills rising to mountains, dotted with trees and palms and a few
// distant houses, and a phone mast on the skyline. Just scenery: nothing out here can be reached. `inside`
// says what's within the walls (kept clear); `dry` turns the green hills to scrubby desert.

type Look = { inside: (x: number, z: number) => boolean; dry?: boolean; trees?: number; palms?: number }

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// Smooth-ish noise from a few layered sines (plenty for distant hills)
const noise = (x: number, z: number) =>
  Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 + 0.4) +
  0.5 * Math.sin(x * 0.047 + z * 0.031 + 2.1) +
  0.25 * Math.sin(x * 0.11 - z * 0.09 + 0.7)

// Ground height outside the compound: level near the walls, hills further out, mountains on the horizon
function terrainHeight(x: number, z: number) {
  const r = Math.hypot(x * 0.9, z)
  const hills = THREE.MathUtils.smoothstep(r, 60, 150) * (12 + noise(x, z) * 9)
  const mountains = THREE.MathUtils.smoothstep(r, 220, 380) * (70 + noise(x * 0.6, z * 0.6) * 45)
  return hills + mountains - 0.05
}

function Terrain({ dry }: { dry: boolean }) {
  const geometry = useMemo(() => {
    const size = 900
    const g = new THREE.PlaneGeometry(size, size, 150, 150).rotateX(-Math.PI / 2)
    const p = g.getAttribute('position')
    const colours = new Float32Array(p.count * 3)
    const grass = new THREE.Color(dry ? '#a38f66' : '#5e6f3c')
    const scrub = new THREE.Color(dry ? '#c2ab7e' : '#8a7d5a')
    const rock = new THREE.Color('#7b7870')
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      const y = terrainHeight(x, z)
      p.setY(i, y)
      c.copy(grass).lerp(scrub, THREE.MathUtils.clamp(0.4 + noise(x * 2, z * 2) * 0.35, 0, 1))
      c.lerp(rock, THREE.MathUtils.smoothstep(y, 25, 70))
      colours.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    g.computeVertexNormals()
    return g
  }, [dry])
  return (
    <mesh geometry={geometry} position={[0, -0.02, 0]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}

// Trees and palms scattered over the hills (not inside the walls)
function Forest({ inside, trees: TREE_COUNT = 220, palms: PALM_COUNT = 40 }: Look) {
  const trees = useRef<THREE.InstancedMesh>(null)
  const trunks = useRef<THREE.InstancedMesh>(null)
  const palms = useRef<THREE.InstancedMesh>(null)
  const shapes = useMemo(() => {
    const crown = new THREE.IcosahedronGeometry(1, 1)
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0)
    const palm = mergeGeometries([
      new THREE.CylinderGeometry(0.12, 0.18, 7, 6).translate(0, 3.5, 0).toNonIndexed(),
      ...Array.from({ length: 7 }, (_, i) => new THREE.ConeGeometry(0.35, 3, 4).rotateZ(Math.PI / 2 + 0.5).translate(1.4, 6.8, 0).rotateY((i / 7) * Math.PI * 2).toNonIndexed()),
    ])!
    return { crown, trunk, palm }
  }, [])
  useLayoutEffect(() => {
    const rand = seeded(41)
    const m = new THREE.Object3D()
    let n = 0
    while (n < TREE_COUNT) {
      const a = rand() * Math.PI * 2
      const r = 50 + Math.pow(rand(), 0.8) * 220
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (inside(x, z)) continue
      const y = terrainHeight(x, z)
      const s = 1.8 + rand() * 2.2
      m.position.set(x, y + s * 1.6, z)
      m.scale.set(s * 1.2, s * (1 + rand() * 0.5), s * 1.2)
      m.rotation.set(0, rand() * 6, 0)
      m.updateMatrix()
      trees.current!.setMatrixAt(n, m.matrix)
      m.position.set(x, y, z)
      m.scale.set(s * 0.8, s * 1.8, s * 0.8)
      m.updateMatrix()
      trunks.current!.setMatrixAt(n, m.matrix)
      n++
    }
    let k = 0
    while (k < PALM_COUNT) {
      const a = rand() * Math.PI * 2
      const r = 46 + rand() * 60
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (inside(x, z)) continue
      m.position.set(x, terrainHeight(x, z), z)
      const s = 0.9 + rand() * 0.4
      m.scale.set(s, s, s)
      m.rotation.set((rand() - 0.5) * 0.15, rand() * 6, (rand() - 0.5) * 0.15)
      m.updateMatrix()
      palms.current!.setMatrixAt(k, m.matrix)
      k++
    }
    for (const mesh of [trees, trunks, palms]) mesh.current!.instanceMatrix.needsUpdate = true
  }, [inside, TREE_COUNT, PALM_COUNT])
  return (
    <>
      <instancedMesh ref={trees} args={[shapes.crown, undefined, TREE_COUNT]} frustumCulled={false}>
        <meshStandardMaterial color="#3d5429" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[shapes.trunk, undefined, TREE_COUNT]} frustumCulled={false}>
        <meshStandardMaterial color="#5b4a3a" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={palms} args={[shapes.palm, undefined, PALM_COUNT]} frustumCulled={false}>
        <meshStandardMaterial color="#5a6b3a" roughness={1} />
      </instancedMesh>
    </>
  )
}

// A few houses out on the hills: white walls, dark pitched roofs
function DistantHouses() {
  const houses = useMemo(() => {
    const rand = seeded(9)
    return Array.from({ length: 14 }, () => {
      const a = rand() * Math.PI * 2
      const r = 70 + rand() * 90
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      return { x, z, y: terrainHeight(x, z), w: 6 + rand() * 6, d: 5 + rand() * 4, h: 3 + rand() * 4, turn: rand() * Math.PI }
    })
  }, [])
  return (
    <>
      {houses.map((h, i) => (
        <group key={i} position={[h.x, h.y, h.z]} rotation={[0, h.turn, 0]}>
          <mesh position={[0, h.h / 2, 0]}>
            <boxGeometry args={[h.w, h.h, h.d]} />
            <meshStandardMaterial color="#d8d2c6" roughness={1} />
          </mesh>
          <mesh position={[0, h.h + 1, 0]} rotation={[0, 0, 0]} scale={[h.w / 2 + 0.3, 1, h.d / 2 + 0.3]}>
            <coneGeometry args={[1.42, 2, 4, 1]} />
            <meshStandardMaterial color="#4a403a" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// A lattice phone mast with its panels near the top
function Mast() {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const h = 42
    const legs = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]
    for (const [x, z] of legs) parts.push(new THREE.CylinderGeometry(0.1, 0.1, h, 5).translate(x * 0.9, h / 2, z * 0.9))
    for (let y = 2; y < h; y += 2.5) {
      for (let k = 0; k < 4; k++) {
        const [x0, z0] = legs[k]
        const [x1, z1] = legs[(k + 1) % 4]
        const g = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4).rotateZ(Math.PI / 2 - 0.5)
        const angle = Math.atan2(z1 - z0, x1 - x0)
        parts.push(g.rotateY(-angle).translate(((x0 + x1) / 2) * 0.9, y, ((z0 + z1) / 2) * 0.9))
      }
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      parts.push(new THREE.BoxGeometry(0.4, 2.2, 0.15).translate(Math.cos(a) * 1.4, h - 3, Math.sin(a) * 1.4))
      parts.push(new THREE.BoxGeometry(0.4, 1.6, 0.15).translate(Math.cos(a + 0.5) * 1.3, h - 7, Math.sin(a + 0.5) * 1.3))
    }
    return mergeGeometries(parts.map((p) => p.toNonIndexed()))!
  }, [])
  const x = 75
  const z = -95
  return (
    <mesh geometry={geometry} position={[x, terrainHeight(x, z), z]}>
      <meshStandardMaterial color="#6f9aa0" roughness={0.7} metalness={0.3} />
    </mesh>
  )
}

export function Backdrop(look: Look) {
  return (
    <group>
      <Terrain dry={!!look.dry} />
      <Forest {...look} />
      <DistantHouses />
      <Mast />
    </group>
  )
}
