import { Physics } from '@react-three/rapier'
import { Bots } from '../bots/Bots'
import { playerCanMove } from '../bots/match'
import { outlineBounds } from '../bots/nav'
import type { BotsSetup } from '../bots/setup'
import { GunDisplay } from '../experimental/guns/GunDisplay'
import { PHYSICS_PRIORITY, Player, type PlayerRules } from '../Player'
import { FollowSun } from '../race/RaceKit'
import { Backdrop } from '../maps/Backdrop'
import { World, type MapData } from '../maps/World'
import { EDGES, HULLS, OUTLINE, PIECES, PLAYER_SPAWN, RACKS, RAMPS, SPAWNS, TEAM_COLOURS, ZONES, insideOutline } from './layout'
import { Props } from './Props'

// Hillside (see ./layout): a walled hillside compound for gunfights. You start in the west garden with your
// team's racks beside you (F to pick up); the camera stays inside the rooms you go into.

const SKY = '#bccfdc'
const RULES: PlayerRules = { fallY: -20, cameraYaw: -Math.PI / 2, cameraCollides: true, canMove: playerCanMove }
// The red side in crimson, so its bots don't look like the (orange) player
const ENEMY_RED = '#c8283f'
const BOTS: BotsSetup = {
  id: 'villa',
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
const MAP: MapData = { outline: OUTLINE, zones: ZONES, pieces: PIECES, ramps: RAMPS, hulls: HULLS, edges: EDGES }

export function VillaScene() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 140, 460]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#e4edf3', '#8a8070', 0.55]} />
      <FollowSun offset={[26, 40, 16]} intensity={2.3} color="#fff1dc" extent={38} />
      <Backdrop inside={insideOutline} />

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
