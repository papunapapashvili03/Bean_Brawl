import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, useBeforePhysicsStep, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { setTimetabled, standing, type Pose } from '../race/kinematic'
import { STEP, playerPosition, raceClock } from '../race/race'
import { sfx } from '../race/sound'
import { WARN } from './course'
import { DUST_POOL, addDust, dust } from './dust'
import { fadeBodies } from './fade'
import { shakeCamera } from './shake'
import { crackTexture } from './stone'

// A piece of the tower that gives way: it stands where it's put until shortly before `fallAt` (match clock),
// then shakes and glows as a warning, and at `fallAt` drops away tumbling, in a puff of dust, and is gone.
// Optionally it also moves while it stands (`turn`: a tilting platform, a spinning bar; `move`: a lift),
// drifts sideways as it falls (`drift`, e.g. a chunk of wall falling away outwards), and shows glowing cracks
// on its top from `crack.at`. It fades out of the camera's way when it's between the camera and the player
// (see ./fade). Bots see it where it stands until it goes (see `standing` in ../race/kinematic) and, if it
// moves or knocks you about, look ahead at where it'll be (`lookAhead`, which can be turned off for something
// that hardly moves).

type Point = [number, number, number]

const G = 20
const FALL_TIME = 3.5 // seconds from starting to fall until it's out of sight (and out of the way)
const HIDDEN = { x: 0, y: -500, z: 0 }
const HEARD_WITHIN = 26 // metres: pieces breaking further away than this don't make a sound

