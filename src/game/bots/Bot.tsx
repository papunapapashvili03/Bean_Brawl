import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { Character } from '../Character'
import { registerTarget, targetFor, type Target } from '../experimental/combat'
import { GUNS } from '../experimental/guns/catalog'
import { DamagePopup, HealthBars } from '../experimental/targets/Bars'
import { POPUP_TIME, type Popup } from '../experimental/targets/popup'
import { newHeld } from '../held'
import { Brain, type BotDef } from './brain'
import { combatants, MAX_HEALTH, MAX_SHIELD, now, playerShooter, playerTeam, recordKill, RESPAWN_TIME, SPAWN_PROTECTION, type P3 } from './match'
import type { NavGrid } from './nav'

// One bot on the field: a bean in its side's colour with a gun in its hands, a body that runs, jumps and
// gets shot, and its brain (./brain). Its name and bars float over its head: always for its own side, for the
// other side only while the player can see it. Eliminated, it topples over, and comes back at its side's
// start a few seconds later.

// The gun models, as things to hold
const GUN_ITEMS = GUNS.map(({ Model }) => {
  const Item = () => <Model loaded />
  return Item
})

// Each bot's brain lives as long as the page (it's plain data, driven every frame)
const brains = new Map<string, Brain>()
function brainFor(def: BotDef) {
  let b = brains.get(def.name)
  if (!b || b.def !== def) {
    b = new Brain(def, newHeld(GUN_ITEMS[def.gun]))
    brains.set(def.name, b)
  }
  return b
}

const HIDE_AFTER = 1.4 // seconds toppled over before it's taken off the field
const FALL_SPEED = 7
const LABEL_RANGE = 45
const LABEL_EVERY = 0.2

const labelStyle = (colour: string) =>
  ({
    display: 'grid',
    justifyItems: 'center',
    gap: 3,
    pointerEvents: 'none',
    userSelect: 'none',
    font: "800 12px system-ui, sans-serif",
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    borderBottom: `3px solid ${colour}`,
    paddingBottom: 2,
  }) as const

export function Bot({ def, spawn, spawns, nav, fallY }: { def: BotDef; spawn: P3; spawns: P3[]; nav: NavGrid | null; fallY: number }) {
  const brain = brainFor(def)
  const physics = useRapier()
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const topple = useRef<THREE.Group>(null)
  const shown = useRef<THREE.Group>(null)
  const label = useRef<HTMLDivElement>(null)
  const labelAt = useRef(0)
  const [bars, setBars] = useState({ health: MAX_HEALTH, shield: MAX_SHIELD })
  const [popups, setPopups] = useState<Popup[]>([])
  const nextPopup = useRef(0)
  const friend = def.team === playerTeam()

  useEffect(() => {
    const rb = body.current!
    const c = collider.current!
    const b = brainFor(def)
    b.reset(0)
    const timers = new Set<number>()
    const target: Target = {
      collider: c.handle,
      team: def.team,
      centre: () => rb.translation(),
      alive: () => !b.down,
      hit: (damage, headshot, from) => {
        const by = from ?? playerShooter()
        if (by.team === def.team || b.down || now() < b.protectedUntil) return
        const toShield = Math.min(b.shield, damage)
        b.shield -= toShield
        b.health = Math.max(0, b.health - (damage - toShield))
        setBars({ health: b.health, shield: b.shield })
        // Damage numbers for the player's own hits
        if (!from) {
          const id = nextPopup.current++
          const kind = headshot ? 'head' : toShield > 0 ? 'shield' : 'health'
          setPopups((p) => [...p, { id, value: damage, kind, x: (Math.random() - 0.5) * 0.6 }])
          const timer = window.setTimeout(() => {
            timers.delete(timer)
            setPopups((p) => p.filter((q) => q.id !== id))
          }, POPUP_TIME)
          timers.add(timer)
        }
        b.shotBy(by)
        if (b.health <= 0) {
          b.down = true
          b.downAt = now()
          recordKill(by, b.shooter, headshot)
        }
      },
    }
    const unregister = registerTarget(target)
    combatants.set(def.name, { name: def.name, team: def.team, body: rb.handle, target, position: () => rb.translation() })
    return () => {
      unregister()
      combatants.delete(def.name)
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [def])

  useFrame((state, dt) => {
    const rb = body.current
    if (!rb) return
    const b = brainFor(def) // the same one as `brain`, fetched afresh (it's driven here, not in render)
    const t = now()
    b.fall = THREE.MathUtils.lerp(b.fall, b.down ? 1 : 0, 1 - Math.exp(-FALL_SPEED * dt))
    topple.current!.rotation.x = -b.fall * Math.PI * 0.47

    if (b.down) {
      // Toppled over; then off the field until it's back at its start
      if (rb.isEnabled()) {
        const v = rb.linvel()
        rb.setLinvel({ x: 0, y: v.y, z: 0 }, true)
        if (t > b.downAt + HIDE_AFTER) {
          rb.setEnabled(false)
          shown.current!.visible = false
        }
      }
      if (label.current) label.current.style.display = 'none'
      if (t > b.downAt + RESPAWN_TIME) {
        const [x, y, z] = spawns[Math.floor(Math.random() * spawns.length)]
        rb.setTranslation({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5) }, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setEnabled(true)
        b.reset(SPAWN_PROTECTION)
        b.fall = 0
        shown.current!.visible = true
        setBars({ health: MAX_HEALTH, shield: MAX_SHIELD })
      }
      return
    }
    // Off the edge of the world
    if (rb.translation().y < fallY) {
      b.down = true
      b.downAt = t
      recordKill(null, b.shooter, false)
      return
    }
    b.update(rb, dt, physics, nav)

    // Its label: its own side's always; the other side's only while the player can see it, not too far off
    if (label.current && t >= labelAt.current) {
      labelAt.current = t + LABEL_EVERY
      let show = friend
      if (!show) {
        const cam = state.camera.position
        const p = rb.translation()
        const dir = new THREE.Vector3(p.x - cam.x, p.y + 0.6 - cam.y, p.z - cam.z)
        const d = dir.length()
        if (d < LABEL_RANGE) {
          dir.divideScalar(d)
          const { world, rapier } = physics
          const hit = world.castRay(new rapier.Ray(cam, dir), d + 1, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => {
            const target = targetFor(c.handle)
            return !target || target.alive()
          })
          show = !!hit && hit.collider.handle === collider.current?.handle
        }
      }
      label.current.style.display = show ? 'grid' : 'none'
    }
  })

  return (
    <RigidBody ref={body} colliders={false} position={spawn} enabledRotations={[false, false, false]} canSleep={false}>
      <CapsuleCollider ref={collider} args={[0.5, 0.5]} friction={0} />
      <group ref={shown}>
        <group ref={topple} position={[0, -1, 0]}>
          <group position={[0, 1, 0]}>
            <Character motion={brain.motion} color={def.colour} isPlayer={false} held={brain.held} />
          </group>
        </group>
        <Html center position={[0, 1.55, 0]} distanceFactor={9} zIndexRange={[3, 0]}>
          <div ref={label} style={labelStyle(def.colour)}>
            <span>{def.name}</span>
            <HealthBars health={bars.health} shield={bars.shield} width={96} />
          </div>
        </Html>
        {popups.map(({ id, ...p }) => (
          <DamagePopup key={id} {...p} height={2} />
        ))}
      </group>
    </RigidBody>
  )
}
