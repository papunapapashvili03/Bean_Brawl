import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, type IntersectionEnterPayload } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildBus } from '../cars/bus'
import { CarBody } from '../cars/Car'
import { buildCaravan } from '../cars/caravan'
import { buildCityBus } from '../cars/cityBus'
import { buildFiesta } from '../cars/fiesta'
import { buildJetta } from '../cars/jetta'
import { CAR_SCALE } from '../cars/kit'
import { buildMustang } from '../cars/mustang'
import { buildPickup } from '../cars/pickup'
import { buildYugo } from '../cars/yugo'
import { material } from '../maps/textures'
import { activePlayerHandle, knockPlayer } from '../playerContact'
import { CARS, FEATURES, PADS, SCATTER, ZIPS, type Scatter, type ScatterKind, type WorldFeature } from './layout'
import { RESERVOIR } from './places'

// Dust Bowl Valley's props (./layout): rocks, cacti, bales and drums strewn about (one draw each, a collider
// apiece), the parked cars, jump pads, the zip lines' cables, the reservoir's water, ground laid at the
// places, and the things that move or just look the part: wind turbines, pumpjacks, a windmill, lattice
// masts, a dish, a cornfield, railway tracks, a signal, a windsock, a campfire, a crane hook, rope rails.

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// ---------------------------------------------------------------------------------------------------------
// Strewn cover

const rockLook = new THREE.MeshStandardMaterial({ color: '#a98a6c', roughness: 1, flatShading: true })
const cactusLook = new THREE.MeshStandardMaterial({ color: '#5f7d3c', roughness: 0.9, flatShading: true })
const baleLook = new THREE.MeshStandardMaterial({ color: '#d2b46a', roughness: 1 })
const drumLook = new THREE.MeshStandardMaterial({ color: '#7a3b25', roughness: 0.8, metalness: 0.3 })
const shrubLook = new THREE.MeshStandardMaterial({ color: '#8a8749', roughness: 1, flatShading: true })

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1)
  const p = g.getAttribute('position')
  const rand = seeded(9)
  const bumps = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    if (!bumps.has(key)) bumps.set(key, 0.8 + rand() * 0.4)
    const k = bumps.get(key)!
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.62, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}
function cactusGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.26, 0.3, 3.2, 8).translate(0, 1.6, 0),
    new THREE.CylinderGeometry(0.18, 0.18, 0.7, 7).rotateZ(Math.PI / 2).translate(0.45, 1.5, 0),
    new THREE.CylinderGeometry(0.17, 0.18, 1.1, 7).translate(0.8, 2.0, 0),
    new THREE.CylinderGeometry(0.16, 0.16, 0.6, 7).rotateZ(Math.PI / 2).translate(-0.4, 2.1, 0),
    new THREE.CylinderGeometry(0.15, 0.16, 0.8, 7).translate(-0.7, 2.45, 0),
  ]
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!
}
const SHAPES: Record<ScatterKind, { geometry: THREE.BufferGeometry; look: THREE.Material }> = {
  rock: { geometry: rockGeometry(), look: rockLook },
  cactus: { geometry: cactusGeometry(), look: cactusLook },
  bale: { geometry: new THREE.CylinderGeometry(0.7, 0.7, 1.3, 14).rotateZ(Math.PI / 2).translate(0, 0.7, 0), look: baleLook },
  drum: { geometry: new THREE.CylinderGeometry(0.36, 0.36, 0.95, 12).translate(0, 0.475, 0), look: drumLook },
  shrub: { geometry: new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.6, 1).translate(0, 0.3, 0), look: shrubLook },
}
const KINDS = Object.keys(SHAPES) as ScatterKind[]

function StrewnKind({ kind, items }: { kind: ScatterKind; items: Scatter[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    items.forEach((s, i) => {
      m.position.set(s.x, s.y - (kind === 'rock' ? 0.25 * s.scale : 0.05), s.z)
      m.rotation.set(0, s.yaw, 0)
      m.scale.setScalar(s.scale)
      m.updateMatrix()
      mesh.current!.setMatrixAt(i, m.matrix)
    })
    mesh.current!.instanceMatrix.needsUpdate = true
    mesh.current!.computeBoundingSphere()
  }, [items, kind])
  const { geometry, look } = SHAPES[kind]
  return <instancedMesh ref={mesh} args={[geometry, look, items.length]} castShadow receiveShadow />
}

