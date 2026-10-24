import { useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
import * as THREE from 'three'
import { SpectatorIsland } from '../crumble/Scenery'
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
  setRaceCallout,
  setRaceStatus,
  startRace,
} from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import type { BotTraits } from '../race/bots/steering'
import { Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { Arena } from './Arena'
import { LavaBrain } from './brain'
import { END, IN_LAVA, LAVA_COURSE, PLAYER_SLOT, SPAWNS, SPECTATOR } from './course'
import { endRound, lavaAt, nextTide, resetLava, round } from './pillars'

// Floor is Lava (see ./course): pillars rising and sinking out of a sea of lava that keeps coming up. Touch it
// and you're out, and watch the rest from the island off to the side. Last one standing wins; still standing
// when the three minutes are up, everyone left wins.

const HORIZON = '#ff9a5c'
const BOTS = 15
const BOT_STARTS = SPAWNS.filter((_, i) => i !== PLAYER_SLOT)
const steer = (bot: BotTraits) => new LavaBrain(bot)
const inLava = () => lavaAt(raceClock()) + IN_LAVA
// (Once the round's decided, nobody else goes out)
const BOT_RULES = { fallY: () => (round.over ? -Infinity : inLava()) }

// Once you're out, you're taken to the spectator island a moment later, wherever you've ended up
const TO_SPECTATORS_AFTER = 2
let outSince: number | null = null
const RULES = raceRules({
  fallY: () => {
    if (getRaceView().phase !== 'eliminated') {
      outSince = null
      return round.over ? -Infinity : inLava()
    }
    outSince ??= raceClock()
    const away = Math.hypot(playerPosition.x - SPECTATOR[0], playerPosition.z - SPECTATOR[2]) > 12
    return away && raceClock() - outSince > TO_SPECTATORS_AFTER ? Infinity : -Infinity
  },
  respawnAt: () => {
    eliminate()
    return SPECTATOR
  },
})

const COURSE = {
  ...LAVA_COURSE,
  finishTitle: () => (round.lastStanding ? 'Last one standing!' : 'Survived!'),
}

// The round ends when there's one left (or nobody), or when time's up; whoever's still standing then wins,
// and everything stops where it is
function Referee() {
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (round.over || t < COUNTDOWN_SECONDS) return
    const playerIn = !raceOver()
    const bots = racers().filter((r) => r.outClock === null)
    const left = bots.length + (playerIn ? 1 : 0)
    if (left <= 1) endRound(true, playerIn ? null : (bots[0]?.name ?? null), t)
    else if (t >= END) endRound(false, null, t)
    else return
    setRaceCallout(null)
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
  const tide = Math.ceil(nextTide(t) - t)
  return `${stillIn} still standing · tide in ${tide}s · ${clock(END - t)} left`
}
function Director() {
  useFrame(() => setRaceStatus(status(raceClock())))
  return null
}

// The sky: deep purple overhead, glowing orange low down over the lava
const SKY_DOME = (() => {
  const g = new THREE.SphereGeometry(500, 32, 16)
  const top = new THREE.Color('#3d2466')
  const low = new THREE.Color(HORIZON)
  const colours: number[] = []
  const p = g.getAttribute('position')
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const k = THREE.MathUtils.clamp(p.getY(i) / 220, 0, 1)
    c.copy(low).lerp(top, Math.sqrt(k))
    colours.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  return g
})()
const SKY_LOOK = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })

const confettiAt = (): [number, number, number] => [playerPosition.x, playerPosition.y + 5, playerPosition.z]

export function LavaScene() {
  useLayoutEffect(() => {
    resetLava()
    startRace(COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, 70, 260]} />
      <mesh geometry={SKY_DOME} material={SKY_LOOK} renderOrder={-1} />
      <ambientLight intensity={0.55} />
      {/* (Lit from below by the lava) */}
      <hemisphereLight args={['#c9b6ff', '#ff6a2a', 0.85]} />
      <FollowSun offset={[16, 32, 12]} intensity={1.6} color="#ffe2c4" extent={26} />

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
