import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { Character, type CharacterMotion, type HangPose } from '../Character'
import { useOutfit, type Outfit } from '../outfit'
import { activePlayerMotion, activePlayerPosition, activePlayerVelocity } from '../playerContact'
import { restingMotion } from '../runner'
import { joinRoom, net, sendOutfit, sendState, useNet, type Remote } from './client'
import { FLAG_GROUNDED, FLAG_HANG, FLAG_ROLL, S, SEND_EVERY, STATE_LENGTH } from './protocol'

// Playing online in a level (for now, the playground): joins the server's room for it, sends where my
// bean is and what it's doing 20 times a second, and draws everyone else's bean where theirs is: a moment
// behind (DELAY), going smoothly from one state they've sent to the next. Their beans are solid (you can
// bump into them, though they won't be pushed by you), wear their outfits and have their names over them.
// Put inside <Physics>, with the level's <Player>.

const DELAY = 100 // ms: drawn this far behind what they've sent, so there's (nearly) always a next state to go to
const EXTRAPOLATE = 0.25 // s: with nothing newer, carried on the way it was going for at most this long

export function Online({ room }: { room: string }) {
  const outfit = useOutfit()
  const latest = useRef(outfit)
  useEffect(() => {
    latest.current = outfit
    sendOutfit(outfit)
  }, [outfit])
  useEffect(() => joinRoom(room, () => latest.current), [room])
  return (
    <>
      <Sender />
      <RemotePlayers />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Mine, to the server

// (One state, filled in afresh for each send)
const state = new Array<number>(STATE_LENGTH).fill(0)

function Sender() {
  const since = useRef(0)
  const yaw = useRef(0)
  useFrame((_, delta) => {
    since.current += delta
    if (since.current < SEND_EVERY) return
    since.current %= SEND_EVERY
    const p = activePlayerPosition()
    const v = activePlayerVelocity()
    const m = activePlayerMotion()
    if (!p || !v || !m) return
    // Facing: the way it hangs, or the way it's running (or, standing, the way it was)
    if (m.hang) yaw.current = m.hang.yaw
    else if (Math.hypot(m.vx, m.vz) > 0.1) yaw.current = Math.atan2(m.vx, m.vz)
    const d = state
    d[S.stamp] = performance.now()
    d[S.x] = p.x
    d[S.y] = p.y
    d[S.z] = p.z
    d[S.vx] = m.vx
    d[S.vy] = v.y
    d[S.vz] = m.vz
    d[S.yaw] = yaw.current
    d[S.flags] = (m.grounded ? FLAG_GROUNDED : 0) | (m.roll ? FLAG_ROLL : 0) | (m.hang ? FLAG_HANG : 0)
    d[S.crouch] = m.crouch ?? 0
    d[S.grabs] = m.grabs
    sendState(d)
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------
// Everyone else's

function RemotePlayers() {
  const { players } = useNet()
  return (
    <>
      {players.map((p) => (
        <RemoteBean key={p.id} id={p.id} name={p.name} colour={p.colour} outfit={p.outfit} />
      ))}
    </>
  )
}

// Where a bean was `now` (our clock) less DELAY, from its states either side of then (or the last one,
// carried on a little): into `out` (x, y, z, vx, vy, vz, yaw), and the state nearest then. Null with none yet.
function poseAt(r: Remote, now: number, out: number[]) {
  const s = r.samples
  if (!s.length) return null
  const t = now - r.offset - DELAY // on its clock
  const last = s[s.length - 1]
  // (With only one yet, it stays there till the next comes)
  if (t >= last[S.stamp] || s.length === 1) {
    const dt = THREE.MathUtils.clamp((t - last[S.stamp]) / 1000, 0, EXTRAPOLATE)
    out[0] = last[S.x] + last[S.vx] * dt
    out[1] = last[S.y] + (last[S.flags] & FLAG_GROUNDED ? 0 : last[S.vy] * dt)
    out[2] = last[S.z] + last[S.vz] * dt
    out[3] = last[S.vx]
    out[4] = last[S.vy]
    out[5] = last[S.vz]
    out[6] = last[S.yaw]
    return last
  }
  let i = s.length - 2
  while (i > 0 && s[i][S.stamp] > t) i--
  const a = s[i]
  const b = s[i + 1]
  const span = b[S.stamp] - a[S.stamp]
  const u = span > 0 ? THREE.MathUtils.clamp((t - a[S.stamp]) / span, 0, 1) : 1
  out[0] = a[S.x] + (b[S.x] - a[S.x]) * u
  out[1] = a[S.y] + (b[S.y] - a[S.y]) * u
  out[2] = a[S.z] + (b[S.z] - a[S.z]) * u
  out[3] = a[S.vx] + (b[S.vx] - a[S.vx]) * u
  out[4] = a[S.vy] + (b[S.vy] - a[S.vy]) * u
  out[5] = a[S.vz] + (b[S.vz] - a[S.vz]) * u
  const turn = Math.atan2(Math.sin(b[S.yaw] - a[S.yaw]), Math.cos(b[S.yaw] - a[S.yaw]))
  out[6] = a[S.yaw] + turn * u
  return u < 0.5 ? a : b
}

// Hanging: its hands on an edge just in front of and above it, either side of the way it faces
function hangPose(pose: HangPose, x: number, y: number, z: number, yaw: number) {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const tx = Math.cos(yaw)
  const tz = -Math.sin(yaw)
  pose.yaw = yaw
  pose.tx = tx
  pose.tz = tz
  pose.hands.forEach((h, k) => {
    const side = k === 0 ? -0.32 : 0.32
    h.x = x + fx * 0.42 + tx * side
    h.y = y + 0.95
    h.z = z + fz * 0.42 + tz * side
  })
  return pose
}

function RemoteBean({ id, name, colour, outfit }: { id: number; name: string; colour: string; outfit: Partial<Outfit> }) {
  const body = useRef<RapierRigidBody>(null)
  const motion = useRef<CharacterMotion>(restingMotion())
  const pose = useMemo(() => new Array<number>(7).fill(0), [])
  const hang = useMemo<HangPose>(() => ({ kind: 'ledge', hands: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], tx: 1, tz: 0, yaw: 0, shimmy: 0 }), [])
  const worn = useMemo(() => ({ hat: 'none', face: 'none', shades: 'none', back: 'none', flag: 'none', ...outfit }) as Outfit, [outfit])
  const placed = useRef(false)

  useFrame(() => {
    const rb = body.current
    const r = net.remotes.get(id)
    if (!rb || !r) return
    const at = poseAt(r, performance.now(), pose)
    if (!at) return
    const [x, y, z, vx, , vz, yaw] = pose
    // (Straight there the first time, not swept across the level from wherever it started)
    if (!placed.current) {
      rb.setTranslation({ x, y, z }, true)
      placed.current = true
    }
    rb.setNextKinematicTranslation({ x, y, z })
    const m = motion.current
    const flags = at[S.flags]
    m.vx = vx
    m.vz = vz
    m.grounded = !!(flags & FLAG_GROUNDED)
    m.roll = !!(flags & FLAG_ROLL)
    m.crouch = at[S.crouch]
    m.hang = flags & FLAG_HANG ? hangPose(hang, x, y, z, yaw) : null
    if (at[S.grabs] !== m.grabs) {
      m.grabs = at[S.grabs]
      m.jolt = 0.6
    }
  })

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -50, 0]}>
      <CapsuleCollider args={[0.5, 0.5]} />
      <Character motion={motion} color={colour} isPlayer={false} outfit={worn} />
      <Html center position={[0, 1.5, 0]} distanceFactor={9} zIndexRange={[3, 0]}>
        <div className="net-name bean-name" style={{ borderBottomColor: colour }}>
          {name}
        </div>
      </Html>
    </RigidBody>
  )
}
