import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  ConvexHullCollider,
  CylinderCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { addDust } from '../crumble/dust'
import { shakeCamera } from '../crumble/shake'
import { sectorPiece } from '../crumble/shapes'
import { useKinematic } from '../race/kinematic'
import { STEP, playerPosition, raceClock, surfaces } from '../race/race'
import { sfx } from '../race/sound'
import { CORE, FRICTION, RINGS, THICKNESS, TILE_BREAKS, WARN, tiltAt } from './course'
import { mapUV, townMap } from './map'

// The town's platform: one kinematic body that tips over on the match clock, made of a solid middle and rings
// of tiles round it. Each tile's collider switches off when its time comes, and a copy of it drops away into
// the clouds, tumbling, while the one on the platform disappears. Standing on the platform, you slide downhill.

const GAP = 0.03 // between neighbouring tiles
const SLIDE = 8 // m/s downhill at a full 1-radian tilt (about 4 m/s at the steepest: you can still walk uphill)
const G = 20
const FALL_TIME = 3.5

// The tiles, outermost ring first
const TILES = RINGS.flatMap((ring, k) =>
  Array.from({ length: ring.tiles }, (_, i) => {
    const step = (Math.PI * 2) / ring.tiles
    const a0 = i * step
    const a1 = a0 + step
    const mid = (a0 + a1) / 2
    return { ring: k, r0: ring.r0, r1: ring.r1, a0, a1, breakAt: TILE_BREAKS[k][i], out: [Math.sin(mid), Math.cos(mid)] as [number, number] }
  }),
)

// A tile's top face, facing up, with the town map's texture coordinates for where it lies
function topFace(r0: number, r1: number, a0: number, a1: number, cx: number, cz: number) {
  const steps = Math.max(3, Math.ceil(((a1 - a0) * r1) / 0.6))
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    pts.push(new THREE.Vector2(r1 * Math.sin(a) - cx, -(r1 * Math.cos(a) - cz)))
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps
    pts.push(new THREE.Vector2(r0 * Math.sin(a) - cx, -(r0 * Math.cos(a) - cz)))
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2).translate(0, 0.004, 0)
  withMapUV(g, cx, cz)
  return g
}
function withMapUV(g: THREE.BufferGeometry, cx: number, cz: number) {
  const p = g.getAttribute('position')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const [u, v] = mapUV(p.getX(i) + cx, p.getZ(i) + cz)
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

const sideLook = new THREE.MeshStandardMaterial({ color: '#a9afb8', roughness: 0.85 })
const undersideLook = new THREE.MeshStandardMaterial({ color: '#7f858e', roughness: 0.9 })
const stone = new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.7 })
const water = new THREE.MeshStandardMaterial({ color: '#5fc4ee', emissive: '#2f8fc0', emissiveIntensity: 0.25, roughness: 0.1 })
const gold = new THREE.MeshStandardMaterial({ color: '#ffcf3f', metalness: 0.5, roughness: 0.3 })
// One warning look per ring (all its tiles flash together)
const warnLooks = RINGS.map(() => new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0, depthWrite: false }))

const Y = new THREE.Vector3(0, 1, 0)

