import { useState } from 'react'
import { Physics, RigidBody } from '@react-three/rapier'
import { ParkingLot } from './cars/ParkingLot'
import { GunDisplay } from './experimental/guns/GunDisplay'
import { TargetDummies } from './experimental/targets/TargetDummies'
import { HangLab } from './HangLab'
import { Online } from './net/Online'
import { PHYSICS_PRIORITY, Player, type PlayerRules } from './Player'
import { FollowSun } from './race/RaceKit'
import { Ball, Cone, Cylinder, Prism } from './Shapes'
import { spawnPoint } from './spawn'
import { SpawnPlaza } from './SpawnPlaza'

// After a fall: back somewhere on the spawn plaza, away from the others
const RULES: PlayerRules = { respawnAt: spawnPoint }

export function Scene() {
  const [start] = useState(spawnPoint)
  return (
    <>
      <color attach="background" args={['#9fd8ff']} />
      <ambientLight intensity={0.6} />
      {/* The sun follows the camera so the Hang Lab at the far end gets shadows too */}
      <FollowSun offset={[8, 15, 5]} intensity={1.5} color="#ffffff" extent={24} />
      <Physics gravity={[0, -20, 0]} updatePriority={PHYSICS_PRIORITY} debug={import.meta.env.DEV}>
        {/* Ground: fixed = never moves. Runs from the spawn plaza at the back to past the Hang Lab. */}
        <RigidBody type="fixed" friction={1}>
          <mesh receiveShadow position={[0, -0.5, -10]}>
            <boxGeometry args={[24, 1, 100]} />
            <meshStandardMaterial color="#ff8fd8" />
          </mesh>
        </RigidBody>

        {/* A couple of chunky obstacles to bump into */}
        <RigidBody type="fixed" position={[3, 0.75, -6]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2, 1.5, 2]} />
            <meshStandardMaterial color="#ffd23f" />
          </mesh>
        </RigidBody>
        {/* Dynamic shapes: each collider matches its mesh */}
        <Ball position={[-3, 3, -8]} restitution={0.6} color="#4dd4ac" />
        <Prism sides={3} position={[0, 2, -9]} color="#7b61ff" />
        <Prism sides={6} position={[-5, 2, -4]} color="#3fa9f5" />
        <Cylinder position={[5, 2, -10]} color="#ff5a5f" />
        <Cylinder position={[-6, 4, -13]} rotation={[0, 0, Math.PI / 2]} color="#ffa94d" />
        <Cone position={[2, 3, -13]} color="#b7e04a" />
        <Cone position={[6, 4, -5]} rotation={[0.6, 0, 0.4]} color="#ff9ec4" />

        <SpawnPlaza />
        <HangLab />
        {/* A car park at the far end */}
        <ParkingLot />
        {/* Experimental: remove this line and src/game/experimental/guns to take guns out */}
        <GunDisplay />
        {/* Experimental: remove this line and src/game/experimental/targets to take the dummies out */}
        <TargetDummies />

        <Player spawn={start} rules={RULES} />
        {/* Everyone else here: playing online (./net) */}
        <Online room="playground" />
      </Physics>
    </>
  )
}
