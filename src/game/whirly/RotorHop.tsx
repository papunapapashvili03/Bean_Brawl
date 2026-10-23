import { useEffect, useMemo, useRef } from 'react'
import { CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { surfaces } from '../race/race'
import { COLORS, HOPS } from './course'

// 8. Rotor Hop: six little spinning discs with gaps between, each a little higher, smaller and quicker than
// the last, turning alternate ways. Stood on one, you're carried round; miss one, and it's back to the top of
// the stairs.

type Hop = (typeof HOPS)[number]
const THICK = 0.5
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function HopDisc({ hop, index }: { hop: Hop; index: number }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const y = hop.top - THICK / 2
  useKinematic(body, (t) => ({ position: { x: hop.x, y, z: hop.z }, rotation: turn.setFromAxisAngle(Y_AXIS, hop.spin * t) }))
  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, (p) => ({ x: hop.spin * (p.z - hop.z), z: -hop.spin * (p.x - hop.x) }))
    return () => {
      surfaces.delete(handle)
    }
  }, [hop])
  const top = paint(index % 2 ? '#7fd3ff' : COLORS.floor)
  const rim = paint(COLORS.pink)
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[hop.x, y, hop.z]}>
      <CylinderCollider ref={collider} args={[THICK / 2, hop.radius]} />
      <mesh material={[rim, top, rim]} receiveShadow castShadow>
        <cylinderGeometry args={[hop.radius, hop.radius * 0.9, THICK, 40]} />
      </mesh>
      {/* Stripes across it, so you can see it turn */}
      {[0, 1].map((k) => (
        <mesh key={k} material={paint('#ffffff')} position={[0, THICK / 2 + 0.01, 0]} rotation={[0, (k * Math.PI) / 2, 0]}>
          <boxGeometry args={[hop.radius * 1.7, 0.02, 0.22]} />
        </mesh>
      ))}
      <mesh material={paint(COLORS.trim)} position={[0, THICK / 2 + 0.03, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 20]} />
      </mesh>
      {/* A pink stalk underneath, down into the clouds */}
      <mesh material={rim} position={[0, -6, 0]}>
        <cylinderGeometry args={[0.25, 0.4, 12, 12]} />
      </mesh>
    </RigidBody>
  )
}

export function RotorHop() {
  return (
    <group>
      {HOPS.map((h, i) => (
        <HopDisc key={i} hop={h} index={i} />
      ))}
    </group>
  )
}
