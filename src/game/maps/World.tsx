import { useMemo } from 'react'
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGrabEdges, type GrabEdge } from '../grab'
import { pieceGeometry, worldUV, type Hull, type Piece, type Ramp, type Zone } from './kit'
import { material, type MatKey } from './textures'

// A gunfight map's ground and everything built on it: all fixed, drawn as one mesh per material, with a box
// collider per block, a slope under each flight of stairs and a hull for each pitched roof.

export type MapData = {
  outline: [number, number][] // the ground inside the walls (paved)
  zones: Zone[] // laid over the paving, in order
  pieces: Piece[]
  ramps: Ramp[]
  hulls: Hull[]
  edges: GrabEdge[] // what can be caught and climbed
  ground?: MatKey // under everything inside the walls (paving if not given)
}

// ---------------------------------------------------------------------------------------------------------
// Ground: paving everywhere inside the walls, with grass, asphalt, gravel and stone laid over it

// A flat shape on the ground (outline points are (x, z)), facing up, textured in metres
function flat(points: [number, number][], holes: [number, number][][] = [], y = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)))
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))))
  return worldUV(new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2).translate(0, y, 0))
}
const circle = (cx: number, cz: number, r: number, n = 64): [number, number][] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cz + r * Math.sin((i / n) * Math.PI * 2)])

function zoneGeometry(zone: Zone, y: number) {
  if (zone.ring) {
    const { centre, r0, r1 } = zone.ring
    return flat(circle(centre[0], centre[1], r1), r0 > 0 ? [circle(centre[0], centre[1], r0).reverse()] : [], y)
  }
  return flat(zone.outline!, [], y)
}

function Ground({ outline, zones, ground = 'paving' }: Pick<MapData, 'outline' | 'zones' | 'ground'>) {
  const layers = useMemo(
    () => [{ mat: ground, geometry: flat(outline, [], 0) }, ...zones.map((z, i) => ({ mat: z.mat, geometry: zoneGeometry(z, 0.006 + i * 0.002) }))],
    [outline, zones, ground],
  )
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[48, 0.5, 44]} position={[0, -0.5, 0]} />
      </RigidBody>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geometry} material={material(l.mat)} receiveShadow />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The blocks

export function Blocks({ pieces, ramps, hulls }: Pick<MapData, 'pieces' | 'ramps' | 'hulls'>) {
  const meshes = useMemo(() => {
    const byMat = new Map<MatKey, THREE.BufferGeometry[]>()
    const add = (mat: MatKey, g: THREE.BufferGeometry) => byMat.set(mat, [...(byMat.get(mat) ?? []), g.index ? g.toNonIndexed() : g])
    for (const p of pieces) if (!p.hidden) add(p.mat, pieceGeometry(p))
    for (const h of hulls) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < h.points.length; i += 3) pts.push(new THREE.Vector3(h.points[i], h.points[i + 1], h.points[i + 2]))
      add(h.mat, worldUV(new ConvexGeometry(pts)))
    }
    return [...byMat].map(([mat, parts]) => {
      for (const g of parts) g.clearGroups()
      return { mat, geometry: mergeGeometries(parts)! }
    })
  }, [pieces, hulls])
  const hullPoints = useMemo(() => hulls.map((h) => new Float32Array(h.points)), [hulls])
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        {pieces.map((p, i) =>
          p.solid === false ? null : (
            <CuboidCollider key={i} args={[p.size[0] / 2, p.size[1] / 2, p.size[2] / 2]} position={p.centre} rotation={[0, p.rotY ?? 0, 0]} />
          ),
        )}
        {ramps.map((r, i) => (
          <CuboidCollider key={`ramp${i}`} args={r.half} position={r.centre} rotation={r.rotation} />
        ))}
        {hullPoints.map((pts, i) => (
          <ConvexHullCollider key={`hull${i}`} args={[pts]} />
        ))}
      </RigidBody>
      {meshes.map(({ mat, geometry }) => (
        <mesh key={mat} geometry={geometry} material={material(mat)} castShadow receiveShadow />
      ))}
    </>
  )
}

// Pass stable (module-level) data
export function World({ data }: { data: MapData }) {
  useGrabEdges(data.edges)
  return (
    <group>
      <Ground outline={data.outline} zones={data.zones} ground={data.ground} />
      <Blocks pieces={data.pieces} ramps={data.ramps} hulls={data.hulls} />
    </group>
  )
}
