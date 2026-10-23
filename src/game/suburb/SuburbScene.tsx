import { Physics } from '@react-three/rapier'
import { Bots } from '../bots/Bots'
import { playerCanMove } from '../bots/match'
import { outlineBounds } from '../bots/nav'
import type { BotsSetup } from '../bots/setup'
import { GunDisplay } from '../experimental/guns/GunDisplay'
import { Backdrop } from '../maps/Backdrop'
import { World, type MapData } from '../maps/World'
import { PHYSICS_PRIORITY, Player, type PlayerRules } from '../Player'
import { FollowSun } from '../race/RaceKit'
import { EDGES, HULLS, OUTLINE, PIECES, PLAYER_SPAWN, RACKS, RAMPS, SPAWNS, TEAM_COLOURS, ZONES, insideOutline } from './layout'
import { Props } from './Props'

// Suburb (see ./layout): a desert cul-de-sac for gunfights. You start in the west back yard with your team's
// racks beside you (F to pick up); the yellow house stands between you and the cars in the circle.

const SKY = '#a9c9e6'
const RULES: PlayerRules = { fallY: -20, cameraYaw: -Math.PI / 2, cameraCollides: true, canMove: playerCanMove }
// The red side in crimson, so its bots don't look like the (orange) player
const ENEMY_RED = '#c8283f'
const BOTS: BotsSetup = {
  id: 'suburb',
  teams: [
    { id: 'west', name: 'Blue', colour: TEAM_COLOURS.west, spawns: SPAWNS.west },
    { id: 'east', name: 'Red', colour: ENEMY_RED, spawns: SPAWNS.east },
  ],
  playerTeam: 'west',
  playerSpawn: PLAYER_SPAWN,
  size: 4,
  bounds: outlineBounds(OUTLINE),
  fallY: -20,
}
const MAP: MapData = { outline: OUTLINE, zones: ZONES, pieces: PIECES, ramps: RAMPS, hulls: HULLS, edges: EDGES, ground: 'dryGrass' }

export function SuburbScene() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 150, 480]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#eef4f8', '#a8916a', 0.55]} />
      <FollowSun offset={[24, 42, 14]} intensity={2.5} color="#fff0d6" extent={40} />
      <Backdrop inside={insideOutline} dry trees={70} palms={50} />

      <Physics gravity={[0, -20, 0]} updatePriority={PHYSICS_PRIORITY}>
        <World data={MAP} />
        <Props />
        <GunDisplay racks={RACKS} />
        <Player spawn={PLAYER_SPAWN} rules={RULES} />
        <Bots setup={BOTS} />
      </Physics>
    </>
  )
}
