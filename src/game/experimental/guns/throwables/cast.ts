import type { useRapier } from '@react-three/rapier'
import { activePlayerHandle } from '../../../playerContact'
import { targetFor } from '../../combat'

export type Physics = ReturnType<typeof useRapier>
export type Ray = InstanceType<Physics['rapier']['Ray']>
type V = { x: number; y: number; z: number }
export type Hit = { timeOfImpact: number; normal: V }

// A ray from `from` along `along` (a unit vector) up to `length`, for things thrown: it ignores the player
// (who throws them), trigger zones and eliminated targets. Reports how far along it hit, and the surface's
// normal there.
export function cast(physics: Physics, ray: Ray, from: V, along: V, length: number): Hit | null {
  ray.origin = { x: from.x, y: from.y, z: from.z }
  ray.dir = { x: along.x, y: along.y, z: along.z }
  const handle = activePlayerHandle()
  const player = handle === null ? undefined : physics.world.getRigidBody(handle)
  return physics.world.castRayAndGetNormal(
    ray,
    length,
    true,
    physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    player,
    (collider) => {
      const target = targetFor(collider.handle)
      return !target || target.alive()
    },
  )
}
