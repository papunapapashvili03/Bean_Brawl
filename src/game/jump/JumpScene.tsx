import { useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
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
import { JumpBrain } from './brain'
import { END, JUMP_COURSE, MAX_SPIN, OUT_Y, PLAYER_SLOT, SECTIONS, SPAWNS, SPECTATOR, START_SPIN } from './course'
import { dropped, endRound, lowSpin, resetJump, round } from './state'

// Jump Showdown (see ./course): jump the low beam, duck the high one, as they turn faster and faster and the
// platform drops away under you. Off it, you're out, and watch the rest from the island off to the side.
// Last one standing wins; still standing when the five minutes are up, everyone left wins.

const SKY = '#ffc9e6'
const BOTS = 15
const BOT_STARTS = SPAWNS.filter((_, i) => i !== PLAYER_SLOT)
const steer = (bot: BotTraits) => new JumpBrain(bot)
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
  ...JUMP_COURSE,
  finishTitle: () => (round.lastStanding ? 'Last one standing!' : 'Survived!'),
}

// The round ends when there's one left (or nobody), or when time's up; whoever's still standing then wins,
// and the beams stop
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
    if (playerIn) finishRace()
  })
  return null
}

function status(t: number) {
  if (t < COUNTDOWN_SECONDS) return null
  const stillIn = racers().filter((r) => r.outClock === null).length + (raceOver() ? 0 : 1)
  if (round.over) {
    if (!round.lastStanding) return `Time's up! ${stillIn} still standing`
    return round.winner ? `${round.winner} is the last one standing!` : 'Nobody left standing!'
  }
  const pace = Math.round((100 * (lowSpin(t) - START_SPIN)) / (MAX_SPIN - START_SPIN))
  const left = SECTIONS - dropped.reduce((n, d) => n + d, 0)
  return `${stillIn} still standing · Speed ${Math.max(0, pace)}% · ${left} sections`
}
function Director() {
  useFrame(() => setRaceStatus(status(raceClock())))
  return null
}

const confettiAt = (): [number, number, number] => [playerPosition.x, playerPosition.y + 5, playerPosition.z]

export function JumpScene() {
  useLayoutEffect(() => {
    resetJump()
    startRace(COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 90, 280]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#c99ccf', 0.6]} />
      <FollowSun offset={[18, 34, 12]} intensity={1.9} color="#fff6e6" extent={30} />
      <CloudSea />

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
