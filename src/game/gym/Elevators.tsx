import { useMemo, useRef } from 'react'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import { useGrabEdges, type GrabEdge } from '../grab'
import { TapedRod } from '../GripTape'
import { useKinematic } from '../race/kinematic'
import { paint } from '../race/materials'
import { STEP, raceClock } from '../race/race'
import { COLUMN, COLUMNS, WALL_APPROACH, columnRise as topVy, columnTop as topY } from './course'

// 2. Elevator Columns: square columns over a pit, each bobbing up and down on its own beat. Every top edge is
// a moving ledge (see ../grab): catch one that's above you and pull yourself up; it carries you along while
// you hang. Timed off the match clock, so the columns sit in the same place for everyone.

type P3 = [number, number, number]
type Column = (typeof COLUMNS)[number]


const HALF = COLUMN.size / 2
// Each side's corners relative to the column's middle, and which way is out from it
const SIDES = [
  { a: [-1, 1], b: [1, 1], out: { x: 0, z: 1 } },
  { a: [-1, -1], b: [1, -1], out: { x: 0, z: -1 } },
  { a: [1, -1], b: [1, 1], out: { x: 1, z: 0 } },
  { a: [-1, -1], b: [-1, 1], out: { x: -1, z: 0 } },
] as const
const RIM_TAPE = SIDES.map((s) => ({
  a: [s.a[0] * HALF, COLUMN.length / 2, s.a[1] * HALF] as P3,
  b: [s.b[0] * HALF, COLUMN.length / 2, s.b[1] * HALF] as P3,
}))

// Module-level, so the physics step can move them in place
const rims: GrabEdge[][] = COLUMNS.map((c) =>
  SIDES.map((s) => ({
    kind: 'ledge',
    a: { x: c.x + s.a[0] * HALF, y: topY(c, 0), z: c.z + s.a[1] * HALF },
    b: { x: c.x + s.b[0] * HALF, y: topY(c, 0), z: c.z + s.b[1] * HALF },
    out: s.out,
    vel: { x: 0, y: 0, z: 0 },
  })),
)

// The exit deck's front edge, for a last jump that falls short
const EXIT_LIP = { a: [WALL_APPROACH.min[0], 0, WALL_APPROACH.max[2]] as P3, b: [WALL_APPROACH.max[0], 0, WALL_APPROACH.max[2]] as P3 }
const EXIT_EDGE: GrabEdge[] = [
  { kind: 'ledge', a: { x: EXIT_LIP.a[0], y: 0, z: EXIT_LIP.a[2] }, b: { x: EXIT_LIP.b[0], y: 0, z: EXIT_LIP.b[2] }, out: { x: 0, z: 1 } },
]

function ElevatorColumn({ column, index }: { column: Column; index: number }) {
  const body = useRef<RapierRigidBody>(null)
  const centreY = (t: number) => topY(column, t) - COLUMN.length / 2
  useKinematic(body, (t) => ({ position: { x: column.x, y: centreY(t), z: column.z } }))
  const edges = rims[index]
  useGrabEdges(edges)
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    const y = topY(column, t)
    const vy = topVy(column, t)
    for (const e of edges) {
      e.a.y = e.b.y = y
      e.vel!.y = vy
    }
  })
  const materials = useMemo(() => {
    const side = paint(column.color)
    return [side, side, paint('#fff4fb'), side, side, side]
  }, [column.color])
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[column.x, centreY(0), column.z]}>
      <CuboidCollider args={[HALF, COLUMN.length / 2, HALF]} />
      <mesh material={materials} castShadow receiveShadow>
        <boxGeometry args={[COLUMN.size, COLUMN.length, COLUMN.size]} />
      </mesh>
      {/* A ring of the column's colour on its top, so you can tell them apart from above */}
      <mesh position={[0, COLUMN.length / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={paint(column.color)}>
        <ringGeometry args={[0.55, 0.85, 4, 1, Math.PI / 4]} />
      </mesh>
      {RIM_TAPE.map((r, i) => (
        <TapedRod key={i} a={r.a} b={r.b} />
      ))}
    </RigidBody>
  )
}

export function ElevatorColumns() {
  useGrabEdges(EXIT_EDGE)
  return (
    <>
      {COLUMNS.map((c, i) => (
        <ElevatorColumn key={i} column={c} index={i} />
      ))}
      <TapedRod a={EXIT_LIP.a} b={EXIT_LIP.b} />
    </>
  )
}
