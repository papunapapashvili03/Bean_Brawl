import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { allRunners } from '../playerContact'
import { setTimetabled, timetableChanged } from '../race/kinematic'
import { paint } from '../race/materials'
import { STEP, surfaces } from '../race/race'
import { COLORS, PLANK, SEESAWS } from './course'

// 3. The seesaws: planks out over the sky, each on an axle across its middle. Each tips towards whichever end
// has the most weight on it (everyone on it counts, the further out the more), springing back level when
// it's left alone; tipped, it's a slope to slide down. The bots go by how each is tipped now (it's on the
// timetable as staying just as it is, and they look again a few times a second).

const PULL = 0.38 // how hard a runner standing at the very end tips it (its tilt there, on its own, about the most it goes)
const SPRING = 4 // back towards level
const DAMP = 3
const SLIDE = 7 // m/s downhill at a 1-radian tilt
const RETHINK = 6 // steps between the bots looking again

type Seesaw = (typeof SEESAWS)[number]
const X_AXIS = new THREE.Vector3(1, 0, 0)

// Tilt (radians: + tips the +z end down) and how fast it's tipping, per plank
const tilts = SEESAWS.map(() => ({ tilt: 0, spin: 0, q: new THREE.Quaternion() }))

function Plank({ seesaw, index }: { seesaw: Seesaw; index: number }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const shown = useRef<THREE.Group>(null)

  // On the timetable as it is now; and a slope to slide down
  useEffect(() => {
    const b = body.current
    const c = collider.current
    if (!b || !c) return
    const state = tilts[index]
    state.tilt = state.spin = 0
    state.q.identity()
    const position = { x: seesaw.x, y: 0, z: seesaw.z }
    setTimetabled(b.handle, { pose: () => ({ position, rotation: state.q }), hazard: false })
    surfaces.set(c.handle, () => ({ x: 0, z: SLIDE * Math.sin(state.tilt) }))
    return () => {
      setTimetabled(b.handle, null)
      surfaces.delete(c.handle)
    }
  }, [seesaw, index])

  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const state = tilts[index]
    // Everyone standing on it, and how far along it from the axle (+: towards its +z end)
    const s = Math.sin(state.tilt)
    const c = Math.cos(state.tilt)
    let weight = 0
    for (const r of allRunners()) {
      const p = r.position()
      const dx = p.x - seesaw.x
      if (Math.abs(dx) > seesaw.width / 2 + 0.25) continue
      const along = (p.z - seesaw.z) / c
      if (Math.abs(along) > PLANK.length / 2 + 0.25) continue
      const feet = p.y - 1
      if (Math.abs(feet + along * s) > 0.55) continue
      weight += along / (PLANK.length / 2)
    }
    state.spin += (PULL * SPRING * weight - SPRING * state.tilt - DAMP * state.spin) * STEP
    state.tilt += state.spin * STEP
    if (Math.abs(state.tilt) > PLANK.maxTilt) {
      state.tilt = Math.sign(state.tilt) * PLANK.maxTilt
      state.spin = 0
    }
    state.q.setFromAxisAngle(X_AXIS, state.tilt)
    b.setNextKinematicRotation(state.q)
  })
  useFrame(() => {
    if (shown.current) shown.current.quaternion.copy(tilts[index].q)
  })

  const top = paint(COLORS.plank)
  const side = paint(COLORS.plankSide)
  return (
    <group position={[seesaw.x, 0, seesaw.z]}>
      <RigidBody ref={body} type="kinematicPosition" colliders={false}>
        <CuboidCollider ref={collider} args={[seesaw.width / 2, PLANK.thickness / 2, PLANK.length / 2]} position={[0, -PLANK.thickness / 2, 0]} friction={0.8} />
      </RigidBody>
      <group ref={shown}>
        <mesh material={[side, side, top, side, side, side]} position={[0, -PLANK.thickness / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[seesaw.width, PLANK.thickness, PLANK.length]} />
        </mesh>
        {/* White ends, to see which way it's tipping */}
        {[-1, 1].map((e) => (
          <mesh key={e} material={paint('#ffffff')} position={[0, 0.005, e * (PLANK.length / 2 - 0.3)]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[seesaw.width, 0.35]} />
          </mesh>
        ))}
      </group>
      {/* The axle, and the pylon it turns on, down into the clouds */}
      <mesh material={paint(COLORS.rail)} position={[0, -PLANK.thickness - 0.25, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.28, 0.28, seesaw.width + 0.3, 16]} />
      </mesh>
      <mesh material={paint(COLORS.post)} position={[0, -PLANK.thickness - 4, 0]}>
        <boxGeometry args={[0.5, 7.4, 0.5]} />
      </mesh>
    </group>
  )
}

// (The bots look again at how the planks are tipped, every so often)
function Rethink() {
  const steps = useRef(0)
  useBeforePhysicsStep(() => {
    if (++steps.current % RETHINK === 0) timetableChanged()
  })
  return null
}

export function Seesaws() {
  return (
    <group>
      {SEESAWS.map((s, i) => (
        <Plank key={i} seesaw={s} index={i} />
      ))}
      <Rethink />
    </group>
  )
}
