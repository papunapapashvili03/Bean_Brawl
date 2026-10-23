import type { Vec3 } from '../playerContact'

// EXPERIMENTAL: what shots can hit. The contract between the guns (shooters) and anything that takes
// damage (the training dummies), so either side can be removed without breaking the other.

// A character-sized target: the player's capsule (centre 1 above the feet, half-height 0.5, radius 0.5)
export const TARGET_BODY = { halfHeight: 0.5, radius: 0.5 }
// Hits more than this above the capsule centre are on the head: the bean's top dome, from the mouth up
export const HEAD_ABOVE_CENTRE = 0.3

// Who fired a shot (bots say; the player's own shots and blasts come with no shooter)
export type Shooter = { name: string; team: string }

export type Target = {
  collider: number // handle of the target's collider, as a ray reports it
  centre: () => Vec3 // capsule centre in world space
  alive: () => boolean // eliminated targets take no hits, and shots pass through them
  team?: string // which side it's on, if any (shots don't hurt a shooter's own side)
  hit: (damage: number, headshot: boolean, from?: Shooter) => void
}

const byCollider = new Map<number, Target>()

export function registerTarget(target: Target) {
  byCollider.set(target.collider, target)
  return () => {
    if (byCollider.get(target.collider) === target) byCollider.delete(target.collider)
  }
}

export function targetFor(colliderHandle: number) {
  return byCollider.get(colliderHandle)
}

export function allTargets(): Iterable<Target> {
  return byCollider.values()
}

export function isHeadshot(target: Target, point: Vec3) {
  return point.y - target.centre().y > HEAD_ABOVE_CENTRE
}

// How far a point is from the surface of a target's body (0 inside it), for blast damage falloff
export function distanceToBody(target: Target, p: Vec3) {
  const c = target.centre()
  const along = Math.max(-TARGET_BODY.halfHeight, Math.min(TARGET_BODY.halfHeight, p.y - c.y))
  const d = Math.hypot(p.x - c.x, p.y - (c.y + along), p.z - c.z)
  return Math.max(0, d - TARGET_BODY.radius)
}

// A blast at `point`: every live target within `radius` takes damage falling off from `max` at the centre to
// nothing at the edge (measured to the surface of its body). `skip`: one already hit directly.
export function blastDamage(point: Vec3, radius: number, max: number, skip?: Target) {
  for (const target of allTargets()) {
    if (target === skip || !target.alive()) continue
    const d = distanceToBody(target, point)
    if (d >= radius) continue
    const amount = Math.round(max * (1 - d / radius))
    if (amount > 0) target.hit(amount, false)
  }
}