export function Platform() {
  const body = useRef<RapierRigidBody>(null)
  const colliders = useRef<(RapierCollider | null)[]>([])
  const coreColliders = useRef<(RapierCollider | null)[]>([])
  const attached = useRef<(THREE.Group | null)[]>([])
  const falling = useRef<(THREE.Group | null)[]>([])
  const state = useRef({ broken: TILES.map(() => false), heard: 0, pose: new THREE.Quaternion(), tumble: new THREE.Quaternion() })
  const map = useMemo(() => new THREE.MeshStandardMaterial({ map: townMap(), roughness: 0.85 }), [])

  // Every tile's shapes, built on first use
  const shapes = useMemo(
    () =>
      TILES.map((t) => {
        const da = GAP / t.r1
        const piece = sectorPiece(t.r0 + GAP, t.r1 - GAP, t.a0 + da, t.a1 - da, 0, THICKNESS)
        const [cx, , cz] = piece.position
        return { ...piece, top: topFace(t.r0 + GAP, t.r1 - GAP, t.a0 + da, t.a1 - da, cx, cz) }
      }),
    [],
  )
  const core = useMemo(() => {
    const top = new THREE.CircleGeometry(CORE - GAP, 72).rotateX(-Math.PI / 2).translate(0, 0.004, 0)
    withMapUV(top, 0, 0)
    return { top, side: new THREE.CylinderGeometry(CORE - GAP, CORE - GAP, THICKNESS, 72, 1, true) }
  }, [])

  // It tips over on the match clock
  useKinematic(body, (t) => ({ position: { x: 0, y: 0, z: 0 }, rotation: tiltAt(t, state.current.pose) }))

  // Standing on it, you slide downhill: the platform's up leans towards downhill, and so does the slide
  useEffect(() => {
    const up = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const slide = () => {
      up.copy(Y).applyQuaternion(tiltAt(raceClock(), q))
      return { x: up.x * SLIDE, z: up.z * SLIDE }
    }
    const handles = [...colliders.current, ...coreColliders.current].filter((c): c is RapierCollider => !!c).map((c) => c.handle)
    for (const h of handles) surfaces.set(h, slide)
    return () => {
      for (const h of handles) surfaces.delete(h)
    }
  }, [])

  // Tiles give way
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    const s = state.current
    TILES.forEach((tile, i) => {
      if (s.broken[i] || t < tile.breakAt) return
      s.broken[i] = true
      colliders.current[i]?.setEnabled(false)
    })
  })

  // The warning, the break, the fall
  useFrame(() => {
    const t = raceClock()
    const s = state.current
    for (let k = 0; k < RINGS.length; k++) {
      const until = RINGS[k].breaks - t
      const on = until < WARN && until > -3
      warnLooks[k].visible = on
      warnLooks[k].opacity = on ? 0.25 + 0.25 * Math.sin(t * 16) : 0
    }
    TILES.forEach((tile, i) => {
      const on = attached.current[i]
      const off = falling.current[i]
      if (!on || !off) return
      const since = t - tile.breakAt
      if (since < 0) {
        on.visible = true
        off.visible = false
        // Shuddering as it's about to go
        const shake = since > -WARN ? 0.04 * (1 + since / WARN) : 0
        const [cx, , cz] = shapes[i].position
        on.position.set(cx + Math.sin(t * 43 + i) * shake, Math.sin(t * 51 + i * 2) * shake, cz + Math.sin(t * 37 + i * 3) * shake)
        return
      }
      on.visible = false
      off.visible = since < FALL_TIME
      if (!off.visible) return
      // Where the tile was on the platform when it broke, then falling away outwards and tumbling
      if (!off.userData.fell) {
        off.userData.fell = true
        const q = tiltAt(tile.breakAt)
        const at = new THREE.Vector3(...shapes[i].position).applyQuaternion(q)
        off.userData.start = at
        off.userData.q = q
        off.userData.axis = new THREE.Vector3(tile.out[1], 0.2, -tile.out[0]).normalize()
        addDust(at, 3, 2.5, 1.1)
        const near = Math.hypot(at.x - playerPosition.x, at.y - playerPosition.y, at.z - playerPosition.z)
        if (near < 22 && t - s.heard > 0.18) {
          s.heard = t
          sfx.crumble()
          shakeCamera(0.01 * (1 - near / 22), 0.4, t)
        }
      }
      const start = off.userData.start as THREE.Vector3
      off.position.set(start.x + tile.out[0] * 2.5 * since, start.y - 0.5 * G * since * since, start.z + tile.out[1] * 2.5 * since)
      off.quaternion.copy(off.userData.q as THREE.Quaternion).multiply(s.tumble.setFromAxisAngle(off.userData.axis as THREE.Vector3, since * 1.3))
    })
  })

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false}>
        {/* The middle: never breaks. The fountain on the roundabout's island is part of it. */}
        <CylinderCollider
          ref={(c) => {
            coreColliders.current[0] = c
          }}
          args={[THICKNESS / 2, CORE]}
          position={[0, -THICKNESS / 2, 0]}
          friction={FRICTION}
        />
        <mesh geometry={core.top} material={map} receiveShadow />
        <mesh geometry={core.side} material={sideLook} position={[0, -THICKNESS / 2, 0]} />
        <mesh material={undersideLook} position={[0, -THICKNESS, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[CORE - GAP, 72]} />
        </mesh>
        <CylinderCollider
          ref={(c) => {
            coreColliders.current[1] = c
          }}
          args={[0.3, 2.4]}
          position={[0, 0.3, 0]}
          friction={FRICTION}
        />
        <CylinderCollider
          ref={(c) => {
            coreColliders.current[2] = c
          }}
          args={[1, 0.45]}
          position={[0, 1, 0]}
          friction={FRICTION}
        />
        <Fountain />

        {TILES.map((tile, i) => (
          <group key={i}>
            <ConvexHullCollider
              ref={(c) => {
                colliders.current[i] = c
              }}
              args={[shapes[i].hull]}
              position={shapes[i].position}
              friction={FRICTION}
            />
            <group
              ref={(g) => {
                attached.current[i] = g
              }}
              position={shapes[i].position}
            >
              <mesh geometry={shapes[i].geometry} material={sideLook} castShadow receiveShadow />
              <mesh geometry={shapes[i].top} material={map} receiveShadow />
              <mesh geometry={shapes[i].top} material={warnLooks[tile.ring]} position={[0, 0.01, 0]} renderOrder={1} />
            </group>
          </group>
        ))}
      </RigidBody>

      {/* The copies that fall (hidden until their tile breaks) */}
      {TILES.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            falling.current[i] = g
          }}
          visible={false}
        >
          <mesh geometry={shapes[i].geometry} material={sideLook} castShadow />
          <mesh geometry={shapes[i].top} material={map} />
        </group>
      ))}

      <Pillar />
    </>
  )
}

// A round fountain on the roundabout's island: a white basin of water with a golden figure on a column
function Fountain() {
  return (
    <group>
      <mesh material={stone} position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.4, 2.5, 0.6, 40]} />
      </mesh>
      <mesh material={water} position={[0, 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.15, 40]} />
      </mesh>
      <mesh material={stone} position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 2, 20]} />
      </mesh>
      <mesh material={gold} position={[0, 2.45, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.45, 6, 16]} />
      </mesh>
      <mesh material={gold} position={[0, 3.05, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 12]} />
      </mesh>
    </group>
  )
}

// What the town balances on: a tall column rising out of the clouds, with a ball on top
const pillarLook = new THREE.MeshStandardMaterial({ color: '#8d8a99', roughness: 0.8 })
function Pillar() {
  return (
    <group>
      <mesh material={pillarLook} position={[0, -THICKNESS - 1.7, 0]}>
        <sphereGeometry args={[1.6, 32, 20]} />
      </mesh>
      <mesh material={pillarLook} position={[0, -THICKNESS - 32.5, 0]}>
        <cylinderGeometry args={[1.8, 2.6, 60, 32]} />
      </mesh>
    </group>
  )
}
