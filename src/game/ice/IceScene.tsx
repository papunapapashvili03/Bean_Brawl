import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
import * as THREE from 'three'
import { CloudSea, SpectatorIsland } from '../crumble/Scenery'
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
  racers,
  setRaceStatus,
  startRace,
} from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import type { BotTraits } from '../race/bots/steering'
import { Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { Arena } from './Arena'
import { IceBrain } from './brain'
import { END, ICE_COURSE, LAYERS, OUT_Y, PLAYER_SLOT, SPAWNS, SPECTATOR, layerOf } from './course'
import { endRound, resetIce, round } from './tiles'

// Crack Up (see ./course): three floors of ice that cracks under you and gives way if you stand on it. Through
// the bottom one you're out, and watch the rest from the island off to the side. Last one standing wins;
// still standing when the five minutes are up, everyone left wins.

const SKY = '#bfe2ff'
const BOTS = 15
const BOT_STARTS = SPAWNS.filter((_, i) => i !== PLAYER_SLOT)
const steer = (bot: BotTraits) => new IceBrain(bot)
// (Once the round's decided, nobody else goes out: whoever's left is in, even if they're still falling)
const BOT_RULES = { fallY: () => (round.over ? -Infinity : OUT_Y) }

// Once you're out, you're taken to the spectator island a moment later, wherever you've ended up
const TO_SPECTATORS_AFTER = 2.5
let outSince: number | null = null
const RULES = raceRules({
  fallY: () => {
    if (getRaceView().phase !== 'eliminated') {
      outSince = null
      return OUT_Y
    }
    outSince ??= raceClock()
    const away = Math.hypot(playerPosition.x - SPECTATOR[0], playerPosition.z - SPECTATOR[2]) > 12
    return away && raceClock() - outSince > TO_SPECTATORS_AFTER ? Infinity : OUT_Y
  },
  respawnAt: () => {
    eliminate()
    return SPECTATOR
  },
})

const COURSE = {
  ...ICE_COURSE,
  finishTitle: () => (round.lastStanding ? 'Last one standing!' : 'Survived!'),
}

// The round ends when there's one left (or nobody), or when time's up; whoever's still standing then wins,
// and the ice stays as it is
function Referee() {
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (round.over || t < COUNTDOWN_SECONDS) return
    const playerIn = !raceOver()
    const bots = racers().filter((r) => r.outClock === null)
    const left = bots.length + (playerIn ? 1 : 0)
    if (left <= 1) endRound(true, playerIn ? null : (bots[0]?.name ?? null))
    else if (t >= END) endRound(false, null)
    else return
    if (playerIn) finishRace()
  })
  return null
}

const clock = (s: number) => {
  const whole = Math.max(0, Math.ceil(s))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
function status(t: number) {
  if (t < COUNTDOWN_SECONDS) return null
  const stillIn = racers().filter((r) => r.outClock === null).length + (raceOver() ? 0 : 1)
  if (round.over) {
    if (!round.lastStanding) return `Time's up! ${stillIn} still standing`
    return round.winner ? `${round.winner} is the last one standing!` : 'Nobody left standing!'
  }
  if (raceOver()) return `${stillIn} still standing · ${clock(END - t)} left`
  return `Floor ${layerOf(playerPosition.y - 1) + 1} of ${LAYERS} · ${clock(END - t)} left`
}
function Director() {
  useFrame(() => setRaceStatus(status(raceClock())))
  return null
}

// Snow, drifting down round the floors
const FLAKES = 900
const SNOW_BOX = { x: 70, y: 40, z: 70, bottom: -10 }
const SNOW = (() => {
  const g = new THREE.BufferGeometry()
  const at = new Float32Array(FLAKES * 3)
  for (let k = 0; k < FLAKES; k++) {
    at[k * 3] = (Math.random() - 0.5) * SNOW_BOX.x
    at[k * 3 + 1] = SNOW_BOX.bottom + Math.random() * SNOW_BOX.y
    at[k * 3 + 2] = (Math.random() - 0.5) * SNOW_BOX.z
  }
  g.setAttribute('position', new THREE.BufferAttribute(at, 3))
  return g
})()
const FLAKE_LOOK = new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false })

function Snow() {
  const time = useRef(0)
  useFrame((_, delta) => {
    time.current += delta
    const at = SNOW.getAttribute('position') as THREE.BufferAttribute
    const a = at.array as Float32Array
    for (let k = 0; k < FLAKES; k++) {
      let y = a[k * 3 + 1] - (0.9 + (k % 7) * 0.12) * delta
      if (y < SNOW_BOX.bottom) y += SNOW_BOX.y
      a[k * 3 + 1] = y
      a[k * 3] += Math.sin(time.current * 0.7 + k) * 0.25 * delta
    }
    at.needsUpdate = true
  })
  return <points geometry={SNOW} material={FLAKE_LOOK} frustumCulled={false} />
}

const confettiAt = (): [number, number, number] => [playerPosition.x, playerPosition.y + 5, playerPosition.z]

export function IceScene() {
  useLayoutEffect(() => {
    resetIce()
    startRace(COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 90, 280]} />
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#ffffff', '#9fb8d9', 0.65]} />
      <FollowSun offset={[18, 34, 12]} intensity={1.8} color="#f4f8ff" extent={30} />
      <CloudSea />
      <Snow />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Arena />
        <SpectatorIsland at={SPECTATOR} />
        <Player spawn={SPAWNS[PLAYER_SLOT]} rules={RULES} />
        <RaceBots steer={steer} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} knockout />
        <Referee />
      </Physics>

      <Director />
      <Confetti origin={confettiAt} spread={6} />
    </>
  )
}
