import { useLayoutEffect, useMemo } from 'react'
import { Stars } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { PHYSICS_PRIORITY, Player } from '../Player'
import { checkerTexture } from '../race/materials'
import { Block, Strip } from '../race/parts'
import { STEP, raceRules, startRace } from '../race/race'
import { RaceBots } from '../race/bots/RaceBots'
import { CheckpointFlag, Confetti, FollowSun, MatchClock } from '../race/RaceKit'
import { FALL_Y, FINISH_DECK, FINISH_Z, FLOOR_Y, NEON, NEON_COURSE, SPAWN, START, TOP_DECK, LANDING } from './course'
import { neon } from './neonMaterial'
import { BalloonLift, BlackoutGrid, CloudHop, Highway, LadderClimb } from './obstacles'
import { BOT_STARTS, NEON_ROUTE, botLane } from './route'
import { Billboard, CircuitFloor, NeonArch, Skyline, SkyBalloons } from './scenery'
import { SKY_COLOR } from './sceneryKit'

const NEON_RULES = raceRules({ fallY: FALL_Y })
const BOT_RULES = { fallY: FALL_Y }
const BOTS = 9
const COURSE_CENTER: [number, number] = [0, -80]

// The towers stand on the circuit board far below, in a wide band either side of the course
const SKYLINE_AREA: [number, number, number, number] = [-260, 260, -300, 80]
const besideCourse = (x: number, _z: number, w: number) => Math.abs(x) - w / 2 < 42
const SKY_BALLOONS: [number, number, number][] = [
  [-30, 14, -70],
  [34, 20, -95],
  [-38, 24, -140],
  [28, 12, -40],
]

function StartPad() {
  const line = useMemo(() => checkerTexture(12, 1), [])
  const half = START.width / 2
  return (
    <group>
      <Block min={[-half, -1, START.zFront]} max={[half, 0, START.zBack]} color={NEON.roadSide} top={NEON.road} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (half - 0.1), 0.06, (START.zFront + START.zBack) / 2]} material={neon(s < 0 ? NEON.yellow : NEON.cyan)}>
          <boxGeometry args={[0.18, 0.12, START.zBack - START.zFront]} />
        </mesh>
      ))}
      <Strip y={0} z={START.zFront + 0.6} width={START.width} depth={1} map={line} />
      <NeonArch position={[0, 0, START.zFront - 0.2]} radii={[4.6]} colors={[NEON.cyan]} tube={0.25} />
    </group>
  )
}

function FinishDeck() {
  const line = useMemo(() => checkerTexture(12, 2), [])
  const y = FINISH_DECK.max[1]
  return (
    <group>
      <Block min={FINISH_DECK.min} max={FINISH_DECK.max} color={NEON.roadSide} top={NEON.road} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 6.9, y + 0.06, (FINISH_DECK.min[2] + FINISH_DECK.max[2]) / 2]} material={neon(NEON.pink)}>
          <boxGeometry args={[0.18, 0.12, FINISH_DECK.max[2] - FINISH_DECK.min[2]]} />
        </mesh>
      ))}
      <Strip y={y} z={FINISH_Z} width={12} depth={1.2} map={line} />
      <NeonArch position={[0, y, FINISH_Z]} radii={[6.4, 7.2, 8]} colors={[NEON.pink, NEON.cyan, NEON.yellow]} tube={0.28} />
    </group>
  )
}

export function NeonScene() {
  useLayoutEffect(() => {
    startRace(NEON_COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 90, 330]} />
      <Stars radius={260} depth={80} count={3000} factor={6} fade speed={0.6} />
      <hemisphereLight args={['#a99cff', '#2a1a5c', 1.1]} />
      <ambientLight intensity={0.45} />
      <FollowSun offset={[-16, 30, 12]} intensity={1.4} color="#cfc8ff" />

      <CircuitFloor center={COURSE_CENTER} y={FLOOR_Y} />
      <Skyline floorY={FLOOR_Y} area={SKYLINE_AREA} blocked={besideCourse} />
      <Billboard position={[-22, 4, -26]} rotationY={0.9} />
      <SkyBalloons spots={SKY_BALLOONS} />
      <NeonArch position={[-70, FLOOR_Y, -60]} radii={[40, 43]} colors={[NEON.pink, NEON.cyan]} rotationY={0.5} />
      <NeonArch position={[85, FLOOR_Y, -150]} radii={[50]} colors={[NEON.cyan]} rotationY={-0.4} />
      <NeonArch position={[0, FLOOR_Y, -240]} radii={[60, 64, 68]} colors={[NEON.pink, NEON.cyan, NEON.yellow]} />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <StartPad />
        <Highway />
        <BlackoutGrid />
        <LadderClimb />
        <Block min={TOP_DECK.min} max={TOP_DECK.max} color={NEON.roadSide} top={NEON.road} />
        <BalloonLift />
        <Block min={LANDING.min} max={LANDING.max} color={NEON.roadSide} top={NEON.road} />
        <CloudHop />
        <FinishDeck />
        <Player spawn={SPAWN} rules={NEON_RULES} />
        <RaceBots route={NEON_ROUTE} starts={BOT_STARTS} count={BOTS} rules={BOT_RULES} lane={botLane} />
      </Physics>

      {NEON_COURSE.checkpoints.map((c, i) => (
        <CheckpointFlag key={i} position={[c.respawn[0] + 2.4, c.respawn[1] - 1.3, c.respawn[2]]} />
      ))}
      <Confetti origin={[0, FINISH_DECK.max[1] + 7, FINISH_Z]} />

      {/* Glow on anything brighter than white: neon materials, lit windows, pulses, the circuit rings */}
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.15} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}
