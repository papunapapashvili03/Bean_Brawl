import * as THREE from 'three'

type Point = [number, number, number]

// A piece of a ring of floor: between radii r0 and r1, angles phi0 to phi1 (round the y axis from +z),
// `thickness` deep with its top at `top`. Built round its own middle (where the piece sits), so it can
// shake and tumble about itself; `hull` is the convex outline for its collider (the inner arc is so shallow
// over a narrow sector that its hull hardly differs), and `top` a flat copy of its upper face.
export function sectorPiece(r0: number, r1: number, phi0: number, phi1: number, top: number, thickness: number) {
  const phiC = (phi0 + phi1) / 2
  const rC = (r0 + r1) / 2
  const cx = rC * Math.sin(phiC)
  const cz = rC * Math.cos(phiC)
  const steps = Math.max(2, Math.ceil((Math.abs(phi1 - phi0) * r1) / 1.2))
  const outline: THREE.Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const phi = phi0 + ((phi1 - phi0) * i) / steps
    outline.push(new THREE.Vector2(r1 * Math.sin(phi) - cx, r1 * Math.cos(phi) - cz))
  }
  for (let i = steps; i >= 0; i--) {
    const phi = phi0 + ((phi1 - phi0) * i) / steps
    outline.push(new THREE.Vector2(r0 * Math.sin(phi) - cx, r0 * Math.cos(phi) - cz))
  }
  const shape = new THREE.Shape(outline)
  // Shape (x, z) extruded down: rotating a quarter turn about x lays it flat with its top at y 0
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).rotateX(Math.PI / 2)
  const hull = new Float32Array(outline.flatMap((p) => [p.x, 0, p.y, p.x, -thickness, p.y]))
  const topFace = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2).translate(0, 0.03, 0)
  return { geometry, hull, topFace, position: [cx, top, cz] as Point }
}

const boxes = new Map<string, THREE.BoxGeometry>()
export function box(w: number, h: number, d: number) {
  const key = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`
  let g = boxes.get(key)
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    boxes.set(key, g)
  }
  return g
}

// A slab whose top surface runs from `from` to `to` (on its centre line): where its box sits and how it's
// turned (as Euler angles, which rigid bodies take), and how long it is
export function slab(from: Point, to: Point, thickness: number) {
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const pivot = new THREE.Object3D()
  pivot.position.copy(a).add(b).multiplyScalar(0.5)
  pivot.lookAt(b)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion)
  pivot.position.addScaledVector(up, -thickness / 2)
  const e = new THREE.Euler().setFromQuaternion(pivot.quaternion)
  return { position: pivot.position.toArray() as Point, rotation: [e.x, e.y, e.z] as Point, length: a.distanceTo(b) }
}

// A piece of a spiral ramp between radii r0 and r1, from angle phi0 (top at height y0) round to phi1 (at y1),
// `thickness` deep: its top is a true helicoid (level along every radius, climbing round the axis). Built round
// its own middle, like sectorPiece. `vertices` and `indices` are the exact mesh, for a trimesh collider: the
// top twists (it's steeper on the inside than the outside), so a convex hull would stand proud of it.
export function spiralPiece(r0: number, r1: number, phi0: number, phi1: number, y0: number, y1: number, thickness: number) {
  const phiC = (phi0 + phi1) / 2
  const rC = (r0 + r1) / 2
  const centre = new THREE.Vector3(rC * Math.sin(phiC), (y0 + y1) / 2, rC * Math.cos(phiC))
  const steps = Math.max(2, Math.ceil((Math.abs(phi1 - phi0) * r1) / 0.8))
  // The cross-section's corners (radius, height below the top), in order round it: top outer, top inner,
  // bottom inner, bottom outer. Each face runs between two neighbouring corners, all the way along.
  const corners: [number, number][] = [
    [r1, 0],
    [r0, 0],
    [r0, -thickness],
    [r1, -thickness],
  ]
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const at = (i: number, [r, dy]: [number, number]) => {
    const phi = phi0 + ((phi1 - phi0) * i) / steps
    const y = y0 + ((y1 - y0) * i) / steps + dy
    return new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi)).sub(centre)
  }
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const n = new THREE.Vector3()
  // A triangle, wound so it faces `out`
  const triangle = (i0: number, i1: number, i2: number, out: THREE.Vector3) => {
    const p = (k: number) => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2])
    const p0 = p(i0)
    n.crossVectors(a.subVectors(p(i1), p0), b.subVectors(p(i2), p0))
    if (n.dot(out) >= 0) indices.push(i0, i1, i2)
    else indices.push(i0, i2, i1)
  }
  const add = (v: THREE.Vector3, u: number, w: number) => {
    positions.push(v.x, v.y, v.z)
    uvs.push(u, w)
    return positions.length / 3 - 1
  }
  // The four long faces: textures in metres (along the arc, and across or up)
  for (let f = 0; f < 4; f++) {
    const c0 = corners[f]
    const c1 = corners[(f + 1) % 4]
    const flat = f === 0 || f === 2
    const first = positions.length / 3
    for (let i = 0; i <= steps; i++) {
      const along = rC * (((phi1 - phi0) * i) / steps)
      add(at(i, c0), along, flat ? c0[0] : c0[1])
      add(at(i, c1), along, flat ? c1[0] : c1[1])
    }
    for (let i = 0; i < steps; i++) {
      const phi = phi0 + ((phi1 - phi0) * (i + 0.5)) / steps
      const radial = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi))
      const out = f === 0 ? new THREE.Vector3(0, 1, 0) : f === 1 ? radial.negate() : f === 2 ? new THREE.Vector3(0, -1, 0) : radial
      const k = first + i * 2
      triangle(k, k + 1, k + 2, out)
      triangle(k + 1, k + 3, k + 2, out)
    }
  }
  // The two ends
  for (const i of [0, steps]) {
    const phi = phi0 + ((phi1 - phi0) * i) / steps
    const tangent = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)).multiplyScalar(Math.sign(phi1 - phi0))
    const out = i === 0 ? tangent.negate() : tangent
    const k = corners.map((c) => add(at(i, c), c[0], c[1]))
    triangle(k[0], k[1], k[2], out)
    triangle(k[0], k[2], k[3], out)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return {
    geometry,
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    position: centre.toArray() as Point,
  }
}
