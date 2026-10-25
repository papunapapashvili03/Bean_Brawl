import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import type * as THREE from 'three'
import { outline } from '../../toon'
import { Character, type CharacterMotion } from '../../Character'
import { registerRunner, type Stance, type Vec3 } from '../../playerContact'
import { STANCES, createRunner, knockRunner, putBack, restingMotion, stepRunner, type PlayerRules, type Runner, type RunnerEnv, type RunnerInput } from '../../runner'
import { partyPreset } from '../../bots/difficulty'
import { within } from '../../bots/presets'
import { net, send } from '../../net/client'
import { OnlinePlayers } from '../../net/Online'
import { amHost, botFeed, carry, framed, inField, inRound, isOnline, setStarts, tellDone, useParty } from '../../net/party'
import { BOT_STATE, BOTS_EVERY, B } from '../../net/protocol'
import { facing, flagsOf, moveLike, newHang, poseAt } from '../../net/puppet'
import { seeded, shuffle } from '../../roundSeed'
import { loadShow, showBotsFor } from '../../show'
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
//
// In a show played online (../../net/party) the field is the other players too: they take some of the bots'
// starts, and are drawn here (../../net/Online). One player, the host, runs the bots as above and sends where
// they are (BotSender), and tells the server how each one's round ends; everyone else draws them where the
// host says (PuppetBot). If the host goes, whoever takes over carries on running them from where they were.

const LABEL_RANGE = 38
const LABEL_EVERY = 0.25
// Further from the camera than these, a bot's drawn without a shadow, and then without its ink outline: too
// small to show either, and with a field of 30 that's a good deal less to draw
const SHADOW_RANGE = 14
const OUTLINE_RANGE = 24
type Detail = 0 | 1 | 2 // nothing extra, outline, outline and shadow
// Online, bots are drawn this far behind the host's word of them (they're sent less often than players are)
const PUPPET_DELAY = 160

function setDetail(group: THREE.Object3D, detail: Detail) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (mesh.material === outline) mesh.visible = detail > 0
    mesh.userData.casts ??= mesh.castShadow
    mesh.castShadow = detail > 1 && mesh.userData.casts
  })
}

type BotSpec = BotTraits
// How good a bot is, from 0 (slow, careless, easily distracted) to 1 (quick and sharp), and how quick off the
// line: where it falls (0..1) in the difficulty preset's ranges (../../bots/presets), which also says how
// fast they run, how often they slip up and how quick they are to react, over and above that. In a show, the
// preset's the one for the player's difficulty, and the bot's place in the field (../../bots/difficulty).
function skillOf(rank: number, quick: number): PilotSkill {
  const preset = partyPreset(rank)
  const level = within(preset.level, rank)
  const quickness = within(preset.quickness, quick)
  return {
    level,
    speed: (0.78 + 0.19 * level) * preset.speed,
    margin: 0.1 + 0.14 * (1 - level),
    start: COUNTDOWN_SECONDS + (1 - quickness) * 0.6 * preset.reaction,
    lapse: level > 0.85 ? 0 : 1.1 * (1 - level) * preset.mistakes,
    mistakes: preset.mistakes,
    reaction: preset.reaction,
  }
}

const input: RunnerInput = { x: 0, z: 0, jump: false, drop: false, crouchHeld: false, crouchPressed: false }

// Its name over its head, and how much detail it's drawn with, by how near the camera it is: `near` sees to
// it, for what's drawn in `shown` and the name tag in `label`; `hide` hides both (out of the race)
function useNearness() {
  const shown = useRef<THREE.Group>(null)
  const label = useRef<HTMLDivElement>(null)
  const labelAt = useRef(0)
  const detailed = useRef<Detail>(2)
  const near = (camera: THREE.Camera, p: Vec3, now: number) => {
    if (!label.current || now < labelAt.current) return
    labelAt.current = now + LABEL_EVERY
    const far = Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z)
    label.current.style.display = far < LABEL_RANGE ? 'block' : 'none'
    const detail: Detail = far < SHADOW_RANGE ? 2 : far < OUTLINE_RANGE ? 1 : 0
    if (shown.current && detail !== detailed.current) {
      detailed.current = detail
      setDetail(shown.current, detail)
    }
  }
  const hide = () => {
    if (shown.current) shown.current.visible = false
    if (label.current) label.current.style.display = 'none'
  }
  return { shown, label, near, hide }
}

function NameTag({ spec, label }: { spec: BotSpec; label: RefObject<HTMLDivElement | null> }) {
  return (
    <Html center position={[0, 1.5, 0]} distanceFactor={9} zIndexRange={[3, 0]}>
      <div
        ref={label}
        className="bean-name"
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
  )
}

