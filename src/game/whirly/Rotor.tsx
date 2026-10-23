import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { surfaces } from '../race/race'
import { COLORS, ROTOR, ROTOR_ENTRY, ROTOR_EXIT, TOP_1 } from './course'

// 5. Rotor Ride: a round hub about a tall red pole (a rotor spinning on top of it), and four broad arms
// turning round it, their ends sweeping past a landing on either side; each landing's edge is an arc the
// arms' ends follow, so an arm can be stepped on (or off) anywhere along it as it comes past. Standing on an
// arm carries you round with it. Off an arm's edge, it's a long way down.

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const SLICES = 8
const LANDING_THICK = 0.8
const POLE = { radius: 0.9, height: 9 }

// A landing: its back edge straight across, its front the arc round the hub (towards +z for the entry, -z
// for the exit), in slices each a convex block
function landingSlices(back: number, towards: 1 | -1) {
  const slices: THREE.Vector3[][] = []
  const at = (a: number) => [ROTOR.x + ROTOR.edge * Math.sin(a), ROTOR.z + towards * ROTOR.edge * Math.cos(a)] as const
  for (let k = 0; k < SLICES; k++) {
    const a0 = -ROTOR.span + (k / SLICES) * 2 * ROTOR.span
    const a1 = -ROTOR.span + ((k + 1) / SLICES) * 2 * ROTOR.span
    const [x0, z0] = at(a0)
    const [x1, z1] = at(a1)
    const points: THREE.Vector3[] = []
    for (const y of [TOP_1, TOP_1 - LANDING_THICK]) {
      points.push(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x1, y, back), new THREE.Vector3(x0, y, back))
    }
    slices.push(points)
  }
  return slices
}
const ENTRY = landingSlices(ROTOR_ENTRY.back, 1)
const EXIT = landingSlices(ROTOR_EXIT.back, -1)

function Landing({ slices }: { slices: THREE.Vector3[][] }) {
  const { hulls, geometries } = useMemo(
    () => ({
      hulls: slices.map((s) => new Float32Array(s.flatMap((p) => [p.x, p.y, p.z]))),
      geometries: slices.map((s) => new ConvexGeometry(s)),
    }),
    [slices],
  )
  // A yellow trim along the arc
  const trim = useMemo(() => slices.map((s) => ({ a: s[0], b: s[1] })), [slices])
  return (
    <RigidBody type="fixed" colliders={false}>
      {hulls.map((h, i) => (
        <ConvexHullCollider key={i} args={[h]} />
      ))}
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={paint(COLORS.floor)} receiveShadow castShadow />
      ))}
      {trim.map(({ a, b }, i) => {
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const length = a.distanceTo(b)
        return (
          <mesh key={i} material={paint(COLORS.trim)} position={[mid.x, TOP_1 + 0.02, mid.z]} rotation={[0, Math.atan2(b.x - a.x, b.z - a.z), 0]}>
            <boxGeometry args={[0.25, 0.06, length + 0.02]} />
          </mesh>
        )
      })}
    </RigidBody>
  )
}

// The hub, the pole, and the little rotor spinning on top of it
function Hub() {
  const rotor = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (rotor.current) rotor.current.rotation.y += delta * 3
  })
  const top = TOP_1 + POLE.height
  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[ROTOR.x, TOP_1, ROTOR.z]}>
        <CylinderCollider args={[0.4, ROTOR.hub]} position={[0, -0.4, 0]} />
        <CylinderCollider args={[POLE.height / 2, POLE.radius]} position={[0, POLE.height / 2, 0]} />
        <mesh material={[paint(COLORS.pink), paint(COLORS.trim), paint(COLORS.pink)]} position={[0, -0.4, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[ROTOR.hub, ROTOR.hub, 0.8, 40]} />
        </mesh>
        <mesh material={paint(COLORS.red)} position={[0, POLE.height / 2, 0]} castShadow>
          <cylinderGeometry args={[POLE.radius, POLE.radius * 1.15, POLE.height, 24]} />
        </mesh>
        {[0.25, 0.5, 0.75].map((f) => (
          <mesh key={f} material={paint('#ffffff')} position={[0, POLE.height * f, 0]}>
            <cylinderGeometry args={[POLE.radius * 1.06, POLE.radius * 1.06, 0.35, 24]} />
          </mesh>
        ))}
      </RigidBody>
      <group ref={rotor} position={[ROTOR.x, top + 0.4, ROTOR.z]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} material={paint(COLORS.pink)} rotation={[0, (k * Math.PI) / 2, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[7, 0.25, 0.9]} />
          </mesh>
        ))}
        <mesh material={paint(COLORS.trim)}>
          <sphereGeometry args={[0.8, 18, 12]} />
        </mesh>
      </group>
    </group>
  )
}

