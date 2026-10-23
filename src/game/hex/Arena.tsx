import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { allRunners, isActivePlayer, type Contactable } from '../playerContact'
import { COUNTDOWN_SECONDS, STEP, getRaceView, playerPosition, raceClock } from '../race/race'
import { sfx, withVolume } from '../race/sound'
import { HEX, INRADIUS, LAYERS, LAYER_COLOURS, PLATE, PLATES, TILES, TOUCH_DELAY, layerOf, layerTop, tileUnder } from './course'
import { droppedAt, fallAt, goingTiles, gone, round, settle, solid, topOf, touch } from './tiles'

// The eight floors: every plate of every tile a collider (switched off when it drops) and an instance in its
// floor's mesh. Before every physics step, anyone standing on a tile (or across the edge of one) sets it
// going; tiles whose time has come drop. A tile stood on lights up and flickers, then falls away, shrinking,
// and is gone. Floors above the one you're on fade, so you can see what you're doing.

// Round colliders: neighbours' touch edge to edge, and the gaps left at the corners are too small to fall in
const COLLIDER_RADIUS = INRADIUS - 0.005
const DROP_TIME = 0.7 // seconds a dropped plate takes to fall out of sight
const FADED = 0.16 // how see-through a floor above you is
const HEARD_WITHIN = 7 // metres: tiles dropping further off than this are silent

// Each floor's plates, in the order of its mesh's instances
const FLOOR_PLATES: number[][] = Array.from({ length: LAYERS }, () => [])
const SLOT = new Int32Array(PLATES.length)
PLATES.forEach((plate, i) => {
  const floor = FLOOR_PLATES[TILES[plate.tile].layer]
  SLOT[i] = floor.length
  floor.push(i)
})

// A plate: a hexagonal slab with its top at y 0, the top a shade lighter than the sides and with a lighter
// hexagon set into it
function plateGeometry() {
  const h = PLATE - 0.06
  const tint = (g: THREE.BufferGeometry, shade: number) => {
    const n = g.getAttribute('position').count
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(shade), 3))
    return g
  }
  const body = tint(new THREE.CylinderGeometry(HEX - 0.06, HEX - 0.1, h, 6).translate(0, -h / 2, 0), 0.72)
  const inlay = tint(new THREE.CylinderGeometry(HEX - 0.3, HEX - 0.3, 0.03, 6).translate(0, 0.006, 0), 1)
  const merged = mergeGeometries([body.toNonIndexed(), inlay.toNonIndexed()])!
  body.dispose()
  inlay.dispose()
  return merged
}
const GEOMETRY = plateGeometry()

const WARNING = new THREE.Color('#ffffff')
const baseColour = (plate: number) => {
  const { tile, level } = PLATES[plate]
  return new THREE.Color(LAYER_COLOURS[TILES[tile].layer]).multiplyScalar(level === 0 ? 1 : 0.82)
}
const BASE = PLATES.map((_, i) => baseColour(i))

// Plates falling away (from the physics step to the drawing)
const dropping: number[] = []

// Each floor's look (its own, so it can fade on its own)
const LOOKS = LAYER_COLOURS.map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true }))

export function Arena() {
  return (
    <>
      <TileColliders />
      <Floors />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------

function TileColliders() {
  const { world, rapier } = useRapier()
  const colliders = useRef<RapierCollider[]>([])
  const heard = useRef(0)

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    colliders.current = PLATES.map(({ tile, level }) => {
      const t = TILES[tile]
      const y = layerTop(t.layer) - (level + 0.5) * PLATE
      return world.createCollider(rapier.ColliderDesc.cylinder(PLATE / 2, COLLIDER_RADIUS).setTranslation(t.x, y, t.z), body)
    })
    return () => {
      // (The physics world may have gone already, along with everything in it)
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body)
      colliders.current = []
    }
  }, [world, rapier])

  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (t >= COUNTDOWN_SECONDS && !round.over) for (const runner of allRunners()) standOn(runner, t)
    settle(t, (plate) => {
      colliders.current[plate]?.setEnabled(false)
      dropping.push(plate)
      const tile = TILES[PLATES[plate].tile]
      const near = Math.hypot(tile.x - playerPosition.x, layerTop(tile.layer) - playerPosition.y, tile.z - playerPosition.z)
      if (near < HEARD_WITHIN && t - heard.current > 0.08) {
        heard.current = t
        withVolume(1 - near / HEARD_WITHIN, sfx.tileDrop)
      }
    })
  })
  return null
}

