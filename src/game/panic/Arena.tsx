import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COUNTDOWN_SECONDS, STEP, playerPosition, raceClock, setRaceCallout } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { DOWN, GONE, RISE, THICK, TILE, TILES } from './course'
import { KIND_NAMES, planWaves, round, strikes, waves } from './strikes'

// The floor: every tile a collider (switched off from when it's struck until it's back up) and an instance in
// one mesh. Before every physics step the waves move on (./strikes) and whatever's due strikes. The tiles
// about to be struck light up, yellow going red, shaking at the last; struck, they drop with a flash, and
// come back up. Each wave's name comes up on the screen as it lights up.

const HALF = TILE / 2
const SINK = 3 // how far down a struck tile goes
const SHAKE_FOR = 0.25
const FLASH_FOR = 0.3
const HEARD_WITHIN = 9

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
  const body = tint(new THREE.BoxGeometry(TILE - 0.06, THICK, TILE - 0.06).translate(0, -THICK / 2, 0), 0.86, 0.62)
  const inlay = tint(new THREE.BoxGeometry(TILE - 0.42, 0.02, TILE - 0.42).translate(0, 0.004, 0), 1, 1)
  const merged = mergeGeometries([body.toNonIndexed(), inlay.toNonIndexed()])!
  body.dispose()
  inlay.dispose()
  return merged
}
const SLAB = slabGeometry()
const LOOK = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })
const BASE = TILES.map((t) => new THREE.Color((t.i + t.j) % 2 ? '#e6e9ff' : '#d3d8f7'))
const LIT = new THREE.Color('#ffd23f')
const HOT = new THREE.Color('#ff3b4e')
const WHITE = new THREE.Color('#ffffff')
// A flash of red light, shooting up from a tile as it's struck
const COLUMN = new THREE.BoxGeometry(TILE - 0.1, 1, TILE - 0.1).translate(0, 0.5, 0)
const FLASH = new THREE.MeshBasicMaterial({ color: '#ff3b4e', transparent: true, opacity: 0.35, depthWrite: false })

// Per tile, while drawing: how lit up it is (0..1) and how soon it's struck, and when it was last struck
const lit = new Float32Array(TILES.length)
const soon = new Float32Array(TILES.length)
const struckAt = new Float64Array(TILES.length)

export function Arena() {
  return (
    <>
      <TileColliders />
      <Floor />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------

function TileColliders() {
  const { world, rapier } = useRapier()
  const colliders = useRef<RapierCollider[]>([])
  const backAt = useRef(new Float64Array(TILES.length)) // when each struck tile's back to stand on (0: it's there)
  const called = useRef(-1)
  const heard = useRef(0)

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    colliders.current = TILES.map((t) =>
      world.createCollider(rapier.ColliderDesc.cuboid(HALF - 0.005, THICK / 2, HALF - 0.005).setTranslation(t.x, -THICK / 2, t.z), body),
    )
    backAt.current.fill(0)
    return () => {
      // (The physics world may have gone already, along with everything in it)
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body)
      colliders.current = []
    }
  }, [world, rapier])

  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (t < COUNTDOWN_SECONDS) return
    planWaves(t)
    const back = backAt.current

    // The wave's name, from when it lights up until it strikes
    if (!round.over && waves.kind && waves.n - 1 !== called.current && t >= waves.litAt) {
      called.current = waves.n - 1
      setRaceCallout({ id: waves.n, label: KIND_NAMES[waves.kind], colour: '#ff5a3c', ink: '#ffffff', seconds: waves.firstAt - waves.litAt })
      sfx.call()
    }
    if (round.over || t > waves.firstAt + 0.2) setRaceCallout(null)

    for (const s of strikes) {
      if (s.applied || t < s.at) continue
      s.applied = true
      let near = Infinity
      for (const i of s.tiles) {
        back[i] = Math.max(back[i], s.at + GONE)
        colliders.current[i]?.setEnabled(false)
        near = Math.min(near, Math.hypot(TILES[i].x - playerPosition.x, TILES[i].z - playerPosition.z))
      }
      if (near < HEARD_WITHIN && t - heard.current > 0.1) {
        heard.current = t
        withVolume(1 - near / HEARD_WITHIN, sfx.tileDrop)
      }
    }
    for (let i = 0; i < TILES.length; i++) {
      if (!back[i] || t < back[i]) continue
      back[i] = 0
      colliders.current[i]?.setEnabled(true)
    }
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------

const dummy = new THREE.Object3D()
const colour = new THREE.Color()
const warning = new THREE.Color()
const ease = (u: number) => 1 - (1 - u) ** 3

function Floor() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const flashes = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = mesh.current!
    TILES.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, BASE[i])
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
    struckAt.fill(-Infinity)
  }, [])

  useFrame(() => {
    const m = mesh.current
    const f = flashes.current
    if (!m || !f) return
    const t = raceClock()

    // How lit up each tile is (by whatever's next to strike it), and when it was last struck
    lit.fill(0)
    soon.fill(Infinity)
    for (const s of strikes) {
      if (s.at <= t) {
        if (t < s.at + GONE) for (const i of s.tiles) struckAt[i] = Math.max(struckAt[i], s.at)
      } else if (t >= s.warnAt) {
        const k = (t - s.warnAt) / (s.at - s.warnAt)
        for (const i of s.tiles) {
          lit[i] = Math.max(lit[i], k)
          soon[i] = Math.min(soon[i], s.at - t)
        }
      }
    }

    TILES.forEach((tile, i) => {
      let y = 0
      let scale = 1
      const since = t - struckAt[i]
      colour.copy(BASE[i])
      if (since >= 0 && since < GONE) {
        // Struck: down, and coming back up
        y = since < DOWN ? -SINK * Math.min(1, since / 0.15) : -SINK * (1 - ease((since - DOWN) / RISE))
        scale = since < DOWN ? 1 - 0.3 * Math.min(1, since / 0.15) : 0.7 + 0.3 * ease((since - DOWN) / RISE)
      }
      if (lit[i] > 0) {
        // Lit up: yellow going red, and shaking (and flashing) at the last
        const k = lit[i]
        colour.lerp(warning.copy(LIT).lerp(HOT, k), 0.6 + 0.4 * k)
        if (soon[i] < SHAKE_FOR) {
          y += 0.05 * Math.sin(t * 70 + i)
          colour.lerp(WHITE, 0.2 + 0.2 * Math.sin(t * 50))
        }
      }
      dummy.position.set(tile.x, y, tile.z)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colour)

      // Its flash: up and gone in a moment
      const u = since >= 0 && since < FLASH_FOR ? since / FLASH_FOR : 1
      dummy.position.set(tile.x, -0.5, tile.z)
      dummy.scale.set(0.8 * (1 - u), u < 1 ? 1 + 2.5 * u : 0, 0.8 * (1 - u))
      dummy.updateMatrix()
      f.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
    f.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={mesh} args={[SLAB, LOOK, TILES.length]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={flashes} args={[COLUMN, FLASH, TILES.length]} frustumCulled={false} />
    </>
  )
}