// Online, the host's bots, for BotSender (by their place in the round's list of bots)
type Run = { name: string; rb: RapierRigidBody; motion: RefObject<CharacterMotion>; racer: Racer; yaw: number }
const running: (Run | undefined)[] = []

function RaceBot({
  spec,
  index,
  route,
  steer,
  rules,
  knockout,
  online,
}: {
  spec: BotSpec
  index: number
  route?: Route
  steer?: (bot: BotTraits) => Steering
  rules?: Partial<PlayerRules>
  knockout: boolean
  online: boolean
}) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const { shown, label, near, hide } = useNearness()
  const motion = useRef<CharacterMotion>(restingMotion())
  const state = useRef<{ runner: Runner; pilot: Steering; racer: Racer; rules: PlayerRules } | null>(null)
  const [capsule, setCapsule] = useState<Stance>('stand')
  const physics = useRapier()

  useEffect(() => {
    const rb = body.current!
    const { racer, leave } = joinRace(spec.name, spec.colour, spec.start)
    // (Taking over from a host that's gone: on from where it had got to)
    const was = online ? carry.get(spec.name) : undefined
    if (was) {
      rb.setTranslation({ x: was.x, y: was.y, z: was.z }, true)
      racer.checkpoint = was.checkpoint
      racer.finishClock = was.finishClock
      racer.outClock = was.outClock
    }
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
    if (online) running[index] = { name: spec.name, rb, motion, racer, yaw: 0 }
    return () => {
      unregister()
      leave()
      if (running[index]?.rb === rb) running[index] = undefined
      state.current = null
    }
  }, [spec, index, route, steer, rules, knockout, online])

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
        hide()
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
    near(camera, rb.translation(), now)
  })

  const shape = STANCES[capsule]
  return (
    <RigidBody ref={body} colliders={false} position={spec.start} enabledRotations={[false, false, false]} friction={0.2} canSleep={false}>
      <CapsuleCollider key={capsule} ref={collider} args={[shape.halfHeight, shape.radius]} position={[0, -1 + shape.radius + shape.halfHeight, 0]} />
      <group ref={shown}>
        <Character motion={motion} color={spec.colour} isPlayer={false} />
      </group>
      <NameTag spec={spec} label={label} />
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Online

// The host's bots, to everyone else, 10 times a second; and how each one's round ends, to the server
function BotSender({ count }: { count: number }) {
  const since = useRef(0)
  useFrame((_, delta) => {
    since.current += delta
    if (since.current < BOTS_EVERY) return
    since.current %= BOTS_EVERY
    for (const run of running) {
      if (!run) continue
      const r = run.racer
      if (r.outClock !== null) tellDone('out', r.outClock, run.name)
      else if (r.finishClock !== null) tellDone('finish', r.finishClock, run.name)
    }
    if (!net.remotes.size) return // (nobody to tell)
    const d = new Array<number>(1 + count * BOT_STATE).fill(0)
    d[0] = performance.now()
    const r2 = (v: number) => Math.round(v * 100) / 100
    for (let i = 0; i < count; i++) {
      const run = running[i]
      if (!run) continue
      const at = 1 + i * BOT_STATE
      const p = run.rb.translation()
      const v = run.rb.linvel()
      const m = run.motion.current
      run.yaw = facing(m, run.yaw)
      d[at + B.x] = r2(p.x)
      d[at + B.y] = r2(p.y)
      d[at + B.z] = r2(p.z)
      d[at + B.vx] = r2(m.vx)
      d[at + B.vy] = r2(v.y)
      d[at + B.vz] = r2(m.vz)
      d[at + B.yaw] = r2(run.yaw)
      d[at + B.flags] = flagsOf(m)
      d[at + B.crouch] = r2(m.crouch ?? 0)
      d[at + B.checkpoint] = run.racer.checkpoint
    }
    send({ t: 'b', d })
  })
  return null
}

// A bot someone else runs: drawn where they say it is (solid, as a player's bean is), in the race, and among
// the runners the level's obstacles go by
function PuppetBot({ spec, index }: { spec: BotSpec; index: number }) {
  const body = useRef<RapierRigidBody>(null)
  const { shown, label, near, hide } = useNearness()
  const motion = useRef<CharacterMotion>(restingMotion())
  const pose = useMemo(() => new Array<number>(7).fill(0), [])
  const hang = useMemo(() => newHang(), [])
  const velocity = useRef<Vec3>({ x: 0, y: 0, z: 0 })
  const racer = useRef<Racer | null>(null)

  useEffect(() => {
    const rb = body.current!
    const joined = joinRace(spec.name, spec.colour, spec.start)
    racer.current = joined.racer
    const outOfField = inField(`b:${spec.name}`, joined.racer)
    const unregister = registerRunner({ handle: rb.handle, position: () => rb.translation(), velocity: () => velocity.current, knock: () => {} })
    return () => {
      unregister()
      outOfField()
      joined.leave()
      racer.current = null
    }
  }, [spec])

  useFrame(({ camera }) => {
    const rb = body.current
    const r = racer.current
    if (!rb || !r) return
    if (r.outClock !== null) {
      if (rb.isEnabled()) {
        rb.setEnabled(false)
        hide()
      }
    } else {
      const at = 1 + index * BOT_STATE
      const state = poseAt(botFeed, at, performance.now(), PUPPET_DELAY, pose)
      // (A bot the host hasn't placed: an empty slot in its word)
      if (state && (state[at + B.x] !== 0 || state[at + B.y] !== 0 || state[at + B.z] !== 0)) {
        const [x, y, z, vx, vy, vz] = pose
        rb.setNextKinematicTranslation({ x, y, z })
        velocity.current.x = vx
        velocity.current.y = vy
        velocity.current.z = vz
        moveLike(motion.current, pose, state, at, hang)
        r.at.x = x
        r.at.y = y
        r.at.z = z
        r.checkpoint = Math.max(r.checkpoint, state[at + B.checkpoint])
      }
      near(camera, rb.translation(), raceClock())
    }
    const p = rb.translation()
    let kept = carry.get(spec.name)
    if (!kept) carry.set(spec.name, (kept = { x: 0, y: 0, z: 0, checkpoint: 0, finishClock: null, outClock: null }))
    kept.x = p.x
    kept.y = p.y
    kept.z = p.z
    kept.checkpoint = r.checkpoint
    kept.finishClock = r.finishClock
    kept.outClock = r.outClock
  })

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={spec.start}>
      <CapsuleCollider args={[0.5, 0.5]} />
      <group ref={shown}>
        <Character motion={motion} color={spec.colour} isPlayer={false} />
      </group>
      <NameTag spec={spec} label={label} />
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------

// Old moments looked ahead to are dropped as the clock goes by (and, online, the frames are counted: see
// ../../net/party)
function Housekeeping() {
  useFrame(() => {
    forgetBefore(raceClock())
    framed()
  })
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
  // (Online: drawn again as who runs the bots changes)
  useParty()
  const online = isOnline()
  const round = inRound()
  const specs = useMemo(() => {
    const rand = seeded(starts.length * 131 + count * 17 + 7)
    const order = shuffle(
      starts.map((_, i) => i),
      rand,
    )
    const biasOf = (start: P3) => (lane ? Math.max(-1, Math.min(1, lane(start))) : rand() * 2 - 1)
    // (Online, before the show's started: nobody yet)
    if (online && !round) return []
    const fromShow = showBotsFor(window.location.hash.slice(1))
    if (fromShow) {
      // Online, the other players take the first of the starts (the first player has the map's own)
      const others = online ? Math.max(0, (loadShow()?.humans?.length ?? 1) - 1) : 0
      if (online) setStarts([null, ...order.slice(0, others).map((k) => starts[k])])
      return fromShow.slice(0, Math.max(0, starts.length - others)).map((bot, i): BotSpec => {
        const start = starts[order[others + i]]
        return { name: bot.name, colour: bot.colour, start, skill: skillOf(bot.level, bot.quickness), bias: biasOf(start) }
      })
    }
    const names = shuffle(NAMES, rand)
    return order.slice(0, count).map((slot, i): BotSpec => {
      const start = starts[slot]
      return {
        name: names[i % names.length],
        colour: COLOURS[i % COLOURS.length],
        start,
        skill: skillOf(rand(), rand()),
        bias: biasOf(start),
      }
    })
  }, [starts, count, lane, online, round])
  const runs = !online || amHost()
  return (
    <>
      <Housekeeping />
      {online && round && <OnlinePlayers race />}
      {specs.map((spec, i) =>
        runs ? (
          <RaceBot key={`run-${spec.name}`} spec={spec} index={i} route={route} steer={steer} rules={rules} knockout={knockout} online={online} />
        ) : (
          <PuppetBot key={`drawn-${spec.name}`} spec={spec} index={i} />
        ),
      )}
      {online && runs && <BotSender count={specs.length} />}
    </>
  )
}