// A runner standing on a tile sets it going: the one under its middle or, with that one gone (or lower), the
// edge of any next to it that it's still standing on
function standOn(runner: Contactable, t: number) {
  const p = runner.position()
  if (runner.velocity().y > 1.5) return // on the way up
  const feet = p.y - 1
  const layer = layerOf(feet)
  let under = tileUnder(layer, p.x, p.z)
  if (under < 0) {
    // Out past the honeycomb's edge: maybe standing on the edge of a tile at its rim
    const r = Math.hypot(p.x, p.z) || 1
    under = tileUnder(layer, p.x * (1 - 0.7 / r), p.z * (1 - 0.7 / r))
    if (under < 0) return
  }
  if (stoodOn(under, runner, p, feet, t, Infinity)) return
  for (const n of TILES[under].around) stoodOn(n, runner, p, feet, t, INRADIUS + EDGE)
}
const EDGE = 0.45 // how far past a tile's edge a body can be and still be held up by it
function stoodOn(i: number, runner: Contactable, p: { x: number; z: number }, feet: number, t: number, within: number) {
  if (!solid(i)) return false
  const tile = TILES[i]
  if (Math.hypot(p.x - tile.x, p.z - tile.z) > within) return false
  const above = feet - topOf(i)
  if (above < -0.2 || above > 0.3) return false
  if (touch(i, t) && isActivePlayer(runner)) sfx.tile()
  return true
}

// ---------------------------------------------------------------------------------------------------------

const dummy = new THREE.Object3D()
const colour = new THREE.Color()

function restMatrix(plate: number, out: THREE.Matrix4) {
  const { tile, level } = PLATES[plate]
  const t = TILES[tile]
  dummy.position.set(t.x, layerTop(t.layer) - level * PLATE, t.z)
  dummy.rotation.set(0, 0, 0)
  dummy.scale.setScalar(1)
  dummy.updateMatrix()
  return out.copy(dummy.matrix)
}

function Floors() {
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const warned = useRef(new Set<number>())

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    FLOOR_PLATES.forEach((plates, layer) => {
      const mesh = meshes.current[layer]!
      plates.forEach((plate, slot) => {
        mesh.setMatrixAt(slot, restMatrix(plate, m))
        mesh.setColorAt(slot, BASE[plate])
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
    })
    dropping.length = 0
    for (const look of LOOKS) {
      look.opacity = 1
      look.transparent = false
      look.depthWrite = true
      look.needsUpdate = true
    }
  }, [])

  useFrame((_, delta) => {
    const t = raceClock()
    const dirty = new Set<number>()

    // Stood on: lit up, flickering faster as it's about to go. (Let off, as the round ends: back as it was.)
    const shown = warned.current
    for (const i of shown) {
      if (fallAt[i] !== Infinity) continue
      shown.delete(i)
      if (!solid(i)) continue
      const plate = TILES[i].first + gone[i]
      meshes.current[TILES[i].layer]!.setColorAt(SLOT[plate], BASE[plate])
      dirty.add(TILES[i].layer)
    }
    for (const i of goingTiles()) {
      const tile = TILES[i]
      const plate = tile.first + gone[i]
      const k = 1 - Math.max(0, fallAt[i] - t) / TOUCH_DELAY
      const flicker = 0.5 + 0.5 * Math.sin(t * (18 + 30 * k))
      colour.copy(BASE[plate]).lerp(WARNING, 0.35 + 0.35 * flicker * (0.4 + 0.6 * k))
      meshes.current[tile.layer]!.setColorAt(SLOT[plate], colour)
      dirty.add(tile.layer)
      shown.add(i)
    }

    // Dropped: falling, tipping and shrinking out of sight
    for (let k = dropping.length - 1; k >= 0; k--) {
      const plate = dropping[k]
      const { tile, level } = PLATES[plate]
      const tl = TILES[tile]
      const mesh = meshes.current[tl.layer]!
      const d = t - droppedAt[plate]
      if (d >= DROP_TIME || !(d >= 0)) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(SLOT[plate], dummy.matrix)
        dropping.splice(k, 1)
      } else {
        const u = d / DROP_TIME
        dummy.position.set(tl.x, layerTop(tl.layer) - level * PLATE - 10 * d * d, tl.z)
        dummy.rotation.set(Math.sin(tile * 1.7) * u * 0.6, 0, Math.cos(tile * 2.3) * u * 0.6)
        dummy.scale.setScalar(1 - 0.7 * u)
        dummy.updateMatrix()
        mesh.setMatrixAt(SLOT[plate], dummy.matrix)
        mesh.setColorAt(SLOT[plate], colour.copy(BASE[plate]).lerp(WARNING, 0.6))
      }
      dirty.add(tl.layer)
    }
    for (const layer of dirty) {
      const mesh = meshes.current[layer]!
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
    }

    // Floors above yours fade (while you're on the floors at all)
    const view = getRaceView()
    const playing = view.phase === 'running' || view.phase === 'countdown' || view.phase === 'finished'
    const yours = layerOf(playerPosition.y - 1)
    const ease = 1 - Math.exp(-8 * delta)
    LOOKS.forEach((look, layer) => {
      const target = playing && layer > yours ? FADED : 1
      if (look.opacity === target) return
      look.opacity = Math.abs(look.opacity - target) < 0.01 ? target : THREE.MathUtils.lerp(look.opacity, target, ease)
      const see = look.opacity < 0.99
      if (look.transparent !== see) {
        look.transparent = see
        look.depthWrite = !see
        look.needsUpdate = true
      }
    })
  })

  return (
    <>
      {FLOOR_PLATES.map((plates, layer) => (
        <instancedMesh
          key={layer}
          ref={(m) => {
            meshes.current[layer] = m
          }}
          args={[GEOMETRY, LOOKS[layer], plates.length]}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}
