import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import type * as THREE from 'three'
import { outline } from '../../toon'
import { Character, type CharacterMotion } from '../../Character'
import { registerRunner, type Stance } from '../../playerContact'
import { STANCES, createRunner, knockRunner, putBack, restingMotion, stepRunner, type PlayerRules, type Runner, type RunnerEnv, type RunnerInput } from '../../runner'
import { showBotsFor } from '../../show'
import { COUNTDOWN_SECONDS, canMove, eliminateRacer, joinRace, raceClock, racerRules, type Racer } from '../race'
import { Pilot, type PilotSkill } from './pilot'
import { forgetBefore } from './predict'
import { COLOURS, NAMES } from './roster'
import type { P3, Route } from './route'
import type { BotTraits, Steering } from './steering'

// The bots in a race: each a runner like the player (the same body, ../../runner), in its own colour with its
// name over its head, steered round the course's route by a pilot (./pilot) instead of the keyboard. They
// start from the grid slots they're given, are knocked about by everything the player is, come back at their
// own checkpoints, and are placed against the player (../race). Put inside <Physics>. (A level that isn't a
// route from A to B can steer them its own way instead: `steer`, see ./steering.) In a party show (../../show)
// the bots are the show's: the ones still in it, each as good as it was in the round before.

const LABEL_RANGE = 38
const LABEL_EVERY = 0.25
// Further from the camera than these, a bot's drawn without a shadow, and then without its ink outline: too
// small to show either, and with a field of 30 that's a good deal less to draw
const SHADOW_RANGE = 14
const OUTLINE_RANGE = 24
type Detail = 0 | 1 | 2 // nothing extra, outline, outline and shadow

function setDetail(group: THREE.Object3D, detail: Detail) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (mesh.material === outline) mesh.visible = detail > 0
    mesh.userData.casts ??= mesh.castShadow
    mesh.castShadow = detail > 1 && mesh.userData.casts
  })
}

function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

type BotSpec = BotTraits
// How good a bot is, from 0 (slow, careless, easily distracted) to 1 (quick and sharp). Most are middling.
function skillOf(level: number, quickness: number): PilotSkill {
  return {
    speed: 0.78 + 0.19 * level,
    margin: 0.1 + 0.14 * (1 - level),
    start: COUNTDOWN_SECONDS + quickness * 0.6,
    lapse: level > 0.85 ? 0 : 1.1 * (1 - level),
  }
}

const input: RunnerInput = { x: 0, z: 0, jump: false, drop: false, crouchHeld: false, crouchPressed: false }

