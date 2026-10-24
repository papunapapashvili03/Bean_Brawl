import { useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { knockOnHit, type Vec3 } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { raceClock } from '../race/race'
import { sfx } from '../race/sound'
import { BAR, COLORS, GATES, GATE_GAP, GATE_TOP, HALF, HURDLES, HURDLE_Y, POST_X, type Box } from './course'

// The green bars: 1. the hurdles, sliding to and fro along the track at knee height (jump them), and 2. the
// gates, bars across the track too low to run under (slide under them), some bobbing up out of the way and
// back down, with a hurdle just before two of them. Every bar is held up by teal posts outside the rails, and
// knocks back whoever runs into it. And the yellow rails along the track's edges.

const barLook = paint(COLORS.bar)
const ringLook = paint(COLORS.barDark)
const postLook = paint(COLORS.post)
const BAR_LENGTH = POST_X * 2
const barShape = new THREE.CylinderGeometry(BAR.radius, BAR.radius, BAR_LENGTH, 18).rotateZ(Math.PI / 2)
const ringShape = new THREE.CylinderGeometry(BAR.radius + 0.02, BAR.radius + 0.02, 0.25, 18).rotateZ(Math.PI / 2)
const RINGS = [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75].map((f) => f * HALF)

// A green bar across the track, darker bands along it
function BarLook() {
  return (
    <>
      <mesh geometry={barShape} material={barLook} castShadow />
      {RINGS.map((x) => (
        <mesh key={x} geometry={ringShape} material={ringLook} position={[x, 0, 0]} />
      ))}
    </>
  )
}

// A bar on the move: where `at` says (its middle), knocking back whoever it hits
function MovingBar({ at, posts = 0 }: { at: (t: number) => Vec3; posts?: number }) {
  const body = useRef<RapierRigidBody>(null)
  useKinematic(body, (t) => ({ position: at(t) }), 'hazard')
  const knock = knockOnHit((p) => {
    sfx.knock()
    const bar = at(raceClock())
    return { x: 0, y: 4.5, z: p.z > bar.z ? 6.5 : -6.5 }
  })
  const start = at(0)
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, start.y, start.z]} onCollisionEnter={knock}>
      <CuboidCollider args={[BAR.reach, BAR.radius, BAR.radius]} />
      <BarLook />
      {/* (Short posts that slide along with it, outside the rails) */}
      {posts > 0 &&
        [-1, 1].map((s) => (
          <mesh key={s} material={postLook} position={[s * POST_X, -posts / 2 + 0.2, 0]} castShadow>
            <boxGeometry args={[0.36, posts, 0.36]} />
          </mesh>
        ))}
    </RigidBody>
  )
}

// 1. The hurdles
export function Hurdles() {
  return (
    <group>
      {HURDLES.map((h, i) => (
        <group key={i}>
          <MovingBar
            at={(t) => ({ x: 0, y: HURDLE_Y, z: h.z + h.reach * Math.sin((t / h.period) * Math.PI * 2 + h.offset) })}
            posts={HURDLE_Y + 0.25}
          />
          {/* The grooves the posts slide in */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={paint('#2c2f3a')} position={[s * POST_X, 0.02, h.z]} receiveShadow>
              <boxGeometry args={[0.5, 0.06, h.reach * 2 + 0.8]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// 2. The gates: a frame of teal posts and a beam over the top, the bar between the posts
const FRAME_TOP = GATE_TOP + BAR.radius * 2 + 0.6
function Frame({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} material={postLook} position={[s * POST_X, FRAME_TOP / 2, 0]} castShadow>
          <boxGeometry args={[0.44, FRAME_TOP, 0.44]} />
        </mesh>
      ))}
      <mesh material={postLook} position={[0, FRAME_TOP, 0]} castShadow>
        <boxGeometry args={[BAR_LENGTH + 0.44, 0.4, 0.44]} />
      </mesh>
    </group>
  )
}
export function Gates() {
  return (
    <group>
      {GATES.map((g, i) => {
        // (Its middle: underside at GATE_GAP; a bobbing one goes up to GATE_TOP and back, over `bob` seconds)
        const low = GATE_GAP + BAR.radius
        const at = (t: number): Vec3 => ({
          x: 0,
          y: g.bob > 0 ? low + ((GATE_TOP - GATE_GAP) * (1 - Math.cos((t / g.bob) * Math.PI * 2 + g.offset))) / 2 : low,
          z: g.z,
        })
        return (
          <group key={i}>
            <MovingBar at={at} />
            <Frame z={g.z} />
            {g.hurdle !== undefined && <MovingBar at={() => ({ x: 0, y: HURDLE_Y, z: g.hurdle! })} posts={HURDLE_Y + 0.25} />}
          </group>
        )
      })}
    </group>
  )
}

// The yellow rails along a deck's edges: low enough to see over, high enough not to stumble off the side
export function Rails({ box }: { box: Box }) {
  const length = box.max[2] - box.min[2]
  const z = (box.max[2] + box.min[2]) / 2
  const look = useMemo(() => paint(COLORS.rail), [])
  return (
    <group>
      {[-1, 1].map((s) => (
        <RigidBody key={s} type="fixed" colliders={false} position={[s * (HALF + 0.15), 0.28, z]}>
          <CuboidCollider args={[0.15, 0.28, length / 2]} />
          <mesh material={look} castShadow receiveShadow>
            <boxGeometry args={[0.3, 0.56, length]} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  )
}
