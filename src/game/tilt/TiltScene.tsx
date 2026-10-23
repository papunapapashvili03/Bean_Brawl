import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
import { Dust } from '../crumble/Crumble'
import { dust } from '../crumble/dust'
import { CloudSea, SpectatorIsland } from '../crumble/Scenery'
import { resetShake, shakeAt, shakeCamera } from '../crumble/shake'
import { PHYSICS_PRIORITY, Player } from '../Player'
import {
  COUNTDOWN_SECONDS,
  STEP,
  eliminate,
  finishRace,
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
import { END, FALL_Y, LOWEST_EDGE, PLAYER_SLOT, RINGS, SPAWNS, SPECTATOR, TILTS, TILT_COURSE, WARN, nextBreakIn, nextTiltIn, radiusAt } from './course'
import { Platform } from './Platform'
import { Props } from './Props'
import { BOT_STARTS, TILT_ROUTE, botLane } from './route'

// Tilt Town (see ./course): hold on to a tipping, shrinking town for a minute. Falling off is out, and you
// watch the rest from the spectator island.

const SKY = '#8fd0ff'

// Once you're out, you're taken to the spectator island a moment later, wherever you've ended up
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
})

// Off the town (well below its lowest edge) is out; still on it when the minute is up is a win
const OFF = LOWEST_EDGE - 4
const BOT_RULES = { fallY: OFF }
const BOTS = 11
function Referee() {
  useBeforePhysicsStep(() => {
    if (raceOver()) return
    const t = raceClock() + STEP
    if (t < COUNTDOWN_SECONDS) return
    const p = playerPosition
    if (p.y < OFF) eliminate()
    else if (t >= END) {
      if (Math.hypot(p.x, p.z) < radiusAt(t) + 1.5) finishRace()
      else eliminate()
    }
  })
  return null
}

// The status line, and the big moments: a rumble as the town starts to tip, a crack as a ring starts to go
function status(t: number) {
  if (t < COUNTDOWN_SECONDS || raceOver()) return null
  const left = Math.max(0, Math.ceil(END - t))
  const tilt = nextTiltIn(t)
  const breaks = nextBreakIn(t)
  const parts = [`Hold on! ${left}s`]
  if (breaks !== null && breaks < WARN + 0.5) parts.push('The edge is breaking!')
  else if (tilt !== null && tilt < 2.5) parts.push(`Tipping in ${Math.ceil(tilt)}…`)
  return parts.join(' · ')
}
function Director() {
  const cues = useRef({ tilts: 0, rings: 0 })
  useFrame(() => {
    const t = raceClock()
    setRaceStatus(status(t))
    const c = cues.current
    const onTown = !raceOver() || getRaceView().phase === 'finished'
    while (c.tilts < TILTS.length && t >= TILTS[c.tilts].at) {
      c.tilts++
      if (onTown) {
        sfx.rumble()
        shakeCamera(0.012, 1.2, t)
      }
    }
    while (c.rings < RINGS.length && t >= RINGS[c.rings].breaks - WARN) {
      c.rings++
      if (onTown) sfx.thunder()
    }
  })
  return null
}

// The camera shakes (after the player has placed it) as the town tips and breaks
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

export function TiltScene() {
  useLayoutEffect(() => {
    resetShake()
    dust.length = 0
    startRace(TILT_COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 90, 300]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#b8a98f', 0.6]} />
      <FollowSun offset={[18, 32, 12]} intensity={1.9} color="#fff6e6" extent={34} />
      <CloudSea />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Platform />
        <Props />
        <SpectatorIsland at={SPECTATOR} />
        <Player spawn={SPAWNS[PLAYER_SLOT]} rules={RULES} />
        <RaceBots route={TILT_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} knockout />
        <Referee />
      </Physics>

      <Dust />
      <Director />
      <CameraShake />
      <Confetti origin={[0, 9, 0]} spread={10} />
    </>
  )
}