function RaceBot({
  spec,
  route,
  steer,
  rules,
  knockout,
}: {
  spec: BotSpec
  route?: Route
  steer?: (bot: BotTraits) => Steering
  rules?: Partial<PlayerRules>
  knockout: boolean
}) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const label = useRef<HTMLDivElement>(null)
  const shown = useRef<THREE.Group>(null)
  const labelAt = useRef(0)
  const detailed = useRef<Detail>(2)
  const motion = useRef<CharacterMotion>(restingMotion())
  const state = useRef<{ runner: Runner; pilot: Steering; racer: Racer; rules: PlayerRules } | null>(null)
  const [capsule, setCapsule] = useState<Stance>('stand')
  const physics = useRapier()

  useEffect(() => {
    const rb = body.current!
    const { racer, leave } = joinRace(spec.name, spec.colour, spec.start)
    const runner = createRunner(motion)
    // (Where falling is the end, a fall takes it out of the race, and off the course)
    const gone: P3 = [spec.start[0], -1000, spec.start[2]]
    const out = knockout
      ? {
          respawnAt: () => {
            eliminateRacer(racer)
            return gone
          },
        }
      : {}
    const pilot = steer ? steer(spec) : new Pilot(route ?? [], spec.skill, spec.bias)
    state.current = { runner, racer, pilot, rules: racerRules(racer, { ...rules, ...out }) }
    const unregister = registerRunner({ handle: rb.handle, position: () => rb.translation(), velocity: () => rb.linvel(), knock: (v) => knockRunner(runner, v) })
    return () => {
      unregister()
      leave()
      state.current = null
    }
  }, [spec, route, steer, rules, knockout])

  useFrame(({ camera }, delta) => {
    const rb = body.current
    const s = state.current
    if (!rb || !s) return
    const now = raceClock()
    if (s.racer.outClock !== null) {
      // Out of the race: off the course
      if (rb.isEnabled()) {
        rb.setLinvel({ x: 0, y: 0, z: 0 }, false)
        rb.setEnabled(false)
        if (shown.current) shown.current.visible = false
        if (label.current) label.current.style.display = 'none'
      }
      return
    }
    const env: RunnerEnv = { rb, collider: collider.current, physics, rules: s.rules, spawn: spec.start, setCapsule }
    // (Over the line, it carries on to the end of its route: somewhere out of the way)
    s.pilot.update(input, rb, s.runner, physics, now, canMove() && s.racer.outClock === null, s.racer.checkpoint, s.racer.finishClock !== null)
    if (s.pilot.quit) {
      putBack(s.runner, env)
      s.pilot.quit = false
    }
    stepRunner(s.runner, env, input, delta)

    // Its name, while it's near enough to read; its outline and shadow while it's near enough to see them
    if (label.current && now >= labelAt.current) {
      labelAt.current = now + LABEL_EVERY
      const p = rb.translation()
      const far = Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z)
      label.current.style.display = far < LABEL_RANGE ? 'block' : 'none'
      const detail: Detail = far < SHADOW_RANGE ? 2 : far < OUTLINE_RANGE ? 1 : 0
      if (shown.current && detail !== detailed.current) {
        detailed.current = detail
        setDetail(shown.current, detail)
      }
    }
  })

  const shape = STANCES[capsule]
  return (
    <RigidBody ref={body} colliders={false} position={spec.start} enabledRotations={[false, false, false]} friction={0.2} canSleep={false}>
      <CapsuleCollider key={capsule} ref={collider} args={[shape.halfHeight, shape.radius]} position={[0, -1 + shape.radius + shape.halfHeight, 0]} />
      <group ref={shown}>
        <Character motion={motion} color={spec.colour} isPlayer={false} />
      </group>
      <Html center position={[0, 1.5, 0]} distanceFactor={9} zIndexRange={[3, 0]}>
        <div
          ref={label}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            font: '800 12px system-ui, sans-serif',
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            borderBottom: `3px solid ${spec.colour}`,
            paddingBottom: 2,
          }}
        >
          {spec.name}
        </div>
      </Html>
    </RigidBody>
  )
}

// Old moments looked ahead to are dropped as the clock goes by
function Housekeeping() {
  useFrame(() => forgetBefore(raceClock()))
  return null
}

export function RaceBots({
  route,
  steer,
  starts,
  count = starts.length,
  rules,
  lane,
  knockout = false,
}: {
  route?: Route // the way round the course (or, instead, `steer`: what else steers each one)
  steer?: (bot: BotTraits) => Steering
  starts: P3[] // where they set off from (not the player's own spot)
  count?: number
  rules?: Partial<PlayerRules> // what's different about this level (e.g. how far down is a fall)
  lane?: (start: P3) => number // which side of the way a bot keeps to (-1..1), from where it starts
  knockout?: boolean // falling is the end (a level you last out): a bot that falls is out of the race
}) {
  const specs = useMemo(() => {
    const rand = seeded(starts.length * 131 + count * 17 + 7)
    const order = starts.map((_, i) => i).sort(() => rand() - 0.5)
    const fromShow = showBotsFor(window.location.hash.slice(1))
    if (fromShow) {
      return fromShow.slice(0, starts.length).map((bot, i): BotSpec => {
        const start = starts[order[i]]
        return { name: bot.name, colour: bot.colour, start, skill: skillOf(bot.level, bot.quickness), bias: lane ? Math.max(-1, Math.min(1, lane(start))) : rand() * 2 - 1 }
      })
    }
    const names = [...NAMES].sort(() => rand() - 0.5)
    return order.slice(0, count).map((slot, i): BotSpec => {
      const start = starts[slot]
      return {
        name: names[i % names.length],
        colour: COLOURS[i % COLOURS.length],
        start,
        skill: skillOf(rand(), rand()),
        bias: lane ? Math.max(-1, Math.min(1, lane(start))) : rand() * 2 - 1,
      }
    })
  }, [starts, count, lane])
  return (
    <>
      <Housekeeping />
      {specs.map((spec) => (
        <RaceBot key={spec.name} spec={spec} route={route} steer={steer} rules={rules} knockout={knockout} />
      ))}
    </>
  )
}
