import { useSyncExternalStore, type ComponentType } from 'react'
import * as THREE from 'three'

// Something in the character's hands. Whoever owns the item sets it here; the character draws it on its
// body (so it bobs, leans and turns along) and reaches its hands to the given points.
//
// Everything is in the character's body space: face towards +z, up +y, and the character's own right
// hand on the -x side. Hand targets should sit within about one arm length (0.34) of the shoulders,
// which roll forward to about (±0.38, 0.06, 0.2) while holding.
//
// The pose fields are read every frame, so the owner can change them in place to animate (e.g. blend
// between carrying and aiming) without re-rendering.
export type Held = {
  Item: ComponentType
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  right: THREE.Vector3 | null // where the right hand grips, or null to leave that arm free
  left: THREE.Vector3 | null
  twist: number // turn the bean on its legs by this much (radians, + turns the front towards +x)
  lookAround: number // slide the face (and anything worn on it) round the bean by this much
  yaw: number | null // face this world direction instead of the way you're moving (null: movement)
  cameraZoom: number // 1 = normal follow distance; smaller pulls the camera in
  cameraShift: number // move the camera sideways, to the right (metres), e.g. over the shoulder
  cameraKickPitch: number // recoil: tilt the view up by this much (radians), on top of where it looks
  cameraKickYaw: number // recoil: turn the view sideways by this much (radians, + to the left)
  cameraPitchMin: number | null // let the camera look further up than usual (e.g. to aim), or null
  cameraMagnify: number // 1 = normal view; 4 narrows it to a quarter (a 4x scope), and slows dragging to match
  cameraFollow: number // how quickly the camera catches up with where it should be (per second; normally 5)
}

export function newHeld(Item: ComponentType): Held {
  return {
    Item,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    right: null,
    left: null,
    twist: 0,
    lookAround: 0,
    yaw: null,
    cameraZoom: 1,
    cameraShift: 0,
    cameraKickPitch: 0,
    cameraKickYaw: 0,
    cameraPitchMin: null,
    cameraMagnify: 1,
    cameraFollow: 5,
  }
}

let held: Held | null = null
const listeners = new Set<() => void>()

export function setHeld(item: Held | null) {
  held = item
  listeners.forEach((l) => l())
}

// For per-frame readers outside React rendering (the camera)
export function getHeld() {
  return held
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useHeld() {
  return useSyncExternalStore(subscribe, () => held)
}