export function Crumble({
  fallAt,
  position,
  rotation = [0, 0, 0],
  geometry,
  material,
  colliders,
  children,
  crack,
  turn,
  move,
  drift,
  onCollisionEnter,
  lookAhead = Boolean(turn || move || onCollisionEnter),
}: {
  fallAt: number | (() => number)
  position: Point
  rotation?: Point
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  colliders: ReactNode
  children?: ReactNode
  crack?: { geometry: THREE.BufferGeometry; at: number | (() => number) }
  turn?: (t: number, out: THREE.Quaternion) => void
  move?: (t: number, out: THREE.Vector3) => void
  drift?: Point
  onCollisionEnter?: (payload: CollisionEnterPayload) => void
  lookAhead?: boolean
}) {
  const body = useRef<RapierRigidBody>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const crackMesh = useRef<THREE.Mesh>(null)
  // Each piece has its own copy of the material, so it can glow (and fade) on its own
  const look = useMemo(() => material.clone(), [material])
  const crackLook = useMemo(
    () =>
      crack
        ? new THREE.MeshBasicMaterial({ map: crackTexture, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
        : null,
    [crack],
  )
  useEffect(() => {
    const handle = body.current!.handle
    const own = mesh.current!.material as THREE.MeshStandardMaterial
    const cracks = crackMesh.current?.material as THREE.Material | undefined
    fadeBodies.set(handle, own)
    return () => {
      fadeBodies.delete(handle)
      own.dispose()
      cracks?.dispose()
    }
  }, [look, crackLook])

  const rest = useMemo(
    () => ({
      p: new THREE.Vector3(...position),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      seed: position[0] * 12.99 + position[2] * 78.23 + position[1] * 3.7,
    }),
    [position, rotation],
  )
  const tumbleAxis = useMemo(
    () => new THREE.Vector3(Math.sin(rest.seed), 0.3, Math.cos(rest.seed * 1.3)).normalize(),
    [rest],
  )
  const state = useRef({ settled: false, fell: false, hidden: false })
  const scratch = useRef({ p: new THREE.Vector3(), q: new THREE.Quaternion(), extra: new THREE.Quaternion(), offset: new THREE.Vector3() })
  const when = () => (typeof fallAt === 'function' ? fallAt() : fallAt)

  // Where it stands at t, for the bots looking ahead: gone once it falls (out of the reckoning)
  const ahead = useRef({ pose: { position: new THREE.Vector3(), rotation: new THREE.Quaternion() }, extra: new THREE.Quaternion() })
  const poseAt = (t: number): Pose => {
    const { pose, extra } = ahead.current
    if (t >= when()) {
      pose.position.set(0, -500, 0)
      return pose
    }
    pose.rotation.copy(rest.q)
    if (turn) {
      turn(t, extra)
      pose.rotation.multiply(extra)
    }
    if (move) move(t, pose.position)
    else pose.position.set(0, 0, 0)
    pose.position.add(rest.p)
    return pose
  }
  const latest = useRef({ when, poseAt })
  useEffect(() => {
    latest.current = { when, poseAt }
  })
  const hazard = Boolean(onCollisionEnter)
  useEffect(() => {
    const handle = body.current!.handle
    standing.set(handle, () => latest.current.when())
    if (lookAhead) setTimetabled(handle, { pose: (t) => latest.current.poseAt(t), hazard })
    return () => {
      standing.delete(handle)
      if (lookAhead) setTimetabled(handle, null)
    }
  }, [lookAhead, hazard])

  useBeforePhysicsStep(() => {
    const rb = body.current
    if (!rb) return
    const t = raceClock() + STEP
    const tf = when()
    const s = state.current
    const { p, q, extra, offset } = scratch.current
    if (t >= tf + FALL_TIME) {
      if (!s.hidden) rb.setNextKinematicTranslation(HIDDEN)
      s.hidden = true
      return
    }
    s.hidden = false
    q.copy(rest.q)
    if (turn) {
      turn(t, extra)
      q.multiply(extra)
    }
    // Where it stands (a lift stands where its timetable has got to; it falls from wherever it was)
    if (move) move(Math.min(t, tf), offset)
    else offset.set(0, 0, 0)
    if (t < tf - WARN) {
      // Standing: only needs setting when something about it changes
      if (turn || move || !s.settled) {
        rb.setNextKinematicTranslation(p.copy(rest.p).add(offset))
        rb.setNextKinematicRotation(q)
        s.settled = true
      }
      s.fell = false
      return
    }
    s.settled = false
    if (t < tf) {
      const k = (t - (tf - WARN)) / WARN
      const shake = 0.03 + 0.05 * k
      p.set(
        rest.p.x + offset.x + Math.sin(t * 47 + rest.seed) * shake,
        rest.p.y + offset.y + Math.sin(t * 53 + rest.seed * 2) * shake * 0.5,
        rest.p.z + offset.z + Math.sin(t * 61 + rest.seed * 3) * shake,
      )
      rb.setNextKinematicTranslation(p)
      rb.setNextKinematicRotation(q)
      return
    }
    const d = t - tf
    p.copy(rest.p).add(offset)
    if (!s.fell) {
      s.fell = true
      addDust(p, 7, 2)
      const near = Math.hypot(p.x - playerPosition.x, p.y - playerPosition.y, p.z - playerPosition.z)
      if (near < HEARD_WITHIN) {
        sfx.crumble()
        shakeCamera(0.012 * (1 - near / HEARD_WITHIN), 0.5, t)
      }
    }
    p.y -= 0.5 * G * d * d
    if (drift) {
      p.x += drift[0] * d
      p.z += drift[2] * d
    }
    q.multiply(extra.setFromAxisAngle(tumbleAxis, d * 1.4))
    rb.setNextKinematicTranslation(p)
    rb.setNextKinematicRotation(q)
  })

  // The warning: an orange glow pulsing brighter as it's about to go; cracks fading in across the top
  useFrame(() => {
    const t = raceClock()
    const tf = when()
    const w = t < tf - WARN ? 0 : Math.min(1, (t - (tf - WARN)) / WARN)
    const pulse = w * (0.65 + 0.35 * Math.sin(t * 18))
    const own = mesh.current!.material as THREE.MeshStandardMaterial
    own.emissive.setRGB(0.85 * pulse, 0.3 * pulse, 0.05 * pulse)
    const cracks = crackMesh.current
    if (cracks && crack) {
      const at = typeof crack.at === 'function' ? crack.at() : crack.at
      const overlay = cracks.material as THREE.MeshBasicMaterial
      overlay.opacity = THREE.MathUtils.clamp((t - at) / 1.5, 0, 1)
    }
  })

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={position}
      rotation={rotation}
      onCollisionEnter={onCollisionEnter}
    >
      {colliders}
      <mesh ref={mesh} geometry={geometry} material={look} castShadow receiveShadow />
      {crack && crackLook && <mesh ref={crackMesh} geometry={crack.geometry} material={crackLook} renderOrder={1} />}
      {children}
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Dust clouds (see ./dust): soft grey puffs that swell, drift up and fade

const puffGeometry = new THREE.SphereGeometry(1, 10, 8)
const puffMaterial = new THREE.MeshStandardMaterial({ color: '#d3cabd', transparent: true, opacity: 0.38, depthWrite: false, roughness: 1 })
const m = new THREE.Matrix4()
const q0 = new THREE.Quaternion()
const scale = new THREE.Vector3()

export function Dust() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useFrame((_, dt) => {
    const list = dust
    for (let i = list.length - 1; i >= 0; i--) {
      const puff = list[i]
      puff.age += dt
      if (puff.age > puff.life) list.splice(i, 1)
    }
    list.forEach((puff, i) => {
      const k = puff.age / puff.life
      puff.at.addScaledVector(puff.drift, dt)
      const s = puff.size * (0.5 + 1.5 * k) * (1 - k * k)
      mesh.current!.setMatrixAt(i, m.compose(puff.at, q0, scale.setScalar(Math.max(s, 0.001))))
    })
    mesh.current!.count = list.length
    mesh.current!.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[puffGeometry, puffMaterial, DUST_POOL]} frustumCulled={false} />
}
