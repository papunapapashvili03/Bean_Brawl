import { useEffect, useMemo, useRef } from 'react'
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { CLIMB_PLATFORMS, FINISH } from './course'
import { CoinMesh } from './CoinCascade'
import { useKinematic } from '../race/kinematic'
import { checkerTexture, paint } from '../race/materials'
import { Slab, Strip } from '../race/parts'
import { surfaces } from '../race/race'
import { Confetti } from '../race/RaceKit'
import { sfx } from '../race/sound'

const DISC_THICKNESS = 0.5
const SWEEP_PERIOD = 4 // one full turn every 4 s
const SWEEP_RADIUS = 6.5
const SWEEP_HEIGHT = 1.05
const yAxis = new THREE.Vector3(0, 1, 0)

type PlatformSpec = (typeof CLIMB_PLATFORMS)[number]

function SpinningPlatform({ spec }: { spec: PlatformSpec }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const rot = useMemo(() => new THREE.Quaternion(), [])
  const center = { x: spec.x, y: spec.top - DISC_THICKNESS / 2, z: spec.z }
  useKinematic(body, (t) => ({ position: center, rotation: rot.setFromAxisAngle(yAxis, spec.spin * t) }))

  // Standing on it carries you round: velocity of a point on a disc spinning at w about +y is w * (dz, -dx)
  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, (p) => ({ x: spec.spin * (p.z - spec.z), z: -spec.spin * (p.x - spec.x) }))
    return () => {
      surfaces.delete(handle)
    }
  }, [spec])

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[center.x, center.y, center.z]}>
      <CylinderCollider ref={collider} args={[DISC_THICKNESS / 2, spec.radius]} />
      {/* A coin lying flat (CoinMesh stands on edge, so undo its turn); the stripes make the spin easy to read */}
      <group rotation={[0, 0, -Math.PI / 2]}>
        <CoinMesh radius={spec.radius} thickness={DISC_THICKNESS} />
      </group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={paint('#e23b4e')} position={[0, DISC_THICKNESS / 2 + 0.01, 0]} rotation={[0, (i * Math.PI) / 3, 0]}>
          <boxGeometry args={[spec.radius * 1.7, 0.02, 0.18]} />
        </mesh>
      ))}
    </RigidBody>
  )
}

function Sweeper() {
  const body = useRef<RapierRigidBody>(null)
  const rot = useMemo(() => new THREE.Quaternion(), [])
  const omega = (Math.PI * 2) / SWEEP_PERIOD
  const pivot = { x: 0, y: FINISH.y, z: FINISH.sweeperZ }
  useKinematic(body, (t) => ({ position: pivot, rotation: rot.setFromAxisAngle(yAxis, omega * t) }), 'hazard')
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[pivot.x, pivot.y, pivot.z]}
      onCollisionEnter={knockOnHit((p) => {
        sfx.knock()
        // Push along the bar's direction of travel at the player's position
        const dx = p.x - pivot.x
        const dz = p.z - pivot.z
        const len = Math.hypot(dx, dz) || 1
        return { x: (dz / len) * 12, y: 5, z: (-dx / len) * 12 }
      })}
    >
      <CuboidCollider args={[SWEEP_RADIUS, 0.28, 0.28]} position={[0, SWEEP_HEIGHT, 0]} />
      <CylinderCollider args={[1.1, 0.45]} position={[0, 1.1, 0]} />
      <mesh material={paint('#e23b4e')} position={[0, SWEEP_HEIGHT, 0]} castShadow>
        <boxGeometry args={[SWEEP_RADIUS * 2, 0.56, 0.56]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={paint('#ffd23f')} position={[s * SWEEP_RADIUS, SWEEP_HEIGHT, 0]}>
          <sphereGeometry args={[0.45, 16, 12]} />
        </mesh>
      ))}
      <mesh material={paint('#2b2140')} position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.6, 2.2, 16]} />
      </mesh>
    </RigidBody>
  )
}

function CrownGate() {
  const gold = paint('#ffc83d')
  const gem = paint('#e23b4e')
  const half = FINISH.gateHalfWidth
  const topY = FINISH.y + 6
  return (
    <group position={[0, 0, FINISH.gateZ]}>
      {[-half - 0.5, half + 0.5].map((x) => (
        <RigidBody key={x} type="fixed" position={[x, FINISH.y + 3, 0]}>
          <mesh material={gold} castShadow>
            <boxGeometry args={[1, 6, 1]} />
          </mesh>
        </RigidBody>
      ))}
      {/* Crown: a band with five points, each tipped with a gem */}
      <mesh material={gold} position={[0, topY + 0.4, 0]} castShadow>
        <boxGeometry args={[half * 2 + 2, 0.9, 1]} />
      </mesh>
      {[-2, -1, 0, 1, 2].map((i) => (
        <group key={i} position={[i * 2.1, topY + 0.85, 0]}>
          <mesh material={gold} position={[0, 0.9, 0]} castShadow>
            <coneGeometry args={[0.7, 1.8, 4]} />
          </mesh>
          <mesh material={gem} position={[0, 1.95, 0]}>
            <sphereGeometry args={[0.28, 12, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function FinalClimb() {
  const finishLine = useMemo(() => checkerTexture(16, 2), [])
  return (
    <group>
      {CLIMB_PLATFORMS.map((spec, i) => (
        <SpinningPlatform key={i} spec={spec} />
      ))}
      <Slab
        z0={FINISH.zFront}
        y0={FINISH.y}
        z1={FINISH.zBack}
        y1={FINISH.y}
        width={FINISH.width}
        top="#fff1b8"
        side="#f0a412"
      />
      <Strip y={FINISH.y} z={FINISH.gateZ} width={FINISH.gateHalfWidth * 2 + 2} depth={1.2} map={finishLine} />
      <Sweeper />
      <CrownGate />
      <Confetti origin={[0, FINISH.y + 6.5, FINISH.gateZ]} />
    </group>
  )
}
