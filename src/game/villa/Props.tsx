import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CarBody } from '../cars/Car'
import { buildCaravan } from '../cars/caravan'
import { buildFiesta } from '../cars/fiesta'
import { buildJetta } from '../cars/jetta'
import { CAR_SCALE } from '../cars/kit'
import { buildMustang } from '../cars/mustang'
import { buildYugo } from '../cars/yugo'
import { FOUNTAIN, GATE, HEDGES, LAMPS, PALMS, PARKED, POLES, POOL, SOLAR, SPAWNS, STATUE, TEAM_COLOURS, TREES } from './layout'
import { material } from '../maps/textures'
import { Hedges, Lamps, Palms, PowerLines, StartMarks, Trees } from '../maps/Scenery'

// Hillside's props: the court's fountain with its rust-red spiral, a bronze statue, palms and trees, lamp posts,
// power lines, flowering hedges, parked cars, the reflecting pool's water, the gateway's arch, solar panels,
// and each team's painted start marks.

const bronze = new THREE.MeshStandardMaterial({ color: '#566353', roughness: 0.55, metalness: 0.5 })
const solarLook = new THREE.MeshStandardMaterial({ color: '#1f2d4a', roughness: 0.25, metalness: 0.5 })

// ---------------------------------------------------------------------------------------------------------
// The fountain: a panelled concrete drum with a rust-red spiral of steel ribbons rising from it

function Fountain() {
  const [cx, cz] = FOUNTAIN.centre
  const { radius, height } = FOUNTAIN
  const ribbons = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    // Curved steel plates winding up and in: each one smaller, higher and turned on from the last
    for (let k = 0; k < 8; k++) {
      const r = 1.75 - k * 0.19
      const g = new THREE.CylinderGeometry(r, r, 0.8, 32, 1, true, k * 0.95, Math.PI * 1.1).translate(0, 0.42 + k * 0.52, 0)
      parts.push(g)
    }
    return mergeGeometries(parts)!
  }, [])
  const grooves = useMemo(
    () =>
      mergeGeometries(
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return new THREE.BoxGeometry(0.06, height - 0.1, 0.08).rotateY(-a).translate(Math.cos(a) * (radius + 0.02), height / 2, Math.sin(a) * (radius + 0.02))
        }),
      )!,
    [radius, height],
  )
  const sculpture = useMemo(() => {
    const m = material('redSteel').clone()
    m.side = THREE.DoubleSide
    return m
  }, [])
  return (
    <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
      <CylinderCollider args={[height / 2, radius + 0.05]} position={[0, height / 2, 0]} />
      <CylinderCollider args={[2.1, 0.9]} position={[0, height + 2.1, 0]} />
      <mesh material={material('concrete')} position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.1, height, 36]} />
      </mesh>
      <mesh geometry={grooves} material={material('concreteDark')} />
      <mesh material={material('stone')} position={[0, height + 0.06, 0]} receiveShadow>
        <cylinderGeometry args={[radius - 0.2, radius - 0.2, 0.12, 36]} />
      </mesh>
      <mesh geometry={ribbons} material={sculpture} position={[0, height, 0]} castShadow />
    </RigidBody>
  )
}

// A bronze figure on a stone pedestal
function Statue() {
  const [x, z] = STATUE
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CylinderCollider args={[1.3, 1.4]} position={[0, 1.3, 0]} />
      <mesh material={material('stone')} position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.5, 24]} />
      </mesh>
      <mesh material={material('stone')} position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.8, 1, 1.8, 16]} />
      </mesh>
      <group position={[0, 2.3, 0]}>
        <mesh material={bronze} position={[0, 0.95, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.45, 1.9, 12]} />
        </mesh>
        <mesh material={bronze} position={[0, 2.05, 0]} castShadow>
          <sphereGeometry args={[0.24, 14, 10]} />
        </mesh>
        <mesh material={bronze} position={[0.35, 1.75, 0.2]} rotation={[-0.6, 0, -0.5]} castShadow>
          <boxGeometry args={[0.16, 0.9, 0.16]} />
        </mesh>
        <mesh material={bronze} position={[-0.3, 1.3, 0.05]} rotation={[0, 0, 0.2]} castShadow>
          <boxGeometry args={[0.16, 0.8, 0.16]} />
        </mesh>
      </group>
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The gateway's arch, the pool's water, the solar panels

function GateArch() {
  const arch = useMemo(() => {
    const w = GATE.opening[1] - GATE.opening[0]
    const shape = new THREE.Shape()
    shape.moveTo(-w / 2 - 0.9, 0)
    shape.lineTo(w / 2 + 0.9, 0)
    shape.lineTo(w / 2 + 0.9, 1.3)
    shape.lineTo(-w / 2 - 0.9, 1.3)
    shape.closePath()
    const hole = new THREE.Path()
    hole.absarc(0, 0, w / 2, 0, Math.PI, false)
    shape.holes.push(hole)
    return new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: false }).translate(0, 0, -0.55).rotateY(Math.PI / 2)
  }, [])
  const mid = (GATE.opening[0] + GATE.opening[1]) / 2
  return (
    <group>
      <mesh geometry={arch} material={material('stone')} position={[GATE.x, GATE.height - 1.05, mid]} castShadow />
      <mesh material={material('stone')} position={[GATE.x, GATE.height + 1.2, mid]} castShadow>
        <boxGeometry args={[1.3, 0.5, 3]} />
      </mesh>
    </group>
  )
}

function PoolWater() {
  const w = POOL.max[0] - POOL.min[0] - 0.6
  const d = POOL.max[1] - POOL.min[1] - 0.6
  return (
    <mesh material={material('water')} position={[(POOL.min[0] + POOL.max[0]) / 2, POOL.rim - 0.08, (POOL.min[1] + POOL.max[1]) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

function SolarPanels() {
  const panels = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let x = SOLAR.min[0]; x < SOLAR.max[0] - 1; x += 1.8) {
      for (let z = SOLAR.min[1]; z < SOLAR.max[1] - 1; z += 1.9) {
        parts.push(new THREE.BoxGeometry(1.6, 0.05, 1.1).rotateX(-0.35).translate(x + 0.8, SOLAR.y + 0.55, z + 0.6))
      }
    }
    return mergeGeometries(parts)!
  }, [])
  return <mesh geometry={panels} material={solarLook} castShadow />
}

const BUILDS = { yugo: buildYugo, fiesta: buildFiesta, mustang: buildMustang, jetta: buildJetta, caravan: buildCaravan }

export function Props() {
  return (
    <group>
      <Fountain />
      <Statue />
      <Palms at={PALMS} />
      <Trees at={TREES} />
      <Hedges hedges={HEDGES} />
      <Lamps at={LAMPS} />
      <PowerLines poles={POLES} />
      <GateArch />
      <PoolWater />
      <SolarPanels />
      <StartMarks teams={[{ at: SPAWNS.west, colour: TEAM_COLOURS.west }, { at: SPAWNS.east, colour: TEAM_COLOURS.east }]} />
      {PARKED.map((p, i) => (
        <CarBody key={i} build={BUILDS[p.model]} scale={CAR_SCALE} position={[p.at[0], 0, p.at[1]]} yaw={p.yaw} />
      ))}
    </group>
  )
}