function Strewn() {
  const byKind = useMemo(() => KINDS.map((kind) => ({ kind, items: SCATTER.filter((s) => s.kind === kind) })), [])
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {SCATTER.map((s, i) => {
          if (s.kind === 'shrub') return null
          const k = s.scale
          if (s.kind === 'cactus') return <CylinderCollider key={i} args={[1.6 * k, 0.32 * k]} position={[s.x, s.y + 1.6 * k, s.z]} />
          if (s.kind === 'drum') return <CylinderCollider key={i} args={[0.47 * k, 0.36 * k]} position={[s.x, s.y + 0.47 * k, s.z]} />
          if (s.kind === 'bale') return <CuboidCollider key={i} args={[0.65 * k, 0.7 * k, 0.7 * k]} position={[s.x, s.y + 0.7 * k, s.z]} rotation={[0, s.yaw, 0]} />
          return <CuboidCollider key={i} args={[0.8 * k, 0.45 * k, 0.8 * k]} position={[s.x, s.y + 0.15 * k, s.z]} rotation={[0, s.yaw, 0]} />
        })}
      </RigidBody>
      {byKind.map(({ kind, items }) => items.length > 0 && <StrewnKind key={kind} kind={kind} items={items} />)}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Parked cars

const BUILDS = { bus: buildCityBus, pickup: buildPickup, caravan: buildCaravan, jetta: buildJetta, yugo: buildYugo, mustang: buildMustang, fiesta: buildFiesta, samba: buildBus }

function Cars() {
  return (
    <>
      {CARS.map((c, i) => (
        <CarBody key={i} build={BUILDS[c.model]} scale={CAR_SCALE} position={[c.x, c.y, c.z]} yaw={c.yaw} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Jump pads: step on and you're flung high (steer while you rise)

const padLook = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5, emissive: '#7a5200', emissiveIntensity: 0.4 })
const padRim = new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.6 })
const arrowLook = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 })

function JumpPads() {
  const launch = (up: number) => (e: IntersectionEnterPayload) => {
    if (e.other.rigidBody?.handle === activePlayerHandle()) knockPlayer({ x: 0, y: up, z: 0 })
  }
  return (
    <>
      {PADS.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]}>
          <RigidBody type="fixed" colliders={false}>
            <CylinderCollider args={[0.2, 1.6]} position={[0, 0.2, 0]} />
            <CylinderCollider args={[0.3, 1.3]} position={[0, 0.6, 0]} sensor onIntersectionEnter={launch(p.launch)} />
          </RigidBody>
          <mesh material={padRim} position={[0, 0.15, 0]} receiveShadow>
            <cylinderGeometry args={[1.7, 1.8, 0.3, 28]} />
          </mesh>
          <mesh material={padLook} position={[0, 0.33, 0]}>
            <cylinderGeometry args={[1.35, 1.35, 0.06, 28]} />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} material={arrowLook} position={[0, 0.37 + k * 0.001, 0.75 - k * 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.18, 0.32, 3, 1, Math.PI / 2 - Math.PI / 3, (Math.PI * 2) / 3]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Zip line cables, the reservoir, ground laid at the places

const cableLook = new THREE.MeshStandardMaterial({ color: '#24252a', roughness: 0.5, metalness: 0.6 })

function Cables() {
  const geometry = useMemo(
    () =>
      mergeGeometries(
        ZIPS.map(({ from, to }) => {
          const a = new THREE.Vector3(...from)
          const b = new THREE.Vector3(...to)
          const mid = a.clone().lerp(b, 0.5)
          mid.y -= a.distanceTo(b) * 0.012
          return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 48, 0.035, 5)
        }),
      )!,
    [],
  )
  return <mesh geometry={geometry} material={cableLook} />
}

function Water() {
  return (
    <mesh material={material('water')} position={[RESERVOIR.x, RESERVOIR.water, RESERVOIR.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <circleGeometry args={[RESERVOIR.r + 6, 48]} />
    </mesh>
  )
}

// Asphalt and concrete laid flat at a place (its ground is level, so a flat sheet sits on it)
function Zones() {
  const zones = useMemo(() => FEATURES.filter((f) => f.kind === 'zone' || f.kind === 'disc'), [])
  return (
    <>
      {zones.map((z, i) => (
        <mesh key={i} material={material(z.mat ?? 'asphalt')} position={[z.x, z.y + 0.03, z.z]} rotation={[-Math.PI / 2, 0, z.turn]} receiveShadow>
          {z.kind === 'disc' ? <circleGeometry args={[z.size ?? 8, 40]} /> : <planeGeometry args={[z.w ?? 8, z.d ?? 8]} />}
        </mesh>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Things that move, and things that just look the part

const white = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.5 })
const steel = new THREE.MeshStandardMaterial({ color: '#5d6168', roughness: 0.5, metalness: 0.5 })
const dark = new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.6 })
const timber = new THREE.MeshStandardMaterial({ color: '#6d5a45', roughness: 1 })
const rope = new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 1 })
const cornLook = new THREE.MeshStandardMaterial({ color: '#9aa04a', roughness: 1, side: THREE.DoubleSide })
const flame = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 1.6, roughness: 1 })
const sock = new THREE.MeshStandardMaterial({ color: '#ff6a2a', roughness: 0.8, side: THREE.DoubleSide })

