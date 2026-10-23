import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import type { ArcAim } from './arc'
import { cast, type Ray } from './cast'

// Where something thrown (or lobbed from the bomb launcher) will go: a dotted arc from where it leaves to
// where it first lands, and a ring there as big as what it does (the blast, the fire, the smoke)

const STEP = 1 / 30 // seconds between dots
const STEPS = 135 // long enough for the highest lob to come down again

const dotGeometry = new THREE.SphereGeometry(0.045, 8, 6)
const dotMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })
const ringGeometry = new THREE.RingGeometry(0.93, 1, 48)
const ringMaterials = new Map<string, THREE.MeshBasicMaterial>()
function ringMaterial(color: string) {
  let m = ringMaterials.get(color)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
    ringMaterials.set(color, m)
  }
  return m
}

const Z = new THREE.Vector3(0, 0, 1)
const IDENTITY = new THREE.Quaternion()
const ONE = new THREE.Vector3(1, 1, 1)
const p = new THREE.Vector3()
const v = new THREE.Vector3()
const along = new THREE.Vector3()
const facing = new THREE.Vector3()
const m = new THREE.Matrix4()

export function AimArc({ aim, color }: { aim: RefObject<ArcAim>; color: string }) {
  const physics = useRapier()
  const ray = useRef<Ray | null>(null)
  const dots = useRef<THREE.InstancedMesh>(null)
  const marker = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const a = aim.current
    const d = dots.current!
    const ring = marker.current!
    let shown = 0
    ring.visible = false
    if (a.show) {
      const r = (ray.current ??= new physics.rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }))
      const gravity = Math.abs(physics.world.gravity.y) || 20
      p.copy(a.from)
      v.copy(a.vel)
      for (let i = 0; i < STEPS; i++) {
        v.y -= gravity * STEP
        const length = v.length() * STEP
        along.copy(v).normalize()
        const hit = cast(physics, r, p, along, length)
        if (hit) {
          p.addScaledVector(along, hit.timeOfImpact)
          facing.set(hit.normal.x, hit.normal.y, hit.normal.z)
          ring.visible = true
          ring.position.copy(p).addScaledVector(facing, 0.03)
          ring.quaternion.setFromUnitVectors(Z, facing)
          ring.scale.setScalar(a.reach)
          break
        }
        p.addScaledVector(along, length)
        if (i > 1) d.setMatrixAt(shown++, m.compose(p, IDENTITY, ONE))
      }
    }
    d.count = shown
    d.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={dots} args={[dotGeometry, dotMaterial, STEPS]} frustumCulled={false} />
      <mesh ref={marker} geometry={ringGeometry} material={ringMaterial(color)} visible={false} renderOrder={2} />
    </>
  )
}
