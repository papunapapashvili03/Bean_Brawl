import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { registerTarget } from '../experimental/combat'
import { activePlayerHandle } from '../playerContact'
import { Bot } from './Bot'
import { botDefs, type BotsSetup } from './setup'
import {
  combatants,
  damagePlayer,
  PLAYER_NAME,
  playerCanMove,
  playerRespawnDue,
  respawnPlayer,
  setReady,
  startMatch,
  updateMatch,
} from './match'
import { navBuilder, type NavGrid } from './nav'

// Bots for a gunfight map: both sides filled up to `size` (the player counts on its own side), and the
// match they play (./match). Put inside <Physics>, after the player. They find their way with a grid worked
// out from the map once it's built (./nav), a moment after the level starts, kept for next time.

const navCache = new Map<string, NavGrid>()
const BUILD_AFTER = 0.6 // seconds: let every fixed collider into the physics world first

export function Bots({ setup }: { setup: BotsSetup }) {
  const physics = useRapier()
  const [nav, setNav] = useState<NavGrid | null>(() => navCache.get(setup.id) ?? null)
  const defs = useMemo(() => botDefs(setup), [setup])
  const builder = useRef<ReturnType<typeof navBuilder> | null>(null)
  const age = useRef(0)

  useEffect(() => {
    startMatch(setup.teams, setup.playerTeam)
    if (navCache.has(setup.id)) setReady(true)
  }, [setup])

  useFrame((_, dt) => {
    updateMatch()
    if (nav) return
    age.current += dt
    if (age.current < BUILD_AFTER) return
    const starts = setup.teams.flatMap((t) => t.spawns)
    builder.current ??= navBuilder(physics, setup.bounds, starts)
    const done = builder.current.step()
    if (done) {
      navCache.set(setup.id, done)
      setNav(done)
      setReady(true)
    }
  })

  return (
    <>
      <PlayerCombat setup={setup} />
      {defs.map((d, i) => {
        const spawns = setup.teams.find((t) => t.id === d.team)!.spawns
        // Each bot its own spot at the start, clear of the player's
        const [px, , pz] = setup.playerSpawn
        const free = spawns.filter(([x, , z]) => Math.hypot(x - px, z - pz) > 1)
        const k = defs.slice(0, i).filter((o) => o.team === d.team).length
        return <Bot key={d.name} def={d} spawn={free[(k * 2) % free.length]} spawns={spawns} nav={nav} fallY={setup.fallY} />
      })}
    </>
  )
}

// The player in the match: a target the bots can hit (its collider changes when it crouches, so it's kept
// up to date), and put back at its side's start a while after being eliminated
function PlayerCombat({ setup }: { setup: BotsSetup }) {
  const { world } = useRapier()
  const registered = useRef<{ collider: number; undo: () => void } | null>(null)

  useEffect(
    () => () => {
      registered.current?.undo()
      registered.current = null
    },
    [],
  )

  useFrame(() => {
    const handle = activePlayerHandle()
    const rb = handle === null ? null : world.getRigidBody(handle)
    if (!rb || rb.numColliders() === 0) return
    const collider = rb.collider(0).handle
    if (registered.current?.collider !== collider) {
      registered.current?.undo()
      const target = {
        collider,
        team: setup.playerTeam,
        centre: () => rb.translation(),
        alive: playerCanMove,
        hit: damagePlayer,
      }
      const unregister = registerTarget(target)
      combatants.set(PLAYER_NAME, { name: PLAYER_NAME, team: setup.playerTeam, body: rb.handle, target, position: () => rb.translation() })
      registered.current = {
        collider,
        undo: () => {
          unregister()
          combatants.delete(PLAYER_NAME)
        },
      }
    }
    if (playerRespawnDue()) {
      const spawns = setup.teams.find((t) => t.id === setup.playerTeam)!.spawns
      const [x, y, z] = spawns[Math.floor(Math.random() * spawns.length)]
      rb.setTranslation({ x, y, z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      respawnPlayer()
    }
  })
  return null
}