// The arms: one body turning round the hub, an arm out every quarter turn
const ARM_FROM = ROTOR.hub - 0.3
const ARM_LENGTH = ROTOR.reach - ARM_FROM
const ARM_MID = ARM_FROM + ARM_LENGTH / 2
const ANGLES = Array.from({ length: ROTOR.arms }, (_, k) => (k * Math.PI * 2) / ROTOR.arms)

function Arms() {
  const body = useRef<RapierRigidBody>(null)
  const colliders = useRef<(RapierCollider | null)[]>([])
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const y = TOP_1 - ROTOR.thickness / 2
  useKinematic(body, (t) => ({ position: { x: ROTOR.x, y, z: ROTOR.z }, rotation: turn.setFromAxisAngle(Y_AXIS, ROTOR.spin * t) }))
  // Riding an arm: a point on it, turning at w about +y, goes w * (dz, -dx)
  useEffect(() => {
    const handles = colliders.current.flatMap((c) => (c ? [c.handle] : []))
    const ride = (p: { x: number; z: number }) => ({ x: ROTOR.spin * (p.z - ROTOR.z), z: -ROTOR.spin * (p.x - ROTOR.x) })
    for (const h of handles) surfaces.set(h, ride)
    return () => {
      for (const h of handles) surfaces.delete(h)
    }
  }, [])
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[ROTOR.x, y, ROTOR.z]}>
      {ANGLES.map((a, k) => (
        <CuboidCollider
          key={k}
          ref={(c) => {
            colliders.current[k] = c
          }}
          args={[ARM_LENGTH / 2, ROTOR.thickness / 2, ROTOR.armHalf]}
          position={[ARM_MID * Math.cos(a), 0, -ARM_MID * Math.sin(a)]}
          rotation={[0, a, 0]}
        />
      ))}
      {ANGLES.map((a, k) => (
        <group key={k} rotation={[0, a, 0]}>
          <mesh material={[paint(COLORS.side), paint(COLORS.side), paint(k % 2 ? '#7fd3ff' : COLORS.floor), paint(COLORS.side), paint(COLORS.side), paint(COLORS.side)]} position={[ARM_MID, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[ARM_LENGTH, ROTOR.thickness, ROTOR.armHalf * 2]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={paint(COLORS.trim)} position={[ARM_MID, ROTOR.thickness / 2 + 0.01, s * (ROTOR.armHalf - 0.1)]}>
              <boxGeometry args={[ARM_LENGTH, 0.03, 0.2]} />
            </mesh>
          ))}
          {/* Chevrons along it, pointing out to the end */}
          {[0.3, 0.55, 0.8].map((f) => (
            <mesh key={f} material={paint('#ffffff')} position={[ARM_FROM + ARM_LENGTH * f, ROTOR.thickness / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
              <circleGeometry args={[0.55, 3]} />
            </mesh>
          ))}
        </group>
      ))}
    </RigidBody>
  )
}

export function RotorRide() {
  return (
    <group>
      <Landing slices={ENTRY} />
      <Landing slices={EXIT} />
      <Hub />
      <Arms />
    </group>
  )
}
