import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { paint } from '../race/materials'
import { Block } from '../race/parts'
import { sfx } from '../race/sound'
import { COLORS, HALF, STORM } from './course'

// 4. Shape Storm: a walled field where big toy shapes rain from the sky, bounce, roll and pile up. A shape
// that hits you knocks you away from it, harder the faster it's going. Each one lands, lies about for a few
// seconds, then is lifted back up into the sky to fall again (so does anything that rolls off the field).

type Kind = 'ball' | 'box' | 'cylinder' | 'cone' | 'hex'
const KINDS: Kind[] = ['ball', 'box', 'cylinder', 'cone', 'hex']
type Spec = { kind: Kind; size: number; color: string; life: number }

let seed = 17
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const SPECS: Spec[] = Array.from({ length: STORM.count }, (_, i) => ({
  kind: KINDS[i % KINDS.length],
  size: 0.6 + rand() * 0.6,
  color: COLORS.candy[Math.floor(rand() * COLORS.candy.length)],
  life: 8 + rand() * 5,
}))

const FIELD = { x: HALF - 1, z0: STORM.z0 - 2, z1: STORM.z1 + 2 }
const LOST_Y = -12
const between = (a: number, b: number) => a + Math.random() * (b - a)

// Somewhere in the sky over the field, falling, turning any which way
function skySpot(rb: RapierRigidBody, y0 = STORM.drop.y0, y1 = STORM.drop.y1) {
  rb.setTranslation({ x: between(-FIELD.x, FIELD.x), y: between(y0, y1), z: between(FIELD.z1, FIELD.z0) }, true)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(between(0, 6.3), between(0, 6.3), between(0, 6.3)))
  rb.setRotation(q, true)
  rb.setLinvel({ x: between(-1, 1), y: -between(0, 4), z: between(-1, 1) }, true)
  rb.setAngvel({ x: between(-2, 2), y: between(-2, 2), z: between(-2, 2) }, true)
}

function ShapeBody({ spec }: { spec: Spec }) {
  const s = spec.size
  const material = paint(spec.color)
  switch (spec.kind) {
    case 'ball':
      return (
        <>
          <BallCollider args={[s]} restitution={0.5} />
          <mesh material={material} castShadow receiveShadow>
            <sphereGeometry args={[s, 24, 18]} />
          </mesh>
        </>
      )
    case 'box':
      return (
        <>
          <CuboidCollider args={[s, s, s]} />
          <mesh material={material} castShadow receiveShadow>
            <boxGeometry args={[s * 2, s * 2, s * 2]} />
          </mesh>
        </>
      )
    case 'cylinder':
      return (
        <>
          <CylinderCollider args={[s, s * 0.8]} />
          <mesh material={material} castShadow receiveShadow>
            <cylinderGeometry args={[s * 0.8, s * 0.8, s * 2, 24]} />
          </mesh>
        </>
      )
    case 'cone':
      return (
        <>
          <ConeCollider args={[s, s]} />
          <mesh material={material} castShadow receiveShadow>
            <coneGeometry args={[s, s * 2, 24]} />
          </mesh>
        </>
      )
    case 'hex':
      return (
        <mesh material={material} castShadow receiveShadow>
          <cylinderGeometry args={[s, s, s * 1.4, 6]} />
        </mesh>
      )
  }
}

function StormShape({ spec, index }: { spec: Spec; index: number }) {
  const body = useRef<RapierRigidBody>(null)
  const since = useRef(0)
  // To begin with they're spread up the sky, so they come down one after another
  const start = useMemo<[number, number, number]>(
    () => [
      ((index * 7.31) % (FIELD.x * 2)) - FIELD.x,
      STORM.drop.y0 + ((index * 13.7) % 70),
      FIELD.z1 + ((index * 5.93) % (FIELD.z0 - FIELD.z1)),
    ],
    [index],
  )
  const knock = (contact: CollisionEnterPayload) =>
    knockOnHit((player) => {
      const rb = body.current
      if (!rb) return { x: 0, y: 0, z: 0 }
      const v = rb.linvel()
      const speed = Math.hypot(v.x, v.y, v.z)
      if (speed < 3) return { x: 0, y: 0, z: 0 }
      sfx.knock()
      const p = rb.translation()
      const dx = player.x - p.x
      const dz = player.z - p.z
      const d = Math.hypot(dx, dz) || 1
      const push = Math.min(11, 3 + speed * 0.35)
      return { x: (dx / d) * push, y: 4 + Math.min(4, speed * 0.1), z: (dz / d) * push }
    })(contact)

  useFrame((_, dt) => {
    const rb = body.current
    if (!rb) return
    since.current += dt
    if (since.current > spec.life + 3 || rb.translation().y < LOST_Y) {
      since.current = 0
      skySpot(rb)
    }
  })

  return (
    <RigidBody
      ref={body}
      colliders={spec.kind === 'hex' ? 'hull' : false}
      position={start}
      ccd
      onCollisionEnter={knock}
    >
      <ShapeBody spec={spec} />
    </RigidBody>
  )
}

export function ShapeStorm() {
  const wallColor = COLORS.candy[1]
  return (
    <group>
      {/* Low walls down both sides keep most of the shapes (and runners) on the field */}
      {[-1, 1].map((side) => (
        <Block
          key={side}
          min={[side < 0 ? -HALF - 0.5 : HALF, 0, STORM.z1]}
          max={[side < 0 ? -HALF : HALF + 0.5, STORM.wallHeight, STORM.z0]}
          color={wallColor}
          top={COLORS.trim}
        />
      ))}
      {SPECS.map((spec, i) => (
        <StormShape key={i} spec={spec} index={i} />
      ))}
      {/* Warning stripes where the storm begins */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} material={paint(i % 2 ? '#1b1b1f' : COLORS.trim)} position={[-HALF + 1 + i * 2, 0.02, STORM.z0 - 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 0.8]} />
        </mesh>
      ))}
    </group>
  )
}
