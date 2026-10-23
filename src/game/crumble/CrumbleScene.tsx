import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { PHYSICS_PRIORITY, Player } from '../Player'
import {
  COUNTDOWN_SECONDS,
  STEP,
  eliminate,
  getRaceView,
  playerPosition,
  raceClock,
  raceOver,
  raceRules,
  setRaceStatus,
  startRace,
} from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { sfx } from '../race/sound'
import { CROWN, CRUMBLE_COURSE, FALL_Y, FLOOR_Y, PLAYER_SLOT, RING, SPAWNS, SPECTATOR, SURVIVAL, T, TOWER } from './course'
import { Courtyard } from './Courtyard'
import { Crown } from './Crown'
import { Dust } from './Crumble'
import { dust } from './dust'
import { fadeBodies } from './fade'
import { InnerTower } from './InnerTower'
import { Ring } from './Ring'
import { BOT_STARTS, CRUMBLE_ROUTE, botLane } from './route'
import { Scenery, SpectatorIsland } from './Scenery'
import { resetShake, setTremor, shakeAt, shakeCamera } from './shake'
import { collapseAt, nextGustIn, nextStageIn, resetSurvival, stageAt, survival, survivalEnd, surviving, windAt } from './survival'

// Crumbling Tower: a race up a tower falling apart from the bottom, on a rock above the clouds (see ./course
// for the layout and timetable). Falling off is out: you watch the rest from the spectator island. Whoever
// reaches the crown starts the last stand, and surviving it wins.

// Once you're out, you're taken to the spectator island a moment later, wherever you've landed
const TO_SPECTATORS_AFTER = 2.5
let outSince: number | null = null
const RULES = raceRules({
  fallY: () => {
    if (getRaceView().phase !== 'eliminated') {
      outSince = null
      return FALL_Y
    }
    outSince ??= raceClock()
    const away = Math.hypot(playerPosition.x - SPECTATOR[0], playerPosition.z - SPECTATOR[2]) > 12
    return away && raceClock() - outSince > TO_SPECTATORS_AFTER ? Infinity : FALL_Y
  },
  respawnAt: () => {
    eliminate()
    return SPECTATOR
  },
  cameraYaw: Math.PI,
})

const CLEAR = new THREE.Color('#8fcaff')
const STORMY = new THREE.Color('#4a4d68')

// Whatever of the tower is between the camera and the player fades out of the way: rays from the player to
// the camera and to points round it, so there's a window to see through rather than a slot
const FADED = 0.15
const WINDOW: [number, number][] = [
  [0, 0],
  [-2.8, 0],
  [2.8, 0],
  [0, -1.2],
  [0, 2],
]
const right = new THREE.Vector3()
const up = new THREE.Vector3()
const target = new THREE.Vector3()
function FadeBlockers() {
  const { world, rapier } = useRapier()
  const ray = useRef<InstanceType<typeof rapier.Ray>>(null)
  const blocking = useRef(new Set<number>())
  useFrame(({ camera }, delta) => {
    const r = (ray.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }))
    const hits = blocking.current
    hits.clear()
    const from = { x: playerPosition.x, y: playerPosition.y + 0.6, z: playerPosition.z }
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    for (const [sx, sy] of WINDOW) {
      target.copy(camera.position).addScaledVector(right, sx).addScaledVector(up, sy)
      const dx = target.x - from.x
      const dy = target.y - from.y
      const dz = target.z - from.z
      const length = Math.hypot(dx, dy, dz)
      if (length < 0.3) continue
      r.origin = from
      r.dir = { x: dx / length, y: dy / length, z: dz / length }
      world.intersectionsWithRay(r, length + 0.3, true, (hit) => {
        const body = hit.collider.parent()
        if (body) hits.add(body.handle)
        return true
      })
    }
    const k = 1 - Math.exp(-10 * delta)
    for (const [handle, look] of fadeBodies) {
      const target = hits.has(handle) ? FADED : 1
      if (look.opacity === target) continue
      look.opacity = Math.abs(look.opacity - target) < 0.01 ? target : THREE.MathUtils.lerp(look.opacity, target, k)
      const transparent = look.opacity < 0.99
      if (look.transparent !== transparent) {
        look.transparent = transparent
        look.depthWrite = !transparent
        look.needsUpdate = true
      }
    }
  })
  return null
}

