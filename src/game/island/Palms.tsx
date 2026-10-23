import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SEA_LEVEL, isClearGround, mulberry32, terrainHeight, terrainSlope } from './terrain'

const trunkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })
const frondMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  side: THREE.DoubleSide,
  roughness: 0.8,
})
const coconutMaterial = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.7 })

const UP = new THREE.Vector3(0, 1, 0)
const TRUNK_LIGHT = new THREE.Color('#a07c4f')
const TRUNK_DARK = new THREE.Color('#7d5c38')
const FROND_BASE = new THREE.Color('#2f8a2f')
const FROND_TIP = new THREE.Color('#8fd14f')

function paint(geo: THREE.BufferGeometry, color: THREE.Color) {
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3)
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

// Ringed trunk: tapered cylinder segments stacked along a leaning curve
function buildTrunk(height: number, lean: number) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.1, height * 0.55, 0),
    new THREE.Vector3(lean, height, 0),
  )
  const count = 9
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const p0 = curve.getPoint(i / count)
    const p1 = curve.getPoint((i + 1) / count)
    const dir = p1.clone().sub(p0)
    const len = dir.length()
    const r = THREE.MathUtils.lerp(0.38, 0.2, i / count)
    const seg = new THREE.CylinderGeometry(r * 0.82, r, len * 1.02, 7)
    seg.translate(0, len / 2, 0)
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()))
    seg.translate(p0.x, p0.y, p0.z)
    paint(seg, i % 2 ? TRUNK_LIGHT : TRUNK_DARK)
    parts.push(seg)
  }
  return { geometry: mergeGeometries(parts)!, crown: curve.getPoint(1) }
}

// One frond: an arching stem with narrow leaflets on both sides, built along +X
function buildFrond(length: number) {
  const stem = (t: number) => new THREE.Vector3(t * length, 0.55 * t * length - 0.55 * t * t * length, 0)
  const positions: number[] = []
  const colors: number[] = []
  const leaflets = 16
  for (let j = 1; j < leaflets; j++) {
    const t = j / leaflets
    const a = stem(t - 0.5 / leaflets)
    const b = stem(t + 0.5 / leaflets)
    const leafLen = 1.25 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.2
    for (const side of [-1, 1]) {
      const tip = stem(t).add(new THREE.Vector3(0.35 * leafLen, -0.45 * leafLen, side * leafLen))
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z)
      const base = FROND_BASE.clone().lerp(FROND_TIP, t * 0.6)
      const tipColor = FROND_BASE.clone().lerp(FROND_TIP, 0.4 + t * 0.6)
      colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tipColor.r, tipColor.g, tipColor.b)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

function buildPalm(seed: number) {
  const rng = mulberry32(seed)
  const height = 5.5 + rng() * 3
  const lean = 0.6 + rng() * 2
  const { geometry: trunk, crown } = buildTrunk(height, lean)

  const fronds: THREE.BufferGeometry[] = []
  const count = 9
  for (let i = 0; i < count; i++) {
    const frond = buildFrond(3 + rng() * 0.8)
    const yaw = (i / count) * Math.PI * 2 + rng() * 0.4
    const pitch = -0.15 + rng() * 0.45
    const m = new THREE.Matrix4()
      .makeTranslation(crown.x, crown.y, crown.z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationZ(pitch))
    frond.applyMatrix4(m)
    fronds.push(frond)
  }

  const nuts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng()
    const nut = new THREE.SphereGeometry(0.2, 8, 6)
    nut.translate(crown.x + Math.cos(a) * 0.28, crown.y - 0.3, crown.z + Math.sin(a) * 0.28)
    nuts.push(nut)
  }

  return {
    trunk,
    fronds: mergeGeometries(fronds)!,
    coconuts: mergeGeometries(nuts)!,
    yaw: rng() * Math.PI * 2,
  }
}

function Palm({ position, seed }: { position: [number, number, number]; seed: number }) {
  const palm = useMemo(() => buildPalm(seed), [seed])
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, palm.yaw, 0]}>
      <CylinderCollider args={[1.6, 0.35]} position={[0, 1.6, 0]} />
      <mesh geometry={palm.trunk} material={trunkMaterial} castShadow receiveShadow />
      <mesh geometry={palm.fronds} material={frondMaterial} castShadow receiveShadow />
      <mesh geometry={palm.coconuts} material={coconutMaterial} castShadow />
    </RigidBody>
  )
}

function placePalms(count: number) {
  const rng = mulberry32(7)
  const spots: [number, number, number][] = []
  for (let tries = 0; spots.length < count && tries < 4000; tries++) {
    const x = (rng() - 0.5) * 110
    const z = (rng() - 0.5) * 110
    const y = terrainHeight(x, z)
    if (y < SEA_LEVEL + 0.6) continue
    if (terrainSlope(x, z) > 0.5 || !isClearGround(x, z, 1)) continue
    if (spots.some(([px, , pz]) => Math.hypot(px - x, pz - z) < 6)) continue
    spots.push([x, y - 0.1, z])
  }
  return spots
}

export function Palms({ count = 22 }: { count?: number }) {
  const spots = useMemo(() => placePalms(count), [count])
  return (
    <>
      {spots.map((p, i) => (
        <Palm key={i} position={p} seed={100 + i} />
      ))}
    </>
  )
}
