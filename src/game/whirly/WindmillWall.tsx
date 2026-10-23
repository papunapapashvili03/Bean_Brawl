import { useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges } from '../grab'
import { TapedRod } from '../GripTape'
import { knockOnHit } from '../playerContact'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { sfx } from '../race/sound'
import { Holds } from './Climb'
import { COLORS, HALF, TOP_2, WINDMILL, WINDMILL_WALL, WINDMILLS } from './course'
import { climbEdges, holdSpots } from './holds'

// 6. Windmill Wall: the wall top deck's front face, from the fan deck's height up, a climbing wall right
// across the course: holds all over it (hop hold to hold with Space, steer with A/D) and a taped ledge along
// its top. Over its top three windmills turn just in front of it, their sails sweeping down across the top
// rows and the ledge: time the last hop and the pull over the top, or be knocked off the wall.

type P3 = [number, number, number]
type Mill = (typeof WINDMILLS)[number]
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const SAILS = Array.from({ length: WINDMILL.sails }, (_, k) => (k * Math.PI * 2) / WINDMILL.sails)

const HOLDS = holdSpots(WINDMILL_WALL.rows, WINDMILL_WALL.columns, 31)
const LEDGE: { a: P3; b: P3 } = { a: [-HALF, TOP_2, WINDMILL_WALL.face], b: [HALF, TOP_2, WINDMILL_WALL.face] }
const EDGES = climbEdges(HOLDS, [LEDGE], WINDMILL_WALL.face)

function Windmill({ mill }: { mill: Mill }) {
  const body = useRef<RapierRigidBody>(null)
  const turn = useMemo(() => new THREE.Quaternion(), [])
  const hub = { x: mill.x, y: WINDMILL.hubY, z: WINDMILL_WALL.face + WINDMILL.out }
  useKinematic(body, (t) => ({ position: hub, rotation: turn.setFromAxisAngle(Z_AXIS, mill.offset + mill.spin * t) }), 'hazard')
  // Knocked off the wall: away from it, and the way the sail's going
  const knock = knockOnHit((p) => {
    sfx.knock()
    const vx = -mill.spin * (p.y - hub.y)
    return { x: Math.max(-6, Math.min(6, vx * 1.2)), y: 2, z: 7 }
  })
  const half = WINDMILL.radius / 2
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[hub.x, hub.y, hub.z]} onCollisionEnter={knock}>
      {SAILS.map((a) => (
        <group key={a} rotation={[0, 0, a]}>
          <CuboidCollider args={[half - 0.25, WINDMILL.sail / 2, WINDMILL.thick / 2]} position={[half + 0.25, 0, 0]} />
          {/* A sail: a pink frame round a white lattice */}
          <mesh material={paint(COLORS.pink)} position={[half + 0.25, 0, 0]} castShadow>
            <boxGeometry args={[WINDMILL.radius - 0.5, WINDMILL.sail, WINDMILL.thick]} />
          </mesh>
          {[0.35, 0.55, 0.75, 0.95].map((f) => (
            <mesh key={f} material={paint('#ffffff')} position={[WINDMILL.radius * f, 0, 0]}>
              <boxGeometry args={[0.12, WINDMILL.sail + 0.02, WINDMILL.thick + 0.02]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh material={paint(COLORS.trim)} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.6, 20]} />
      </mesh>
    </RigidBody>
  )
}

// What each windmill turns on: an axle back from its hub to a post standing on the wall's top, a little way
// back from the edge (it doesn't turn)
const POST_BACK = 1.6
function Axle({ x }: { x: number }) {
  const back = WINDMILL_WALL.face - POST_BACK
  const length = WINDMILL.out + POST_BACK
  const yellow = paint(COLORS.trim)
  return (
    <group>
      <mesh material={yellow} position={[x, WINDMILL.hubY, WINDMILL_WALL.face + WINDMILL.out - length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, length, 12]} />
      </mesh>
      <RigidBody type="fixed" colliders={false} position={[x, (TOP_2 + WINDMILL.hubY) / 2, back]}>
        <CuboidCollider args={[0.22, (WINDMILL.hubY - TOP_2) / 2 + 0.2, 0.22]} />
        <mesh material={yellow} castShadow>
          <boxGeometry args={[0.44, WINDMILL.hubY - TOP_2 + 0.4, 0.44]} />
        </mesh>
      </RigidBody>
    </group>
  )
}

export function WindmillWall() {
  useGrabEdges(EDGES)
  return (
    <group>
      <Holds holds={HOLDS} face={WINDMILL_WALL.face} />
      <TapedRod a={LEDGE.a} b={LEDGE.b} />
      {WINDMILLS.map((m, i) => (
        <group key={i}>
          <Windmill mill={m} />
          <Axle x={m.x} />
        </group>
      ))}
    </group>
  )
}
