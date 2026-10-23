import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { GunDisplay } from '../experimental/guns/GunDisplay'
import { useGrabEdges } from '../grab'
import { Blocks } from '../maps/World'
import { PHYSICS_PRIORITY, Player, type PlayerRules } from '../Player'
import { activePlayerPosition } from '../playerContact'
import { FollowSun } from '../race/RaceKit'
import { tracker } from './hud'
import { EDGES, HULLS, PIECES, RACKS, RAMPS, SPAWNS } from './layout'
import { Props } from './Props'
import { Storm } from './Storm'
import { canMove, storm, stormAt, stormDepth } from './stormState'
import { Terrain } from './Terrain'

// Dust Bowl Valley (see ./places, ./layout): a wide-open desert valley for solo battles, 550 m across, with
// sixteen places round the mesa in the middle. You come in at one of sixty spots spread over the valley (a
// different one each time, and again whenever you fall off the world), facing the mesa. Guns wait on racks
// at every place; zip lines run down from the mesa and jump pads fling you up onto it. A storm (./Storm)
// closes in on a random spot, zone by zone, until at 25 minutes it has the whole valley.

const SKY = '#b7d4ec'
const pickSpawn = () => SPAWNS[Math.floor(Math.random() * SPAWNS.length)]

// Back after a fall: somewhere inside the safe zone (or the spot nearest it, late on when it's small)
function safeSpawn() {
  const { now } = stormAt(storm.time)
  const inside = SPAWNS.filter(([x, , z]) => stormDepth(now, x, z) < -8)
  if (inside.length) return inside[Math.floor(Math.random() * inside.length)]
  return SPAWNS.reduce((best, p) => (stormDepth(now, p[0], p[2]) < stormDepth(now, best[0], best[2]) ? p : best))
}

// Where the player is and which way the camera looks, for the map in the corner (./MapHud)
function Tracker() {
  useFrame((state) => {
    const p = activePlayerPosition()
    if (!p) return
    tracker.x = p.x
    tracker.z = p.z
    const e = state.camera.matrixWorld.elements
    tracker.yaw = Math.atan2(-e[8], e[10])
    tracker.live = true
  })
  return null
}

function Edges() {
  useGrabEdges(EDGES)
  return null
}

export function ValleyScene() {
  const [spawn] = useState(pickSpawn)
  const [rules] = useState<PlayerRules>(() => ({ fallY: -40, canMove, respawnAt: safeSpawn, cameraYaw: Math.atan2(spawn[0], spawn[2]), cameraCollides: true }))
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 240, 950]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#eef4f8', '#b39a72', 0.55]} />
      <FollowSun offset={[30, 48, 18]} intensity={2.6} color="#fff0d6" extent={45} />

      <Physics gravity={[0, -20, 0]} updatePriority={PHYSICS_PRIORITY}>
        <Terrain />
        <Blocks pieces={PIECES} ramps={RAMPS} hulls={HULLS} />
        <Edges />
        <Props />
        <GunDisplay racks={RACKS} />
        <Player spawn={spawn} rules={rules} />
        <Tracker />
      </Physics>
      <Storm sky={SKY} />
    </>
  )
}
