import { Physics } from '@react-three/rapier'
import { CloudSea } from '../crumble/Scenery'
import { Bots } from '../bots/Bots'
import { playerCanMove } from '../bots/match'
import { outlineBounds } from '../bots/nav'
import type { BotsSetup } from '../bots/setup'
import { GunDisplay } from '../experimental/guns/GunDisplay'
import { PHYSICS_PRIORITY, Player, type PlayerRules } from '../Player'
import { FollowSun } from '../race/RaceKit'
import { Ball, Cone, Cylinder, Prism } from '../Shapes'
import { FALL_Y, OUTLINE, PLAYER_SPAWN, RACKS, SHAPES, SPAWNS, TEAM_COLOURS } from './layout'
import { Structures } from './Structures'

// Brick Fort (see ./layout): a gun-fight arena on a floating island above the clouds. You start in the
// north base: pick up guns from the racks behind you (F), and climb anything with tape on its edge.

const SKY = '#9fd8ff'
const RULES: PlayerRules = { fallY: FALL_Y, canMove: playerCanMove }
// Four a side: you and three bots in blue against four in pink
const BOTS: BotsSetup = {
  id: 'arena',
  teams: [
    { id: 'north', name: 'Blue', colour: TEAM_COLOURS.north, spawns: SPAWNS.north },
    { id: 'south', name: 'Pink', colour: '#d93a7c', spawns: SPAWNS.south }, // raspberry: clear of the orange player
  ],
  playerTeam: 'north',
  playerSpawn: PLAYER_SPAWN,
  size: 4,
  bounds: outlineBounds(OUTLINE),
  fallY: FALL_Y,
}

function LooseShapes() {
  return (
    <>
      {SHAPES.map((s, i) => {
        if (s.kind === 'ball') return <Ball key={i} position={s.at} color={s.color} restitution={0.4} />
        if (s.kind === 'prism') return <Prism key={i} sides={s.sides} position={s.at} color={s.color} />
        if (s.kind === 'cone') return <Cone key={i} position={s.at} color={s.color} />
        return <Cylinder key={i} position={s.at} rotation={s.lying ? [0, 0, Math.PI / 2] : [0, 0, 0]} color={s.color} />
      })}
    </>
  )
}

export function ArenaScene() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 100, 330]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#c7b8ff', 0.5]} />
      <FollowSun offset={[14, 28, 10]} intensity={1.6} color="#ffffff" extent={30} />
      <CloudSea />

      <Physics gravity={[0, -20, 0]} updatePriority={PHYSICS_PRIORITY}>
        <Structures />
        <LooseShapes />
        <GunDisplay racks={RACKS} />
        <Player spawn={PLAYER_SPAWN} rules={RULES} />
        <Bots setup={BOTS} />
      </Physics>
    </>
  )
}
