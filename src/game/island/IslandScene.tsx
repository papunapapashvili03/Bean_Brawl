import { useMemo } from 'react'
import { Sky } from '@react-three/drei'
import { Physics, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { Palms } from './Palms'
import { Bushes, Grass } from './Vegetation'
import { Ocean, Waterfall } from './Water'
import { POOL, RIVER_START_Z, SPAWN, buildTerrainGeometry, mulberry32, terrainHeight } from './terrain'

const SUN: [number, number, number] = [40, 60, 25]

function Terrain() {
  const geometry = useMemo(() => buildTerrainGeometry(), [])
  return (
    <RigidBody type="fixed" colliders="trimesh" friction={1}>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
    </RigidBody>
  )
}

// Boulders ringing the plunge pool and piled at the river's source
function Rocks() {
  const rocks = useMemo(() => {
    const rng = mulberry32(5)
    const spots: { x: number; z: number; size: number }[] = []
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.1 + (i / 8) * 0.8) + rng() * 0.2
      const r = POOL.radius - 0.3
      spots.push({ x: POOL.x + Math.cos(a) * r, z: POOL.z + Math.sin(a) * r, size: 0.7 + rng() * 0.9 })
    }
    for (let i = 0; i < 6; i++) {
      spots.push({ x: (rng() - 0.5) * 10, z: RIVER_START_Z - 1 - rng() * 3, size: 1 + rng() * 1.3 })
    }
    return spots.map((s) => ({
      ...s,
      y: terrainHeight(s.x, s.z) + s.size * 0.3,
      rotation: [rng() * 3, rng() * 3, rng() * 3] as [number, number, number],
    }))
  }, [])

  return (
    <>
      {rocks.map((r, i) => (
        <RigidBody key={i} type="fixed" colliders="hull" position={[r.x, r.y, r.z]} rotation={r.rotation}>
          <mesh castShadow receiveShadow scale={r.size}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#8d877c" flatShading roughness={0.95} />
          </mesh>
        </RigidBody>
      ))}
    </>
  )
}

export function IslandScene() {
  return (
    <>
      <Sky sunPosition={SUN} turbidity={4} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={['#cdeefc', 90, 260]} />
      <hemisphereLight args={['#dff4ff', '#5d8a44', 0.8]} />
      <directionalLight
        position={SUN}
        intensity={2.2}
        color={new THREE.Color('#fff4df')}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-camera-far={200}
        shadow-bias={-0.0005}
      />

      <Physics gravity={[0, -20, 0]} updatePriority={PHYSICS_PRIORITY}>
        <Terrain />
        <Rocks />
        <Palms />
        <Player spawn={SPAWN} />
      </Physics>

      <Grass />
      <Bushes />
      <Waterfall />
      <Ocean />
    </>
  )
}