// The spinning parts, found by name each frame
function Spinners() {
  const root = useRef<THREE.Group>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    root.current?.traverse((o) => {
      if (o.name === 'rotor') o.rotation.z = t * 1.3
      else if (o.name === 'fan') o.rotation.z = t * 2.2
      else if (o.name === 'beam') o.rotation.z = Math.sin(t * 1.6 + o.position.x) * 0.35
      else if (o.name === 'flame') o.scale.y = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08
    })
  })
  return (
    <group ref={root}>
      {FEATURES.map((f, i) => (
        <FeatureModel key={i} f={f} />
      ))}
    </group>
  )
}

// A lattice: four legs leaning in, rings and diagonals between them
function latticeGeometry(height: number, base: number, top: number) {
  const parts: THREE.BufferGeometry[] = []
  const at = (y: number) => THREE.MathUtils.lerp(base, top, y / height)
  const legs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const bar = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const len = a.distanceTo(b)
    const g = new THREE.CylinderGeometry(r, r, len, 5)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    return g.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  }
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = legs[k]
    const [x1, z1] = legs[(k + 1) % 4]
    parts.push(bar(new THREE.Vector3(x0 * base, 0, z0 * base), new THREE.Vector3(x0 * top, height, z0 * top), 0.07))
    for (let y = 0; y < height - 0.1; y += 2) {
      const y1 = Math.min(height, y + 2)
      parts.push(bar(new THREE.Vector3(x0 * at(y), y, z0 * at(y)), new THREE.Vector3(x1 * at(y), y, z1 * at(y)), 0.035))
      parts.push(bar(new THREE.Vector3(x0 * at(y), y, z0 * at(y)), new THREE.Vector3(x1 * at(y1), y1, z1 * at(y1)), 0.03))
    }
  }
  return mergeGeometries(parts)!
}

