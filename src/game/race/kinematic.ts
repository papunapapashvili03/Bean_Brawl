import { useEffect, useRef, type RefObject } from 'react'
import { interactionGroups, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import type * as THREE from 'three'
import type { Vec3 } from '../playerContact'
import { STEP, raceClock } from './race'

export type Pose = { position: Vec3; rotation?: THREE.Quaternion }

// Every body moved on a timetable, by its handle: where it will be at any time on the match clock (the pose
// may be an object that's reused: copy what you need), and whether touching it is trouble ('hazard': it
// knocks runners about) or it's something to stand on ('floor'). Bots look ahead with this (./bots/predict).
export type Timetabled = { pose: (t: number) => Pose; hazard: boolean }
export const timetabled = new Map<number, Timetabled>()
// Counts every change to the list above, so anything worked out from it knows when to start again
let changes = 0
export const timetabledVersion = () => changes
export function setTimetabled(handle: number, entry: Timetabled | null) {
  if (entry) timetabled.set(handle, entry)
  else timetabled.delete(handle)
  changes++
}

// Kinematic bodies that stand where they are (or near enough) until they go, by handle: when each goes (match
// clock; Infinity if it never does). Bots see these where they stand, and stop counting on one a moment
// before it goes. (Kinematic bodies not on this list, or the timetable above, they don't see at all.)
export const standing = new Map<number, () => number>()

// A fixed body on a timetable (one that comes and goes without moving: its collider is switched on and off)
// gives its collider these groups, and anything looking only for what stays put leaves them out
export const COMES_AND_GOES = interactionGroups(1)
export const NOT_COMES_AND_GOES = 0xfffffffd // every group but that one

// Put a body on the timetable: says where it will be, without moving it
export function useTimetable(body: RefObject<RapierRigidBody | null>, pose: (t: number) => Pose, kind: 'floor' | 'hazard' = 'floor') {
  const latest = useRef(pose)
  useEffect(() => {
    latest.current = pose
  })
  useEffect(() => {
    const handle = body.current?.handle
    if (handle === undefined) return
    setTimetabled(handle, { pose: (t) => latest.current(t), hazard: kind === 'hazard' })
    return () => setTimetabled(handle, null)
  }, [body, kind])
}

// Drive a kinematic body from the match clock. Runs before every fixed physics step, so each obstacle
// sits exactly where its timetable says at every step, no matter the frame rate.
export function useKinematic(body: RefObject<RapierRigidBody | null>, pose: (t: number) => Pose, kind: 'floor' | 'hazard' = 'floor') {
  useTimetable(body, pose, kind)
  useBeforePhysicsStep(() => {
    const rb = body.current
    if (!rb) return
    const p = pose(raceClock() + STEP)
    rb.setNextKinematicTranslation(p.position)
    if (p.rotation) rb.setNextKinematicRotation(p.rotation)
  })
}
