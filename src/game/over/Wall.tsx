import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners, loudness } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { STEP, raceClock } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { COLORS, POST_X, WALL, WIDTH } from './course'
import { CYCLE, openFor, rising, wallTop } from './wallTimes'

// 5. The Wall: green walls come up out of the track, right across it, stay up ten seconds, and go back down for
// five. Down, they're part of the track; coming up, they throw off anyone standing on them (back the way they
// came). A gantry over them shows which it is: red, with how long till they go down, or green, with how long
// till they come back up.

const wallLook = new THREE.MeshStandardMaterial({ color: COLORS.bar, roughness: 0.5 })
const stripeLook = new THREE.MeshStandardMaterial({ color: COLORS.barDark, roughness: 0.5 })
const lampLook = new THREE.MeshStandardMaterial({ color: '#ff3b4e', emissive: '#ff3b4e', emissiveIntensity: 0.8 })
const RED = new THREE.Color('#ff3b4e')
const GREEN = new THREE.Color('#3ddc62')
const WIDE = WIDTH + 0.6

export function GreenWall() {
  const body = useRef<RapierRigidBody>(null)
  const bar = useRef<THREE.Mesh>(null)
  const thrown = useRef(new Map<number, number>())
  // (Down, its top's a hair under the track's, out of sight)
  useKinematic(body, (t) => ({ position: { x: 0, y: wallTop(t) - WALL.height - 0.02, z: WALL.z } }))

  // Coming up: anyone on top of it is thrown off, back towards the start
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (!rising(t)) return
    const top = wallTop(t)
    for (const r of allRunners()) {
      const p = r.position()
      if (Math.abs(p.z - WALL.z) > WALL.thickness / 2 + 0.45 || Math.abs(p.y - 1 - top) > 0.7) continue
      if ((thrown.current.get(r.handle) ?? 0) > t) continue
      thrown.current.set(r.handle, t + 0.8)
      withVolume(loudness(r), () => {
        sfx.bounce()
        r.knock({ x: 0, y: 6, z: 7 })
      })
    }
  })

  // The gantry's lamp and bar: red and running down while it's up, green while it's down
  useFrame(() => {
    const t = raceClock()
    const open = openFor(t)
    const c = ((t % CYCLE) + CYCLE) % CYCLE
    lampLook.color.copy(open > 0 ? GREEN : RED)
    lampLook.emissive.copy(open > 0 ? GREEN : RED)
    const left = open > 0 ? open / (WALL.down - WALL.move) : Math.max(0, WALL.up + WALL.move - c) / (WALL.up + WALL.move)
    if (bar.current) bar.current.scale.x = Math.max(0.001, Math.min(1, left))
  })

  const gantryTop = WALL.height + 2.2
  return (
    <group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -WALL.height, WALL.z]}>
        <CuboidCollider args={[WIDE / 2, WALL.height / 2, WALL.thickness / 2]} position={[0, WALL.height / 2, 0]} />
        <mesh material={wallLook} position={[0, WALL.height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[WIDE, WALL.height, WALL.thickness]} />
        </mesh>
        {[0.25, 0.5, 0.75].map((f) => (
          <mesh key={f} material={stripeLook} position={[0, WALL.height * f, 0]}>
            <boxGeometry args={[WIDE + 0.02, 0.18, WALL.thickness + 0.02]} />
          </mesh>
        ))}
      </RigidBody>
      {/* The gantry over it */}
      <group position={[0, 0, WALL.z]}>
        {[-1, 1].map((s) => (
          <mesh key={s} material={paint(COLORS.post)} position={[s * POST_X, gantryTop / 2, 0]} castShadow>
            <boxGeometry args={[0.5, gantryTop, 0.5]} />
          </mesh>
        ))}
        <mesh material={paint(COLORS.post)} position={[0, gantryTop, 0]} castShadow>
          <boxGeometry args={[POST_X * 2 + 0.5, 0.6, 0.6]} />
        </mesh>
        <mesh material={paint('#1d1f29')} position={[0, gantryTop - 0.75, 0.32]}>
          <boxGeometry args={[6.4, 0.6, 0.1]} />
        </mesh>
        <mesh ref={bar} material={lampLook} position={[0, gantryTop - 0.75, 0.39]}>
          <boxGeometry args={[6, 0.36, 0.04]} />
        </mesh>
      </group>
    </group>
  )
}
