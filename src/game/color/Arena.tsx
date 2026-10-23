import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COUNTDOWN_SECONDS, STEP, raceClock, setRaceCallout } from '../race/race'
import { sfx } from '../race/sound'
import { BACK_TIME, PALETTE, SPAN, THICK, TILE, TILES, callTime } from './course'
import { advanceCalls, floor, round, solid } from './calls'

// The floor: every tile a collider (switched off while it's down) and an instance in one mesh, in the colour
// the pattern gives it. Before every physics step the calls move on (./calls): a colour's called (on the
// screen, and in the rim round the floor and the beacons at its corners), the rest of the floor shakes, then
// drops, and comes back up in the next pattern.

const HALF = TILE / 2
const DROP_TIME = 0.6 // seconds a dropped tile takes to fall out of sight
const SHAKE_FOR = 0.45 // seconds before the drop that the tiles about to go start to shake
const RISE_FROM = 2.5 // metres below where it comes back up from

function slabGeometry() {
  const tint = (g: THREE.BufferGeometry, top: number, side: number) => {
    const normals = g.getAttribute('normal')
    const shades: number[] = []
    for (let k = 0; k < normals.count; k++) {
      const s = normals.getY(k) > 0.5 ? top : side
      shades.push(s, s, s)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3))
    return g
  }
  const body = tint(new THREE.BoxGeometry(TILE - 0.06, THICK, TILE - 0.06).translate(0, -THICK / 2, 0), 0.84, 0.6)
  const inlay = tint(new THREE.BoxGeometry(TILE - 0.36, 0.02, TILE - 0.36).translate(0, 0.004, 0), 1, 1)
  const merged = mergeGeometries([body.toNonIndexed(), inlay.toNonIndexed()])!
  body.dispose()
  inlay.dispose()
  return merged
}
const SLAB = slabGeometry()
const LOOK = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })
const SHADES = PALETTE.map((p) => new THREE.Color(p.colour))

// The rim under the floor's edge and the beacons' lamps: plain until a colour's called, then that colour
const IDLE = new THREE.Color('#d9dcf0')
const GLOW = new THREE.MeshStandardMaterial({ color: '#d9dcf0', emissive: '#d9dcf0', emissiveIntensity: 0.25, roughness: 0.4 })
const POST = new THREE.MeshStandardMaterial({ color: '#4a4f6e', roughness: 0.6 })

export function Arena() {
  return (
    <>
      <TileColliders />
      <Floor />
      <Rim />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------

function TileColliders() {
  const { world, rapier } = useRapier()
  const colliders = useRef<RapierCollider[]>([])

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    colliders.current = TILES.map((t) =>
      world.createCollider(rapier.ColliderDesc.cuboid(HALF - 0.005, THICK / 2, HALF - 0.005).setTranslation(t.x, -THICK / 2, t.z), body),
    )
    return () => {
      // (The physics world may have gone already, along with everything in it)
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body)
      colliders.current = []
    }
  }, [world, rapier])

  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (t < COUNTDOWN_SECONDS) return
    advanceCalls(t, {
      call: () => {
        const c = PALETTE[floor.called]
        setRaceCallout({ id: floor.n, label: c.name, colour: c.colour, ink: c.ink, seconds: callTime(floor.n) })
        sfx.call()
      },
      drop: () => {
        colliders.current.forEach((c, i) => c.setEnabled(solid(i)))
        sfx.floorDrop()
      },
      back: () => setRaceCallout(null),
      up: () => colliders.current.forEach((c) => c.setEnabled(true)),
    })
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------

const dummy = new THREE.Object3D()
const colour = new THREE.Color()
const WHITE = new THREE.Color('#ffffff')
const ease = (u: number) => 1 - (1 - u) ** 3

function Floor() {
  const mesh = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = mesh.current!
    TILES.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, SHADES[floor.colours[i]])
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  }, [])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const t = raceClock()
    const into = t - floor.since
    const shaking = floor.phase === 'call' && !round.over && floor.until - t < SHAKE_FOR
    TILES.forEach((tile, i) => {
      let y = 0
      let scale = 1
      colour.copy(SHADES[floor.colours[i]])
      if (shaking && floor.colours[i] !== floor.called) {
        y = 0.05 * Math.sin(t * 70 + i * 1.3)
      } else if (floor.phase === 'gone' && !solid(i)) {
        // Dropping away, and gone
        const u = Math.min(1, into / DROP_TIME)
        y = -10 * into * into
        scale = u >= 1 ? 0 : 1 - 0.5 * u
      } else if (floor.phase === 'gone' && solid(i)) {
        // The ones left: lit up
        colour.lerp(WHITE, 0.07 + 0.07 * Math.sin(t * 10))
      } else if (floor.phase === 'back' && !solid(i)) {
        // Coming back up, in the next pattern
        const u = ease(Math.min(1, into / BACK_TIME))
        y = -RISE_FROM * (1 - u)
        scale = 0.6 + 0.4 * u
      }
      dummy.position.set(tile.x, y, tile.z)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colour)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[SLAB, LOOK, TILES.length]} receiveShadow castShadow={false} frustumCulled={false} />
}

// A glowing rim below the floor's edge, and a beacon at each corner, lit in the colour called
const RIM_W = 0.5
const RIM_DROP = THICK + 0.6 // (well below the tiles, so it's plainly not somewhere to stand)
const BEACON_OUT = SPAN / 2 + 2.6
function Rim() {
  useFrame(() => {
    const t = raceClock()
    const calling = (floor.phase === 'call' || floor.phase === 'gone') && floor.called >= 0
    const target = calling ? SHADES[floor.called] : IDLE
    GLOW.color.copy(target)
    GLOW.emissive.copy(target)
    GLOW.emissiveIntensity = calling ? 0.75 + 0.25 * Math.sin(t * 12) : 0.25
  })
  const side = SPAN + RIM_W * 2
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={GLOW} position={[0, -RIM_DROP - 0.3, s * (SPAN / 2 + RIM_W / 2)]}>
            <boxGeometry args={[side, 0.6, RIM_W]} />
          </mesh>
          <mesh material={GLOW} position={[s * (SPAN / 2 + RIM_W / 2), -RIM_DROP - 0.3, 0]}>
            <boxGeometry args={[RIM_W, 0.6, SPAN]} />
          </mesh>
        </group>
      ))}
      {[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[sx * BEACON_OUT, 0, sz * BEACON_OUT]}>
          <mesh material={POST} position={[0, -3, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.5, 12, 10]} />
          </mesh>
          <mesh material={GLOW} position={[0, 3.6, 0]}>
            <sphereGeometry args={[0.95, 20, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
