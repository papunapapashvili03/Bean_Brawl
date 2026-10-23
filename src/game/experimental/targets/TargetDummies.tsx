import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CapsuleCollider, RigidBody, type RapierCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { Character, type CharacterMotion } from '../../Character'
import { registerTarget } from '../combat'
import { DamagePopup, HealthBars } from './Bars'
import { BAR_HEIGHT, MAX_HEALTH, MAX_SHIELD, POPUP_TIME, type Popup } from './popup'

// EXPERIMENTAL: training dummies. A row of differently coloured characters standing idle in the playground,
// each with shield and health bars over its head. They register as targets (../combat), so shots hurt them:
// damage numbers pop up, and at 0 health they topple over and get back up a few seconds later. Self-contained: remove <TargetDummies /> from the
// playground scene and delete this folder to take them out.

const COLORS = ['#3fa9f5', '#5bd45b', '#9b6cff', '#ff5fb7', '#ffd23f', '#2ec4b6']
const SPACING = 1.8
const RESPAWN_AFTER = 3000 // ms lying down before standing back up with full shield and health
const FALL_SPEED = 7

// One dummy: the same character as the player, in its own colour, standing still (it just breathes).
// A fixed capsule the size of the player's, so you bump into it rather than walking through. Shots hit
// the shield first, then health; at 0 health it topples over backwards, then gets back up.
function Dummy({ color, x, base }: { color: string; x: number; base: [number, number, number] }) {
  const motion = useRef<CharacterMotion>({ vx: 0, vz: 0, grounded: true, hang: null, grabs: 0, jolt: 0 })
  const collider = useRef<RapierCollider>(null)
  const topple = useRef<THREE.Group>(null)
  const life = useRef({ health: MAX_HEALTH, shield: MAX_SHIELD, down: false, fall: 0 })
  const [bars, setBars] = useState({ health: MAX_HEALTH, shield: MAX_SHIELD })
  const [popups, setPopups] = useState<Popup[]>([])
  const nextPopup = useRef(0)

  useEffect(() => {
    const c = collider.current
    if (!c) return
    const centre = { x: base[0] + x, y: base[1] + 1, z: base[2] }
    const timers = new Set<number>()
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      timers.add(id)
    }
    const unregister = registerTarget({
      collider: c.handle,
      centre: () => centre,
      alive: () => !life.current.down,
      hit: (damage, headshot) => {
        const l = life.current
        if (l.down) return
        const toShield = Math.min(l.shield, damage)
        l.shield -= toShield
        l.health = Math.max(0, l.health - (damage - toShield))
        setBars({ health: l.health, shield: l.shield })
        const id = nextPopup.current++
        const kind = headshot ? 'head' : toShield > 0 ? 'shield' : 'health'
        setPopups((p) => [...p, { id, value: damage, kind, x: (Math.random() - 0.5) * 0.6 }])
        later(POPUP_TIME, () => setPopups((p) => p.filter((q) => q.id !== id)))
        if (l.health <= 0) {
          l.down = true
          later(RESPAWN_AFTER, () => {
            l.health = MAX_HEALTH
            l.shield = MAX_SHIELD
            l.down = false
            setBars({ health: MAX_HEALTH, shield: MAX_SHIELD })
          })
        }
      },
    })
    return () => {
      unregister()
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [x, base])

  // Topple over backwards (about the feet) when eliminated, and back up when respawned
  useFrame((_, dt) => {
    const l = life.current
    l.fall = THREE.MathUtils.lerp(l.fall, l.down ? 1 : 0, 1 - Math.exp(-FALL_SPEED * dt))
    topple.current!.rotation.x = -l.fall * Math.PI * 0.47
  })

  return (
    <group position={[x, 0, 0]}>
      <RigidBody type="fixed" colliders={false} position={[0, 1, 0]}>
        <CapsuleCollider ref={collider} args={[0.5, 0.5]} />
        <group ref={topple} position={[0, -1, 0]}>
          <group position={[0, 1, 0]}>
            <Character motion={motion} color={color} isPlayer={false} />
          </group>
        </group>
      </RigidBody>
      <Html center position={[0, BAR_HEIGHT, 0]} distanceFactor={8} zIndexRange={[3, 0]}>
        <HealthBars health={bars.health} shield={bars.shield} />
      </Html>
      {popups.map(({ id, ...p }) => (
        <DamagePopup key={id} {...p} />
      ))}
    </group>
  )
}

// The row stands across the playground between the shapes and the Hang Lab, facing the spawn (+z)
const ROW: [number, number, number] = [0, 0, -17.5]

export function TargetDummies({ position = ROW }: { position?: [number, number, number] }) {
  return (
    <group position={position}>
      {COLORS.map((color, i) => (
        <Dummy key={color} color={color} x={(i - (COLORS.length - 1) / 2) * SPACING} base={position} />
      ))}
    </group>
  )
}
