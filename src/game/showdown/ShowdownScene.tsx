import { useLayoutEffect } from 'react'
import { Stars } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Bots } from '../bots/Bots'
import { playerCanMove } from '../bots/match'
import type { BotsSetup } from '../bots/setup'
import { GunDisplay } from '../experimental/guns/GunDisplay'
import { NEON } from '../neon/course'
import { Billboard, CircuitClock, NeonArch, Skyline, SkyBalloons } from '../neon/scenery'
import { SKY_COLOR } from '../neon/sceneryKit'
import { PHYSICS_PRIORITY, Player, type PlayerRules } from '../Player'
import { STEP, startRace, surfaces } from '../race/race'
import { FollowSun, MatchClock } from '../race/RaceKit'
import { Arena } from './Arena'
import { Balloons, BlackoutGrid, Clouds, Highway, Ladders } from './Hazards'
import { CITY_AREA, FALL_Y, HALF_X, HALF_Z, PLAYER_SPAWN, RACKS, SHOWDOWN_COURSE, SKY_BALLOONS, SPAWNS, TEAM, nearArena } from './layout'

// Neon Showdown (see ./layout): a gunfight in the neon city, on the glowing circuit board among the towers.
// You start on the west pad with your team's racks behind you (F to pick up).

const RULES: PlayerRules = {
  fallY: FALL_Y,
  cameraYaw: -Math.PI / 2,
  cameraCollides: true,
  surfaceVelocity: (handle, p) => surfaces.get(handle)?.(p) ?? null,
  canMove: playerCanMove,
}
const BOTS: BotsSetup = {
  id: 'showdown',
  teams: [
    { id: 'west', name: 'Cyan', colour: TEAM.west, spawns: SPAWNS.west },
    { id: 'east', name: 'Pink', colour: TEAM.east, spawns: SPAWNS.east },
  ],
  playerTeam: 'west',
  playerSpawn: PLAYER_SPAWN,
  size: 4,
  bounds: { x0: -HALF_X, x1: HALF_X, z0: -HALF_Z, z1: HALF_Z, inside: () => true },
  fallY: FALL_Y,
}
const TOWER_HEIGHT: [number, number] = [18, 82]

export function ShowdownScene() {
  // Restart the match clock: the moving pieces all run off it
  useLayoutEffect(() => {
    startRace(SHOWDOWN_COURSE)
  }, [])

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 90, 360]} />
      <Stars radius={260} depth={80} count={3000} factor={6} fade speed={0.6} />
      <hemisphereLight args={['#a99cff', '#2a1a5c', 1.1]} />
      <ambientLight intensity={0.45} />
      <FollowSun offset={[-16, 30, 12]} intensity={1.4} color="#cfc8ff" extent={40} />

      {/* The city round the arena */}
      <CircuitClock />
      <Skyline floorY={0} area={CITY_AREA} blocked={nearArena} count={240} height={TOWER_HEIGHT} trims={0.45} />
      <Billboard position={[-58, 12, 0]} rotationY={Math.PI / 2} lines={['NEON', 'SHOWDOWN']} />
      <Billboard position={[58, 12, 0]} rotationY={-Math.PI / 2} lines={['NEON', 'CIRCUIT']} />
      <Billboard position={[0, 13, -40]} lines={['NEON', 'SHOWDOWN']} />
      <SkyBalloons spots={SKY_BALLOONS} />
      <NeonArch position={[-110, 0, -90]} radii={[40, 43]} colors={[NEON.pink, NEON.cyan]} rotationY={0.5} />
      <NeonArch position={[125, 0, 70]} radii={[50]} colors={[NEON.cyan]} rotationY={-0.4} />
      <NeonArch position={[0, 0, -190]} radii={[60, 64, 68]} colors={[NEON.pink, NEON.cyan, NEON.yellow]} />
      <NeonArch position={[-30, 0, 170]} radii={[46, 50]} colors={[NEON.yellow, NEON.pink]} rotationY={0.2} />

      <Physics gravity={[0, -20, 0]} timeStep={STEP} updatePriority={PHYSICS_PRIORITY}>
        <MatchClock />
        <Arena />
        <Highway />
        <BlackoutGrid />
        <Ladders />
        <Balloons />
        <Clouds />
        <GunDisplay racks={RACKS} />
        <Player spawn={PLAYER_SPAWN} rules={RULES} />
        <Bots setup={BOTS} />
      </Physics>

      {/* Glow on anything brighter than white: neon, lit windows, pulses, the circuit's rings */}
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.15} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}