// The camera shakes (after the player has placed it): pieces breaking nearby, quakes, the crown trembling
function CameraShake() {
  useFrame(({ camera, clock }) => {
    const a = shakeAt(raceClock())
    if (a <= 0) return
    const time = clock.elapsedTime
    camera.rotateX((Math.sin(time * 53) + Math.sin(time * 31.7) * 0.5) * a)
    camera.rotateY(Math.sin(time * 47.3) * a)
    camera.rotateZ(Math.sin(time * 39.1) * a * 0.6)
  })
  return null
}

// What the status line says, depending on where you are
const wind = { x: 0, z: 0 }
function status(t: number) {
  if (t < COUNTDOWN_SECONDS || raceOver()) return null
  if (surviving(t)) {
    // (Somebody else got there first)
    if (playerPosition.y < CROWN.top - 1 && t < collapseAt()) return `The crown's taken! The tower falls in ${Math.ceil(collapseAt() - t)}s`
    const next = nextStageIn(t)
    if (next === null) return `Last stand! Hold on for ${Math.ceil(survivalEnd() - t)}s`
    return `Crown ${SURVIVAL.sizes[stageAt(t)]} · shrinks in ${Math.ceil(next)}s`
  }
  const p = playerPosition
  const r = Math.hypot(p.x, p.z)
  if (p.y > RING.y0 - 1.5 && r > TOWER.outer - 0.3) {
    if (windAt(t, wind) > 0) return 'Gust! Hold on!'
    const n = nextGustIn(t)
    return n <= 3 ? `Gust in ${Math.ceil(n)}…` : 'Round the ring and up to the crown!'
  }
  if (r < TOWER.inner && p.y > FLOOR_Y - 0.5) return t >= T.helix ? 'The ramp is crumbling below you!' : 'Climb the spiral ramp!'
  if (t < T.cracks) return `The courtyard cracks in ${Math.ceil(T.cracks - t)}s`
  return 'The courtyard is falling! Get into the tower!'
}

// Keeps the status line up to date, darkens the sky as the tower comes down, and plays the big cues
function Director({ sky, fog }: { sky: RefObject<THREE.Color | null>; fog: RefObject<THREE.Fog | null> }) {
  const cues = useRef({ cracked: false, crown: false })
  useFrame(() => {
    const t = raceClock()
    const state = cues.current
    setRaceStatus(status(t))
    const storm = surviving(t) ? Math.min(1, 0.6 + (t - survival.start) / 60) : THREE.MathUtils.clamp((t - T.helix) / 90, 0, 0.55)
    sky.current?.copy(CLEAR).lerp(STORMY, storm)
    fog.current?.color.copy(CLEAR).lerp(STORMY, storm)
    setTremor(surviving(t) ? 0.0015 + stageAt(t) * 0.0012 : 0)
    if (!state.cracked && t >= T.cracks) {
      state.cracked = true
      sfx.rumble()
      if (playerPosition.y < FLOOR_Y + 2) shakeCamera(0.015, 1.5, t)
    }
    if (!state.crown && surviving(t)) {
      state.crown = true
      shakeCamera(0.03, 1.2, t)
    }
  })
  return null
}

export function CrumbleScene() {
  const sky = useRef<THREE.Color>(null)
  const fog = useRef<THREE.Fog>(null)
  useLayoutEffect(() => {
    resetSurvival()
    resetShake()
    dust.length = 0
    startRace(CRUMBLE_COURSE)
  }, [])

  return (
    <>
      <color ref={sky} attach="background" args={[CLEAR]} />
      <fog ref={fog} attach="fog" args={[CLEAR, 110, 330]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#e3f2ff', '#8a7a6a', 0.65]} />
      <FollowSun offset={[22, 34, 10]} intensity={2} color="#fff1d6" extent={34} />
      <Scenery />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Courtyard />
        <InnerTower />
        <Ring />
        <Crown />
        <SpectatorIsland />
        <Player spawn={SPAWNS[PLAYER_SLOT]} rules={RULES} />
        <RaceBots route={CRUMBLE_ROUTE} starts={BOT_STARTS} count={14} lane={botLane} knockout />
        <FadeBlockers />
      </Physics>

      <Dust />
      <Director sky={sky} fog={fog} />
      <CameraShake />
      <Confetti origin={[0, CROWN.top + 8, 0]} spread={10} />
    </>
  )
}
