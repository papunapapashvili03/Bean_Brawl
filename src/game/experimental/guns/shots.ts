import type { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { activePlayerPosition, activePlayerHandle } from '../../playerContact'
import { targetFor } from '../combat'

// Ray casts for shots: they ignore the shooter and pass through eliminated targets

type Physics = ReturnType<typeof useRapier>
export type ShotHit = { point: THREE.Vector3; collider: number }

export function castShot({ world, rapier }: Physics, origin: THREE.Vector3, dir: THREE.Vector3, range: number): ShotHit | null {
  const handle = activePlayerHandle()
  const shooter = handle === null ? undefined : world.getRigidBody(handle)
  const hit = world.castRay(
    new rapier.Ray(origin, dir),
    range,
    true,
    undefined,
    undefined,
    undefined,
    shooter,
    (collider) => {
      const target = targetFor(collider.handle)
      return !target || target.alive()
    },
  )
  if (!hit) return null
  return { point: origin.clone().addScaledVector(dir, hit.timeOfImpact), collider: hit.collider.handle }
}

// Start a camera ray level with the player rather than at the camera, so nothing between the camera and
// the player (or the player itself) can block the shot
export function rayStart(camera: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) {
  const p = activePlayerPosition()
  const along = p ? Math.max(0, (p.x - camera.x) * dir.x + (p.y - camera.y) * dir.y + (p.z - camera.z) * dir.z) : 0
  return out.copy(camera).addScaledVector(dir, along)
}
