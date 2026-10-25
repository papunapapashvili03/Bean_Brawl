import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Character, type CharacterMotion } from '../Character'
import { useOutfit, type Outfit } from '../outfit'
import { activePlayerMotion, activePlayerPosition, activePlayerVelocity, registerRunner, type Vec3 } from '../playerContact'
import { getRaceView, joinRace, type Racer } from '../race/race'
import { restingMotion } from '../runner'
import { joinRoom, net, sendOutfit, sendState, useNet } from './client'
import { inField } from './party'
import { facing, flagsOf, moveLike, newHang, poseAt } from './puppet'
import { S, SEND_EVERY, STATE_LENGTH } from './protocol'

// Playing online in a level: sends where my bean is and what it's doing 20 times a second, and draws everyone
// else's bean where theirs is: a moment behind (DELAY), going smoothly from one state they've sent to the
// next (./puppet). Their beans are solid (you can bump into them, though they won't be pushed by you), wear
// their outfits and have their names over them. Put inside <Physics>, with the level's <Player>.
//
// <Online room> joins the server's room for the level too (the playground). In a party show (./party) the
// show's connection is already there: <OnlinePlayers race> just draws the other players, and puts them in the
// race (../race/race) and among the runners the level's obstacles go by (../playerContact).

const DELAY = 100 // ms: drawn this far behind what they've sent, so there's (nearly) always a next state to go to

export function Online({ room }: { room: string }) {
  const outfit = useOutfit()
  const latest = useRef(outfit)
  useEffect(() => {
    latest.current = outfit
    sendOutfit(outfit)
  }, [outfit])
  useEffect(() => joinRoom(room, () => latest.current), [room])
  return <OnlinePlayers />
}

export function OnlinePlayers({ race = false }: { race?: boolean }) {
  return (
    <>
      <Sender />
      <RemotePlayers race={race} />
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
    yaw.current = facing(m, yaw.current)
    const d = state
    d[S.stamp] = performance.now()
    d[S.x] = p.x
    d[S.y] = p.y
    d[S.z] = p.z
    d[S.vx] = m.vx
    d[S.vy] = v.y
    d[S.vz] = m.vz
    d[S.yaw] = yaw.current
    d[S.flags] = flagsOf(m)
    d[S.crouch] = m.crouch ?? 0
    d[S.grabs] = m.grabs
    d[S.checkpoint] = getRaceView().checkpoint
    sendState(d)
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------
// Everyone else's

function RemotePlayers({ race }: { race: boolean }) {
  const { players } = useNet()
  return (
    <>
      {players.map((p) => (
        <RemoteBean key={p.id} id={p.id} name={p.name} colour={p.colour} outfit={p.outfit} race={race} />
      ))}
    </>
  )
}

function RemoteBean({ id, name, colour, outfit, race }: { id: number; name: string; colour: string; outfit: Partial<Outfit>; race: boolean }) {
  const body = useRef<RapierRigidBody>(null)
  const motion = useRef<CharacterMotion>(restingMotion())
  const pose = useMemo(() => new Array<number>(7).fill(0), [])
  const hang = useMemo(() => newHang(), [])
  const worn = useMemo(() => ({ hat: 'none', face: 'none', shades: 'none', back: 'none', flag: 'none', ...outfit }) as Outfit, [outfit])
  const placed = useRef(false)
  const racer = useRef<Racer | null>(null)
  const velocity = useRef<Vec3>({ x: 0, y: 0, z: 0 })

  // Something the level's obstacles go by (it's knocked about on its own player's screen, not here), and in a
  // race, one of the field
  useEffect(() => {
    const rb = body.current!
    const unregister = registerRunner({ handle: rb.handle, position: () => rb.translation(), velocity: () => velocity.current, knock: () => {} })
    if (!race) return unregister
    const joined = joinRace(name, colour, [0, -50, 0])
    racer.current = joined.racer
    const outOfField = inField(`p:${id}`, joined.racer)
    return () => {
      unregister()
      outOfField()
      joined.leave()
      racer.current = null
    }
  }, [id, name, colour, race])

  useFrame(() => {
    const rb = body.current
    const r = net.remotes.get(id)
    if (!rb || !r) return
    const at = poseAt(r, S.x, performance.now(), DELAY, pose)
    if (!at) return
    const [x, y, z, vx, vy, vz] = pose
    // (Straight there the first time, not swept across the level from wherever it started)
    if (!placed.current) {
      rb.setTranslation({ x, y, z }, true)
      placed.current = true
    }
    rb.setNextKinematicTranslation({ x, y, z })
    velocity.current.x = vx
    velocity.current.y = vy
    velocity.current.z = vz
    const m = motion.current
    moveLike(m, pose, at, S.x, hang)
    if (at[S.grabs] !== m.grabs) {
      m.grabs = at[S.grabs]
      m.jolt = 0.6
    }
    const ra = racer.current
    if (ra) {
      ra.at.x = x
      ra.at.y = y
      ra.at.z = z
      ra.checkpoint = Math.max(ra.checkpoint, at[S.checkpoint])
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
