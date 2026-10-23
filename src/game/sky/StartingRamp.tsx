import { useRef } from 'react'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { RAMP, WIDTH, floorY } from './course'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { Slab } from '../race/parts'
import { raceClock } from '../race/race'
import { sfx } from '../race/sound'

// Three rows of piggy-bank pendulums swinging across the ramp. Each swing (one side to the other) takes 2.5 s.
const SWING_SECONDS = 2.5
const AMPLITUDE = 1 // radians, about 57°
const ARM = 6.8
const PIVOT_HEIGHT = 8.2
const ROWS = [
  { z: -6, offset: 0 },
  { z: -13, offset: 1.6 },
  { z: -20, offset: 3.2 },
]
const XS = [-6.5, 0, 6.5]

const swingAngle = (t: number, offset: number) => AMPLITUDE * Math.sin((Math.PI * (t + offset)) / SWING_SECONDS)
const swingRate = (t: number, offset: number) => Math.cos((Math.PI * (t + offset)) / SWING_SECONDS) // sign = direction

const PINK = '#ff8fc8'
const PINK_DARK = '#f062a8'
const q = new THREE.Quaternion()
const zAxis = new THREE.Vector3(0, 0, 1)

function PiggyBank() {
  const pink = paint(PINK)
  const dark = paint(PINK_DARK)
  const ink = paint('#1b1b1f')
  return (
    <group>
      <mesh material={pink} scale={[1.05, 0.9, 1.25]} castShadow>
        <sphereGeometry args={[1, 24, 18]} />
      </mesh>
      {/* Snout with nostrils */}
      <mesh material={dark} position={[0, -0.05, 1.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.36, 0.26, 20]} />
      </mesh>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} material={ink} position={[x, -0.05, 1.36]} scale={[1, 1.4, 0.5]}>
          <sphereGeometry args={[0.06, 8, 8]} />
        </mesh>
      ))}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} material={ink} position={[x, 0.3, 1.0]}>
          <sphereGeometry args={[0.08, 10, 10]} />
        </mesh>
      ))}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} material={dark} position={[x, 0.78, 0.55]} rotation={[0.4, 0, x > 0 ? -0.35 : 0.35]} castShadow>
          <coneGeometry args={[0.24, 0.45, 4]} />
        </mesh>
      ))}
      {[
        [-0.5, -0.55],
        [0.5, -0.55],
        [-0.5, 0.6],
        [0.5, 0.6],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} material={dark} position={[x, -0.85, z]} castShadow>
          <cylinderGeometry args={[0.2, 0.18, 0.45, 12]} />
        </mesh>
      ))}
      {/* Coin slot on the back */}
      <mesh material={ink} position={[0, 0.9, -0.1]}>
        <boxGeometry args={[0.55, 0.06, 0.12]} />
      </mesh>
      <mesh material={dark} position={[0, 0.1, -1.25]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.14, 0.05, 8, 16]} />
      </mesh>
    </group>
  )
}

function Pendulum({ x, z, offset }: { x: number; z: number; offset: number }) {
  const body = useRef<RapierRigidBody>(null)
  const pivotY = floorY(z) + PIVOT_HEIGHT
  useKinematic(body, (t) => ({
    position: { x, y: pivotY, z },
    rotation: q.setFromAxisAngle(zAxis, swingAngle(t, offset)), // Rapier copies it, so reusing q is safe
  }), 'hazard')

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[x, pivotY, z]}
      onCollisionEnter={knockOnHit(() => {
        sfx.knock()
        // Shove the player sideways in the direction the pig is swinging
        const dir = Math.sign(swingRate(raceClock(), offset)) || 1
        return { x: dir * 11, y: 5, z: 0 }
      })}
    >
      <BallCollider args={[1.05]} position={[0, -ARM, 0]} />
      <mesh material={paint('#c9ced6')} position={[0, -ARM / 2 + 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, ARM - 0.8, 8]} />
      </mesh>
      <mesh material={paint('#8d95a3')}>
        <sphereGeometry args={[0.3, 12, 12]} />
      </mesh>
      <group position={[0, -ARM, 0]}>
        <PiggyBank />
      </group>
    </RigidBody>
  )
}

// Gantry holding one row of pendulums: two posts outside the track and a beam across the top
function Gantry({ z }: { z: number }) {
  const pivotY = floorY(z) + PIVOT_HEIGHT
  const post = paint('#ffd23f')
  const half = WIDTH / 2 + 0.8
  return (
    <group>
      {[-half, half].map((x) => (
        <mesh key={x} material={post} position={[x, pivotY - 5, z]} castShadow>
          <boxGeometry args={[0.6, 11, 0.6]} />
        </mesh>
      ))}
      <mesh material={post} position={[0, pivotY + 0.35, z]} castShadow>
        <boxGeometry args={[half * 2 + 0.6, 0.6, 0.6]} />
      </mesh>
    </group>
  )
}

export function StartingRamp() {
  return (
    <group>
      <Slab z0={RAMP.z0} y0={RAMP.y0} z1={RAMP.z1} y1={RAMP.y1} top="#ffb3e0" side="#9b5de5" />
      {ROWS.map((row) => (
        <group key={row.z}>
          <Gantry z={row.z} />
          {XS.map((x) => (
            <Pendulum key={x} x={x} z={row.z} offset={row.offset} />
          ))}
        </group>
      ))}
    </group>
  )
}
