import { useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
import { SpectatorIsland } from '../crumble/Scenery'
import { PHYSICS_PRIORITY, Player } from '../Player'
import {
  COUNTDOWN_SECONDS,
  STEP,
  eliminate,
  eliminateRacer,
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
import { RushBrain } from './brain'
import { END, LASER_X, OUT_Y, PLAYER_SLOT, RUSH_COURSE, SPAWNS, SPECTATOR } from './course'
import { endRound, resetWalls, round, speedAt } from './walls'

// Wall Rush (see ./course): walls of blocks sliding down the stage at you. Get shoved off the back into the
// slime, or touch a laser, and you're out, and watch the rest from the island off to the side. Last one
// standing wins; still standing when the three minutes are up, everyone left wins.

const SKY = '#9fd8ff'
const BOTS = 15
const BOT_STARTS = SPAWNS.filter((_, i) => i !== PLAYER_SLOT)
const steer = (bot: BotTraits) => new RushBrain(bot)
// (A runner's side against a laser)
const onLaser = (x: number) => Math.abs(x) + 0.5 > LASER_X
// (Once the round's decided, nobody else goes out)
const BOT_RULES = { fallY: () => (round.over ? -Infinity : OUT_Y) }

// Out (in the slime, or on a laser): you're taken to the spectator island a moment later
const TO_SPECTATORS_AFTER = 2
let outSince: number | null = null
const RULES = raceRules({
  fallY: () => {
    if (getRaceView().phase !== 'eliminated') {
      outSince = null
      if (round.over) return -Infinity
      // (A laser: out at once, as if fallen)
      return onLaser(playerPosition.x) && raceClock() >= COUNTDOWN_SECONDS ? Infinity : OUT_Y
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
  ...RUSH_COURSE,
  finishTitle: () => (round.lastStanding ? 'Last one standing!' : 'Survived!'),
}

// Bots on a laser go out; and the round ends when there's one left (or nobody), or when time's up: whoever's
// still standing then wins, and the walls stop where they are
function Referee() {
  useBeforePhysicsStep(() => {
    const t = raceClock() + STEP
    if (round.over || t < COUNTDOWN_SECONDS) return
    for (const r of racers()) if (r.outClock === null && onLaser(r.at.x) && r.at.y > OUT_Y) eliminateRacer(r)
    const playerIn = !raceOver()
    const bots = racers().filter((r) => r.outClock === null)
    const left = bots.length + (playerIn ? 1 : 0)
    if (left <= 1) endRound(true, playerIn ? null : (bots[0]?.name ?? null), t)
    else if (t >= END) endRound(false, null, t)
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
  return `${stillIn} still standing · walls at ${speedAt(t).toFixed(1)} m/s · ${clock(END - t)} left`
}
function Director() {
  useFrame(() => setRaceStatus(status(raceClock())))
  return null
}

const confettiAt = (): [number, number, number] => [playerPosition.x, playerPosition.y + 5, playerPosition.z]

export function RushScene() {
  useLayoutEffect(() => {
    resetWalls()
    startRace(COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 80, 260]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#7ee03c', 0.55]} />
      <FollowSun offset={[14, 30, 18]} intensity={1.8} color="#fff6e6" extent={30} />

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
