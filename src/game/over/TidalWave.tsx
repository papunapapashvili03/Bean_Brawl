import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit } from '../playerContact'
import { setTimetabled } from '../race/kinematic'
import { paint } from '../race/materials'
import { STEP, raceClock } from '../race/race'
import { sfx } from '../race/sound'
import { BAR, COLORS, POST_X, WAVE } from './course'
import { beamV, beamZ, guess } from './wave'

// 4. Tidal Wave: two long green beams rolling up and down the deck, the length of it, turning back at each
// end. Neither keeps to one speed: every second or so it surges or slows, often just as it reaches someone,
// so the only way past is to watch it and time the jump. It glows brighter the faster it's going. Each
// beam's whole run is worked out when the race starts (different every race); the bots, though, are given
// only a guess (going on as it's going now), and so get caught out like anyone else.

const KNOCK_UP = 5

const beamShape = new THREE.CylinderGeometry(WAVE.radius, WAVE.radius, POST_X * 2, 20).rotateZ(Math.PI / 2)
const posts = paint(COLORS.post)
const looks = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: COLORS.bar, emissive: COLORS.bar, emissiveIntensity: 0.2, roughness: 0.4 }))
// The faster it's going, the brighter it glows
function glow(k: number) {
  const speed = Math.abs(beamV(k, raceClock()))
  looks[k].emissiveIntensity = 0.15 + 0.85 * ((speed - WAVE.slowest) / (WAVE.fastest - WAVE.slowest)) ** 1.5
}

function Beam({ k }: { k: number }) {
  const body = useRef<RapierRigidBody>(null)
  useEffect(() => {
    const handle = body.current?.handle
    if (handle === undefined) return
    const position = { x: 0, y: WAVE.y, z: 0 }
    setTimetabled(handle, {
      pose: (t) => {
        position.z = guess(k, t)
        return { position }
      },
      hazard: true,
    })
    return () => setTimetabled(handle, null)
  }, [k])
  useBeforePhysicsStep(() => {
    body.current?.setNextKinematicTranslation({ x: 0, y: WAVE.y, z: beamZ(k, raceClock() + STEP) })
  })
  useFrame(() => glow(k))
  const knock = knockOnHit(() => {
    sfx.knock()
    const v = beamV(k, raceClock())
    return { x: 0, y: KNOCK_UP, z: Math.sign(v) * (Math.abs(v) + 3) }
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, WAVE.y, beamZ(k, 0)]} onCollisionEnter={knock}>
      <CuboidCollider args={[BAR.reach, WAVE.radius, WAVE.radius]} />
      <mesh geometry={beamShape} material={looks[k]} castShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} material={posts} position={[s * POST_X, -0.05, 0]} castShadow>
          <boxGeometry args={[0.45, WAVE.y * 2 + 0.3, 0.45]} />
        </mesh>
      ))}
    </RigidBody>
  )
}

export function TidalWave() {
  return (
    <group>
      <Beam k={0} />
      <Beam k={1} />
      {/* The grooves the beams' posts run in */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={paint('#2c2f3a')} position={[s * POST_X, 0.02, (WAVE.near + WAVE.far) / 2]} receiveShadow>
          <boxGeometry args={[0.55, 0.06, WAVE.near - WAVE.far + 1.4]} />
        </mesh>
      ))}
    </group>
  )
}
