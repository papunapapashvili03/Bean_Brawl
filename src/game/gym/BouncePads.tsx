import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import type * as THREE from 'three'
import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { knockOnHit } from '../playerContact'
import { paint } from '../race/materials'
import { sfx } from '../race/sound'
import { COLORS, PAD, PADS, TIER_1, TIER_2 } from './course'

// 6. Bounce Garden: squishy bounce pads that throw you high into the air; steer forward to land on the next
// tier up. The tiers' front edges are ledges, for bounces that come up a little short.

type P3 = [number, number, number]
type Pad = (typeof PADS)[number]

const PAD_HEIGHT = 0.4
const RIM = 0.15 // how far the pad stands proud of the deck

const lip = (tier: typeof TIER_1) => ({
  a: [tier.min[0], tier.max[1], tier.max[2]] as P3,
  b: [tier.max[0], tier.max[1], tier.max[2]] as P3,
})
const LIPS = [lip(TIER_1), lip(TIER_2)]
const EDGES: GrabEdge[] = LIPS.map((l) => ({
  kind: 'ledge',
  a: { x: l.a[0], y: l.a[1], z: l.a[2] },
  b: { x: l.b[0], y: l.b[1], z: l.b[2] },
  out: { x: 0, z: 1 },
}))

function BouncePad({ pad, index }: { pad: Pad; index: number }) {
  const top = useRef<THREE.Group>(null)
  const squash = useRef(0)
  useFrame((_, dt) => {
    squash.current = Math.max(0, squash.current - dt * 4)
    const s = Math.sin(squash.current * Math.PI) // down and back up
    top.current!.scale.set(1 + 0.15 * s, 1 - 0.6 * s, 1 + 0.15 * s)
  })
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[pad.x, pad.y + RIM - PAD_HEIGHT / 2, pad.z]}
      onCollisionEnter={(contact) =>
        knockOnHit(() => {
          squash.current = 1
          sfx.bounce()
          return { x: 0, y: PAD.launch, z: -1.5 }
        })(contact)
      }
    >
      <CylinderCollider args={[PAD_HEIGHT / 2, PAD.radius]} />
      <mesh material={paint('#2b2d42')} receiveShadow>
        <cylinderGeometry args={[PAD.radius + 0.1, PAD.radius + 0.2, PAD_HEIGHT, 32]} />
      </mesh>
      <group ref={top} position={[0, PAD_HEIGHT / 2, 0]}>
        <mesh material={paint(COLORS.candy[index % COLORS.candy.length])} position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[PAD.radius, PAD.radius, 0.12, 32]} />
        </mesh>
        <mesh material={paint('#ffffff')} position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PAD.radius * 0.45, PAD.radius * 0.62, 32]} />
        </mesh>
      </group>
    </RigidBody>
  )
}

export function BounceGarden() {
  useGrabEdges(EDGES)
  return (
    <group>
      {PADS.map((p, i) => (
        <BouncePad key={i} pad={p} index={i} />
      ))}
      {LIPS.map((l, i) => (
        <TapedRod key={i} a={l.a} b={l.b} />
      ))}
    </group>
  )
}
