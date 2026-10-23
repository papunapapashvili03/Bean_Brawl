import type { FireSpec } from './catalog'

// Where a shotgun's pellets go, inside the cone of its spread (the circle round the reticle)

type Pellets = NonNullable<FireSpec['pellets']>

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Pellet `i` of a shot: how far out from the aim (the tangent of its angle off it) and which way round.
// Scattered at random through the cone, or (`even`) spread evenly over all of it in a sunflower pattern,
// turned by `turn` (pick one at random per shot) and shaken a little so no two shots look the same.
export function pelletOffset(p: Pellets, i: number, turn: number): [number, number] {
  if (!p.even) return [Math.tan(p.spread * Math.sqrt(Math.random())), Math.random() * Math.PI * 2]
  const out = Math.min(1, Math.sqrt((i + 0.5) / p.count) * (0.94 + Math.random() * 0.1))
  return [Math.tan(p.spread * out), turn + i * GOLDEN_ANGLE + (Math.random() - 0.5) * 0.25]
}
