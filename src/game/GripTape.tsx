import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type P3 = [number, number, number]

// Grip tape marks everything the hands can catch: mostly `base` with a thin `band` every TAPE_PITCH metres
const TAPE_PITCH = 0.3
function tapeTexture(base: string, band: string) {
  const a = new THREE.Color(base)
  const b = new THREE.Color(band)
  const rows = [b, a, a, a]
  const data = new Uint8Array(rows.length * 4)
  rows.forEach((c, i) => {
    const s = c.clone().convertLinearToSRGB()
    data.set([s.r * 255, s.g * 255, s.b * 255, 255], i * 4)
  })
  const tex = new THREE.DataTexture(data, 1, rows.length)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

const lipTexture = tapeTexture('#ffd23f', '#1b1b1f')
const TAPES = {
  lip: new THREE.MeshStandardMaterial({ map: lipTexture, roughness: 0.6 }), // ledge edges
  bar: new THREE.MeshStandardMaterial({ map: tapeTexture('#f4f1ea', '#ff5a5f'), roughness: 0.4 }), // bars
  // Unlit and brighter than 1 so it glows under bloom (Neon Circuit)
  neon: new THREE.MeshBasicMaterial({ map: lipTexture, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false }),
}
export type TapeStyle = keyof typeof TAPES

const Y_AXIS = new THREE.Vector3(0, 1, 0)

// A taped rod from a to b (visual only), e.g. the rounded lip along a grabbable edge.
// Pass stable (memoised or module-level) points.
export function TapedRod({ a, b, radius = 0.07, tape = 'lip' }: { a: P3; b: P3; radius?: number; tape?: TapeStyle }) {
  const { geometry, position, quaternion } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const length = va.distanceTo(vb)
    const g = new THREE.CylinderGeometry(radius, radius, length, 14, 1)
    // Stretch the texture's v (along the rod) so the bands keep a fixed spacing whatever the length
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * length) / TAPE_PITCH)
    return {
      geometry: g,
      position: va.clone().add(vb).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, vb.clone().sub(va).normalize()),
    }
  }, [a, b, radius])
  return <mesh geometry={geometry} material={TAPES[tape]} position={position} quaternion={quaternion} castShadow />
}

// Many taped rods drawn as one mesh (e.g. every ledge of an arena). Pass a stable (memoised or module-level) list.
export function TapedRods({ rods, radius = 0.07, tape = 'lip' }: { rods: { a: P3; b: P3 }[]; radius?: number; tape?: TapeStyle }) {
  const geometry = useMemo(() => {
    const parts = rods.map(({ a, b }) => {
      const va = new THREE.Vector3(...a)
      const vb = new THREE.Vector3(...b)
      const length = va.distanceTo(vb)
      const g = new THREE.CylinderGeometry(radius, radius, length, 12, 1)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * length) / TAPE_PITCH)
      const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, vb.clone().sub(va).normalize())
      return g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))
    })
    return parts.length ? mergeGeometries(parts) : null
  }, [rods, radius])
  return geometry && <mesh geometry={geometry} material={TAPES[tape]} castShadow />
}
