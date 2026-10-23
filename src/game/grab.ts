import { useEffect } from 'react'
import type { Vec3 } from './playerContact'

// Things the player can hang from. Each is a horizontal grab line from `a` to `b` in world space.
//  - ledge: the top front edge of a wall. Jump pulls you up onto it.
//  - hold: a small handhold on a climbing wall. Jump hops you upwards (A/D steer) to catch the next one.
//  - bar: a free-hanging bar you hang beneath. Jump flings you in the direction you're pushing.
//  - zip: a zip line, sloping down from `a` to `b`. Hang on and you slide down it; you let go at the bottom
//    (or sooner, with Space or Shift), carried on by the speed.
export type GrabKind = 'ledge' | 'hold' | 'bar' | 'zip'

export type GrabEdge = {
  kind: GrabKind
  a: Vec3
  b: Vec3 // same height as `a` (a zip line's low end)
  // Horizontal unit vector pointing away from the wall, towards where the hanging body goes.
  // For bars it is just the side you approach from; either side works.
  out: { x: number; z: number }
  // Moving edges (e.g. on a bobbing platform): the owner updates a, b and vel in place before each physics
  // step, and a hanging body is carried along with them
  vel?: Vec3
}

const edges = new Set<GrabEdge>()

export function grabEdges(): Iterable<GrabEdge> {
  return edges
}

// Register grab lines while the calling component is mounted. Pass a stable (memoised or module-level) array.
export function useGrabEdges(list: readonly GrabEdge[]) {
  useEffect(() => {
    for (const e of list) edges.add(e)
    return () => {
      for (const e of list) edges.delete(e)
    }
  }, [list])
}
