import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { paint } from '../race/materials'
import { playerPosition, raceClock, surfaces } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { BLOWER, COLORS, GUST, ISLANDS, PLANKS, gustAt, nextGustIn } from './course'

// 4. Blower Bridge: three narrow planks with islands between, and banks of blue blowers either side. In a
// gust (from one side, then the next time from the other) anyone stood on a plank is carried sideways with
// it, as on a conveyor: walk into it, or be blown off. (In the air, or on an island, you're out of it.) The
// blowers about to blow spin up first; in a gust, streaks of wind blow across.

const THICK = 0.8
const BLOWERS_PER_PLANK = 2
const STREAKS = 36
const HEARD_WITHIN = 30
const Z_AXIS = new THREE.Vector3(0, 0, 1)

// The wind at t across the planks (m/s, along x)
const windAt = (t: number) => gustAt(t) * GUST.speed
// Which side blows next (or now): -1 from -x, 1 from +x. (A gust towards +x comes from the -x side.)
function nextSide(t: number) {
  const now = gustAt(t)
  return -(now || gustAt(t + nextGustIn(t) + 0.05))
}

function Plank({ z0, z1 }: { z0: number; z1: number }) {
  const collider = useRef<RapierCollider>(null)
  useEffect(() => {
    const handle = collider.current!.handle
    surfaces.set(handle, () => ({ x: windAt(raceClock()), z: 0 }))
    return () => {
      surfaces.delete(handle)
    }
  }, [])
  const length = z0 - z1
  return (
    <RigidBody type="fixed" colliders={false} position={[0, BLOWER.y - THICK / 2, (z0 + z1) / 2]}>
      <CuboidCollider ref={collider} args={[BLOWER.plankHalf, THICK / 2, length / 2]} />
      <mesh material={[paint(COLORS.side), paint(COLORS.side), paint(COLORS.floor), paint(COLORS.side), paint(COLORS.side), paint(COLORS.side)]} receiveShadow castShadow>
        <boxGeometry args={[BLOWER.plankHalf * 2, THICK, length]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={paint(COLORS.trim)} position={[s * (BLOWER.plankHalf - 0.08), THICK / 2 + 0.01, 0]}>
          <boxGeometry args={[0.16, 0.02, length]} />
        </mesh>
      ))}
    </RigidBody>
  )
}

function Island({ z }: { z: number }) {
  const r = BLOWER.islandRadius
  return (
    <RigidBody type="fixed" colliders={false} position={[0, BLOWER.y - THICK / 2, z]}>
      <CylinderCollider args={[THICK / 2, r]} />
      <mesh material={[paint(COLORS.pink), paint(COLORS.floor), paint(COLORS.pink)]} receiveShadow castShadow>
        <cylinderGeometry args={[r, r, THICK, 40]} />
      </mesh>
      <mesh material={paint('#ffffff')} position={[0, THICK / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.45, r - 0.3, 40]} />
      </mesh>
    </RigidBody>
  )
}

// The blowers: a blue fan in a yellow ring on a post, facing across the planks, one bank to each side
const BLOWER_SPOTS = PLANKS.flatMap((p) =>
  Array.from({ length: BLOWERS_PER_PLANK }, (_, k) => p.z0 + ((k + 0.5) / BLOWERS_PER_PLANK) * (p.z1 - p.z0)),
).flatMap((z) => [-1, 1].map((side) => ({ z, side })))
const BLADE = new THREE.BoxGeometry(0.45, 1.5, 0.08).translate(0, 0.75, 0)
const BLADE_LOOK = paint('#3fa9f5')

function Blowers() {
  const rotors = useRef<(THREE.Group | null)[]>([])
  const spin = useRef([0, 0]) // how fast each side's turning (-x side, +x side)
  useFrame((_, delta) => {
    const t = raceClock()
    const wind = gustAt(t)
    const soon = nextGustIn(t) < 0.7 ? nextSide(t) : 0
    ;[-1, 1].forEach((side, i) => {
      // A side blows when the wind comes from it: spinning hard, and spinning up just before
      const blowing = wind !== 0 && -wind === side
      const target = blowing ? 22 : soon === side ? 12 : 1.5
      spin.current[i] += (target - spin.current[i]) * (1 - Math.exp(-4 * delta))
    })
    rotors.current.forEach((g, k) => {
      if (!g) return
      const i = BLOWER_SPOTS[k].side < 0 ? 0 : 1
      g.rotateOnAxis(Z_AXIS, spin.current[i] * delta)
    })
  })
  return (
    <group>
      {BLOWER_SPOTS.map(({ z, side }, k) => (
        <group key={k} position={[side * BLOWER.blowerX, BLOWER.y + 1.6, z]} rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <mesh material={paint(COLORS.trim)}>
            <torusGeometry args={[1.75, 0.18, 10, 32]} />
          </mesh>
          <group
            ref={(g) => {
              rotors.current[k] = g
            }}
          >
            {[0, 1, 2].map((b) => (
              <mesh key={b} geometry={BLADE} material={BLADE_LOOK} rotation={[0, 0, (b * Math.PI * 2) / 3]} />
            ))}
            <mesh material={paint('#ffffff')} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.32, 0.32, 0.3, 16]} />
            </mesh>
          </group>
          <mesh material={paint(COLORS.trim)} position={[0, -(BLOWER.y + 1.6) / 2 - 3, -0.3]}>
            <boxGeometry args={[0.35, BLOWER.y + 1.6 + 6, 0.35]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Streaks of wind blowing across the planks in a gust
const STREAK_LOOK = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })
const STREAK = new THREE.BoxGeometry(1.6, 0.05, 0.05)
const streaks = (() => {
  let seed = 17
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const z0 = PLANKS[0].z0
  const z1 = PLANKS[PLANKS.length - 1].z1
  return Array.from({ length: STREAKS }, () => ({ z: z0 + rand() * (z1 - z0), y: BLOWER.y + 0.3 + rand() * 2.2, phase: rand(), speed: 0.8 + rand() * 0.5 }))
})()

function Streaks() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const span = BLOWER.blowerX * 2
  useLayoutEffect(() => {
    mesh.current!.count = STREAKS
  }, [])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const t = raceClock()
    const wind = gustAt(t)
    const dummy = new THREE.Object3D()
    streaks.forEach((s, i) => {
      const u = (s.phase + t * s.speed * 1.4) % 1
      dummy.position.set(wind ? wind * (u - 0.5) * span : 0, s.y, s.z)
      dummy.scale.setScalar(wind ? 1 : 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[STREAK, STREAK_LOOK, STREAKS]} frustumCulled={false} />
}

// A whoosh as each gust starts (louder the nearer you are)
function GustSound() {
  const was = useRef(0)
  useFrame(() => {
    const now = gustAt(raceClock())
    if (now && !was.current) {
      const near = Math.hypot(playerPosition.x, playerPosition.z - (PLANKS[0].z0 + PLANKS[2].z1) / 2)
      if (near < HEARD_WITHIN) withVolume(1 - near / HEARD_WITHIN, sfx.gust)
    }
    was.current = now
  })
  return null
}

export function BlowerBridge() {
  return (
    <group>
      {PLANKS.map((p, i) => (
        <Plank key={i} {...p} />
      ))}
      {ISLANDS.map((z) => (
        <Island key={z} z={z} />
      ))}
      <Blowers />
      <Streaks />
      <GustSound />
    </group>
  )
}
