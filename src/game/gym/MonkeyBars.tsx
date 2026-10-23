import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { CANYON, MONKEY_LANDING, MONKEY_Y, RACKS, RUNG_Z } from './course'

// 1. Monkey Bar Canyon: three racks of rungs side by side across the canyon, each on two steel rails held up
// by posts on the decks at either end. Jump to catch the first rung, then Space to fling to the next (hold
// W). The landing deck's front edge catches a fling that comes up short.

type P3 = [number, number, number]

const STEEL = new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.6, roughness: 0.35 })
const POST_RADIUS = 0.09
const RAIL_RADIUS = 0.06
const RAIL_Z: [number, number] = [CANYON.z0 + 0.3, CANYON.z1 - 0.3] // the rails reach onto the decks

const rungs = RACKS.flatMap(([x0, x1]) => RUNG_Z.map((z) => ({ a: [x0, MONKEY_Y, z] as P3, b: [x1, MONKEY_Y, z] as P3 })))
const LANDING_LIP = {
  a: [MONKEY_LANDING.min[0], MONKEY_LANDING.max[1], MONKEY_LANDING.max[2]] as P3,
  b: [MONKEY_LANDING.max[0], MONKEY_LANDING.max[1], MONKEY_LANDING.max[2]] as P3,
}

const toEdge = (kind: GrabEdge['kind'], a: P3, b: P3, out: { x: number; z: number }): GrabEdge => ({
  kind,
  a: { x: a[0], y: a[1], z: a[2] },
  b: { x: b[0], y: b[1], z: b[2] },
  out,
})
const EDGES: GrabEdge[] = [
  ...rungs.map((r) => toEdge('bar', r.a, r.b, { x: 0, z: 1 })),
  toEdge('ledge', LANDING_LIP.a, LANDING_LIP.b, { x: 0, z: 1 }),
]

function Post({ x, z }: { x: number; z: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[x, MONKEY_Y / 2, z]}>
      <CylinderCollider args={[MONKEY_Y / 2, POST_RADIUS]} />
      <mesh material={STEEL} castShadow>
        <cylinderGeometry args={[POST_RADIUS, POST_RADIUS, MONKEY_Y + 0.06, 12]} />
      </mesh>
    </RigidBody>
  )
}

function Rack({ x0, x1 }: { x0: number; x1: number }) {
  const length = RAIL_Z[0] - RAIL_Z[1]
  return (
    <group>
      {[x0 - 0.1, x1 + 0.1].map((x) => (
        <group key={x}>
          <mesh material={STEEL} position={[x, MONKEY_Y, (RAIL_Z[0] + RAIL_Z[1]) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[RAIL_RADIUS, RAIL_RADIUS, length, 10]} />
          </mesh>
          <Post x={x} z={RAIL_Z[0]} />
          <Post x={x} z={RAIL_Z[1]} />
        </group>
      ))}
    </group>
  )
}

export function MonkeyCanyon() {
  useGrabEdges(EDGES)
  const tape = useMemo(() => rungs.map((r) => ({ a: [r.a[0] - 0.1, r.a[1], r.a[2]] as P3, b: [r.b[0] + 0.1, r.b[1], r.b[2]] as P3 })), [])
  return (
    <group>
      {RACKS.map(([x0, x1]) => (
        <Rack key={x0} x0={x0} x1={x1} />
      ))}
      {tape.map((r, i) => (
        <TapedRod key={i} a={r.a} b={r.b} radius={0.05} tape="bar" />
      ))}
      <TapedRod a={LANDING_LIP.a} b={LANDING_LIP.b} />
    </group>
  )
}
