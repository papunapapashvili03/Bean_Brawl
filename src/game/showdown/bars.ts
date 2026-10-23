import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { P3 } from './layout'

// Geometry helpers for Neon Showdown: glowing bars (lines of light) and plain boxes, merged so a whole set of
// them draws in one go.

const pivot = new THREE.Object3D()

// A bar from a to b, `width` across and `height` tall (a to b should not be vertical)
export function barGeometry(a: P3, b: P3, width: number, height: number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  pivot.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  pivot.lookAt(b[0], b[1], b[2])
  pivot.updateMatrix()
  return new THREE.BoxGeometry(width, height, length + width * 0.5).applyMatrix4(pivot.matrix)
}

export function bars(segments: [P3, P3][], width: number, height: number) {
  return merged(segments.map(([a, b]) => barGeometry(a, b, width, height)))
}

export const boxGeometry = (min: P3, max: P3) =>
  new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]).translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)

// The four edges round the top of a box (and its bottom, with `bottom`), as bar segments
export function boxRim(min: P3, max: P3, y = max[1]): [P3, P3][] {
  const c: P3[] = [
    [min[0], y, min[2]],
    [max[0], y, min[2]],
    [max[0], y, max[2]],
    [min[0], y, max[2]],
  ]
  return c.map((p, i) => [p, c[(i + 1) % 4]])
}

// Merge geometries of any kind (indexed or not) into one
export function merged(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    n.clearGroups()
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name)
    return n
  })
  return mergeGeometries(flat)!
}