function FeatureModel({ f }: { f: WorldFeature }) {
  const lattice = useMemo(() => (f.kind === 'mast' ? latticeGeometry(f.size ?? 12, 1.2, 0.35) : null), [f.kind, f.size])
  const corn = useMemo(() => (f.kind === 'corn' ? cornGeometry(f.w ?? 10, f.d ?? 10) : null), [f.kind, f.w, f.d])
  const rails = useMemo(() => (f.kind === 'rails' ? railsGeometry(f.size ?? 40) : null), [f.kind, f.size])
  const ropes = useMemo(() => (f.kind === 'ropes' ? ropesGeometry() : null), [f.kind])
  const pos: [number, number, number] = [f.x, f.y, f.z]
  switch (f.kind) {
    case 'turbine':
      return (
        <group position={pos} rotation={[0, f.yaw + 0.6, 0]}>
          <mesh material={white} position={[0, 0.6, -0.6]} castShadow>
            <boxGeometry args={[1.6, 1.6, 4]} />
          </mesh>
          <group name="rotor" position={[0, 0.6, 1.6]}>
            <mesh material={white}>
              <sphereGeometry args={[0.55, 12, 10]} />
            </mesh>
            {[0, 1, 2].map((k) => (
              <group key={k} rotation={[0, 0, (k * Math.PI * 2) / 3]}>
                <mesh material={white} position={[0, 5.6, 0.1]} castShadow>
                  <boxGeometry args={[0.5, 11, 0.12]} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      )
    case 'pumpjack':
      return (
        <group position={pos} rotation={[0, f.yaw, 0]}>
          <mesh material={steel} position={[0, 1.6, 0]} castShadow>
            <boxGeometry args={[0.3, 3.2, 1.6]} />
          </mesh>
          <group name="beam" position={[0, 3.2, 0]}>
            <mesh material={dark} castShadow>
              <boxGeometry args={[0.35, 0.45, 6]} />
            </mesh>
            <mesh material={dark} position={[0, -0.4, 3]} castShadow>
              <boxGeometry args={[0.45, 1.6, 0.8]} />
            </mesh>
          </group>
        </group>
      )
    case 'windmill':
      return (
        <group position={pos} rotation={[0, f.yaw, 0]}>
          <group name="fan" position={[0, 0.6, 0.6]}>
            {Array.from({ length: 6 }, (_, k) => (
              <mesh key={k} material={white} rotation={[0, 0, (k / 6) * Math.PI]}>
                <boxGeometry args={[0.35, 3.4, 0.04]} />
              </mesh>
            ))}
          </group>
          <mesh material={dark} position={[0, 0.6, -1.2]}>
            <boxGeometry args={[0.05, 1.2, 2.2]} />
          </mesh>
        </group>
      )
    case 'mast':
      return <mesh geometry={lattice!} material={steel} position={pos} castShadow />
    case 'dish':
      return (
        <group position={pos} rotation={[0, f.yaw, 0]}>
          <mesh material={steel} position={[0, 1, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 2, 6]} />
          </mesh>
          <mesh material={white} position={[0, 2.2, 0]} rotation={[-0.9, 0, 0]}>
            <sphereGeometry args={[1.3, 18, 8, 0, Math.PI * 2, 0, 0.6]} />
          </mesh>
        </group>
      )
    case 'corn':
      return <mesh geometry={corn!} material={cornLook} position={pos} rotation={[0, f.turn, 0]} />
    case 'rails':
      return <mesh geometry={rails!} material={steel} position={pos} rotation={[0, f.turn, 0]} receiveShadow />
    case 'signal':
      return (
        <group position={pos} rotation={[0, f.yaw, 0]}>
          <mesh material={dark} position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 5, 6]} />
          </mesh>
          <mesh material={dark} position={[0, 5, 0.15]}>
            <boxGeometry args={[0.5, 1.2, 0.3]} />
          </mesh>
          <mesh material={flame} position={[0, 5.3, 0.32]}>
            <sphereGeometry args={[0.12, 8, 6]} />
          </mesh>
        </group>
      )
    case 'windsock':
      return (
        <group position={pos}>
          <mesh material={dark} position={[0, 3, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 6, 6]} />
          </mesh>
          <mesh material={sock} position={[0.9, 5.8, 0]} rotation={[0, 0, Math.PI / 2 + 0.2]}>
            <coneGeometry args={[0.35, 1.8, 12, 1, true]} />
          </mesh>
        </group>
      )
    case 'fire':
      return (
        <group position={pos}>
          {[0, 1, 2].map((k) => (
            <mesh key={k} material={timber} position={[0, 0.12, 0]} rotation={[0, (k * Math.PI) / 3, Math.PI / 2]}>
              <cylinderGeometry args={[0.09, 0.09, 1.1, 6]} />
            </mesh>
          ))}
          <mesh name="flame" material={flame} position={[0, 0.5, 0]}>
            <coneGeometry args={[0.32, 0.9, 8]} />
          </mesh>
        </group>
      )
    case 'hook':
      return (
        <group position={pos}>
          <mesh material={dark} position={[0, -2.5, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 5, 4]} />
          </mesh>
          <mesh material={steel} position={[0, -5.2, 0]}>
            <boxGeometry args={[0.6, 0.5, 0.6]} />
          </mesh>
        </group>
      )
    case 'ropes':
      return <mesh geometry={ropes!} material={rope} position={pos} rotation={[0, f.turn, 0]} />
    default:
      return null
  }
}

// A field of corn, rows of tall crossed blades
function cornGeometry(w: number, d: number) {
  const parts: THREE.BufferGeometry[] = []
  const rand = seeded(3)
  for (let z = -d / 2; z < d / 2; z += 0.9) {
    for (let x = -w / 2; x < w / 2; x += 0.75) {
      const h = 2.1 + rand() * 0.5
      const px = x + (rand() - 0.5) * 0.3
      const pz = z + (rand() - 0.5) * 0.3
      const turn = rand() * Math.PI
      for (const t of [turn, turn + Math.PI / 2]) parts.push(new THREE.PlaneGeometry(0.45, h).translate(0, h / 2, 0).rotateY(t).translate(px, 0, pz))
    }
  }
  return mergeGeometries(parts)!
}

// A pair of rails on sleepers, along x
function railsGeometry(length: number) {
  const parts: THREE.BufferGeometry[] = []
  for (const z of [-0.72, 0.72]) parts.push(new THREE.BoxGeometry(length, 0.14, 0.09).translate(0, 0.2, z))
  for (let x = -length / 2; x <= length / 2; x += 0.9) parts.push(new THREE.BoxGeometry(0.24, 0.12, 2.3).translate(x, 0.06, 0))
  return mergeGeometries(parts)!
}

// The rope bridge's rails: a rope either side following the planks' sag, and hangers down to them
function ropesGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = []
    for (let x = -12.4; x <= 12.4; x += 0.8) pts.push(new THREE.Vector3(x, 1 - 1.4 * Math.sin((Math.PI * (x + 12.4)) / 24.8), s * 1.3))
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.04, 5))
    for (let x = -11; x <= 11; x += 2) {
      const sag = Math.sin((Math.PI * (x + 12.4)) / 24.8)
      const top = 1 - 1.4 * sag
      const deck = -1.6 * sag
      parts.push(new THREE.CylinderGeometry(0.02, 0.02, top - deck, 4).translate(x, (top + deck) / 2, s * 1.3))
    }
  }
  return mergeGeometries(parts)!
}

export function Props() {
  return (
    <group>
      <Strewn />
      <Cars />
      <JumpPads />
      <Cables />
      <Water />
      <Zones />
      <Spinners />
    </group>
  )
}
