import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { paint } from '../race/materials'
import { SPECTATOR, TOWER } from './course'

// What the tower stands in: a sea of clouds far below, the jagged rock the tower grows out of, a few smaller
// rocks drifting about, and a grassy island off to one side where anyone who falls watches the rest.

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const CLOUD_Y = -20
const PUFFS = 140
const puffGeometry = new THREE.IcosahedronGeometry(1, 2)
const cloudLook = new THREE.MeshLambertMaterial({ color: '#ffffff' })
const seaLook = new THREE.MeshLambertMaterial({ color: '#f3f6fb' })

export function CloudSea() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const rand = seeded(3)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < PUFFS; i++) {
      const a = rand() * Math.PI * 2
      const r = 12 + Math.pow(rand(), 0.7) * 260
      const size = 7 + rand() * 18
      dummy.position.set(Math.sin(a) * r, CLOUD_Y - 2 + rand() * 5, Math.cos(a) * r)
      dummy.scale.set(size * (1 + rand()), size * 0.38, size * (1 + rand() * 0.6))
      dummy.rotation.set(0, rand() * Math.PI, 0)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    }
    mesh.current!.instanceMatrix.needsUpdate = true
  }, [])
  // Drifting slowly round
  useFrame((_, delta) => {
    mesh.current!.rotation.y += delta * 0.004
  })
  return (
    <group>
      <mesh position={[0, CLOUD_Y - 3, 0]} rotation={[-Math.PI / 2, 0, 0]} material={seaLook}>
        <circleGeometry args={[700, 48]} />
      </mesh>
      <instancedMesh ref={mesh} args={[puffGeometry, cloudLook, PUFFS]} frustumCulled={false} />
    </group>
  )
}

// A lathe-turned spike of rock, roughened: top radius `top` at y 0, down to a point `depth` below
function rockGeometry(top: number, depth: number, seed: number) {
  const rand = seeded(seed)
  const profile = [
    [top, 0],
    [top * 1.05, -depth * 0.06],
    [top * 0.95, -depth * 0.2],
    [top * 0.72, -depth * 0.42],
    [top * 0.45, -depth * 0.66],
    [top * 0.18, -depth * 0.88],
    [0.01, -depth],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(profile, 28)
  const p = g.getAttribute('position')
  // The same bump for vertices at the same place (the lathe's seam), so it doesn't split open
  const bumps = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const key = `${Math.round(Math.atan2(x, z) * 100) % 628},${Math.round(y * 10)}`
    let b = bumps.get(key)
    if (b === undefined) {
      b = 1 + (rand() - 0.5) * 0.28
      bumps.set(key, b)
    }
    const k = y > -0.5 ? 1 : b // the rim stays true, to meet the courtyard
    p.setXYZ(i, x * k, y + (y > -0.5 ? 0 : (rand() - 0.5) * 0.8), z * k)
  }
  g.computeVertexNormals()
  return g
}

const rockLook = new THREE.MeshStandardMaterial({ color: '#75685d', roughness: 1, flatShading: true, side: THREE.DoubleSide })

// The tower's rock, and a few smaller ones floating round it
const DRIFTERS = (() => {
  const rand = seeded(17)
  return Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + rand() * 0.4
    const r = 34 + rand() * 40
    const size = 1.5 + rand() * 3.5
    return {
      position: [Math.sin(a) * r, -8 + rand() * 50, Math.cos(a) * r] as [number, number, number],
      size,
      geometry: rockGeometry(size, size * 2.5, 40 + i),
      bob: rand() * Math.PI * 2,
    }
  })
})()

function Rocks() {
  const base = useMemo(() => rockGeometry(TOWER.outer + 0.1, 36, 7), [])
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    group.current!.children.forEach((c, i) => {
      c.position.y = DRIFTERS[i].position[1] + Math.sin(clock.elapsedTime * 0.4 + DRIFTERS[i].bob) * 0.8
    })
  })
  return (
    <>
      <mesh geometry={base} material={rockLook} />
      <group ref={group}>
        {DRIFTERS.map((d, i) => (
          <mesh key={i} geometry={d.geometry} material={rockLook} position={d.position} castShadow />
        ))}
      </group>
    </>
  )
}

// Where the fallen watch from: a grassy island with benches facing the tower
const ISLAND_RADIUS = 6.5
const islandRock = rockGeometry(ISLAND_RADIUS, 9, 23)

// (A physics body: goes inside <Physics>)
export function SpectatorIsland({ at = SPECTATOR }: { at?: [number, number, number] }) {
  const [x, y, z] = at
  const top = y - 1.3 // the grass
  const facing = Math.atan2(-x, -z) // towards the tower
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[x, top, z]}>
        <CylinderCollider args={[0.5, ISLAND_RADIUS]} position={[0, -0.5, 0]} />
        <mesh material={paint('#6fcf5b')} position={[0, -0.25, 0]} receiveShadow>
          <cylinderGeometry args={[ISLAND_RADIUS, ISLAND_RADIUS, 0.5, 40]} />
        </mesh>
      </RigidBody>
      <mesh geometry={islandRock} material={rockLook} position={[x, top - 0.5, z]} />
      <group position={[x, top, z]} rotation={[0, facing, 0]}>
        {[-2.2, 0, 2.2].map((bx) => (
          <group key={bx} position={[bx, 0, 1.5]}>
            <mesh material={paint('#8a5a35')} position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[1.8, 0.12, 0.5]} />
            </mesh>
            {[-0.75, 0.75].map((lx) => (
              <mesh key={lx} material={paint('#5d3b22')} position={[lx, 0.2, 0]}>
                <boxGeometry args={[0.12, 0.4, 0.4]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </>
  )
}

export function Scenery() {
  return (
    <>
      <CloudSea />
      <Rocks />
    </>
  )
}
