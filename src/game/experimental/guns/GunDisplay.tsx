import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { newHeld, setHeld, type Held } from '../../held'
import { activePlayerPosition, activePlayerPosture } from '../../playerContact'
import { BOTTOM } from '../../toon'
import { isHeadshot, targetFor, type Target } from '../combat'
import { ammo, now, useAmmo } from './ammo'
import { GUNS, type Recoil } from './catalog'
import { Effects } from './Effects'
import { addPuff, addRocket, addTracer } from './fx'
import { HeldGun } from './HeldGun'
import { GunHud, Reticle, ScopeView, type Slot } from './hud'
import { inHand } from './inHand'
import { useAimTrigger } from './input'
import { offhand } from './offhand'
import { GUN_SCALE } from './parts'
import { pinToScreen } from './screen'
import { castShot, rayStart } from './shots'
import { pelletOffset } from './spread'
import { playBolt, playReload, playShot } from './sounds'
import { AimArc } from './throwables/AimArc'
import { newArcAim } from './throwables/arc'
import { PROJECTILES, THROWABLES, THROW_KINDS, launchSpeed, lobVelocity, type ThrowKind } from './throwables/catalog'
import { CARRY_MAX, pouch, usePouch } from './throwables/pouch'
import { ThrowEffects } from './throwables/ThrowEffects'
import { Throwing } from './throwables/Throwing'
import { launch } from './throwables/world'

// EXPERIMENTAL: guns (and throwables). Display platforms in the playground, with each gun floating and
// turning over a glowing pedestal, like a pickup. Walk up to one and press F to pick it up: you carry up to
// two guns, in slots 2 and 3, and switch with 1 (empty hands), 2 and 3. G puts the gun in your hands back
// (which restocks it). Left mouse button shoots, right mouse button (or Z) aims, R reloads.
// Throwables (grenade, dynamite, molotov, smoke grenade) have their own platform: F takes a full stack of
// one, into slot 4; press 4 again to switch between the kinds you carry, G puts one back (./throwables).
// Self-contained: remove <GunDisplay /> from the playground scene and delete this folder to take it out.

// The platform comes up to where the character's torso starts: the physics capsule's centre is 1 above
// the ground and the bean body begins at BOTTOM.y - BOTTOM.ry below that centre
const PLATFORM_HEIGHT = 1 + BOTTOM.y - BOTTOM.ry
const SPACING = 1.9 // the chunky guns sweep about 0.9 either side as they turn (the rocket launcher 1.1)
const SNIPER_SPACING = 2.6 // the snipers sweep about 1.15
const THROW_SPACING = 1.5 // throwables are small: they sit lower, shown bigger than life
const THROW_FLOAT = 0.55
const THROW_SCALE = 1.8
const DEPTH = 1.8
const FLOAT = 0.8 // gun centre above the pedestal: clears the magazines while it turns
const PICKUP_REACH = 1.6 // how close (across the ground) the player must be to a pedestal: reachable from the platform edge
const PICK_KEY = 'KeyF'
const DROP_KEY = 'KeyG'
const SLOT_KEYS: Record<string, Slot> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  Numpad1: 1,
  Numpad2: 2,
  Numpad3: 3,
  Numpad4: 4,
}
const RELOAD_KEY = 'KeyR'
const AIM_SPEED = 12 // how quickly the gun comes up to aim and back down (per second)
const AIM_CAMERA = { zoom: 0.55, shift: 0.75 } // closer, over the right shoulder

// What a pedestal holds: a gun (by catalog index), or a kind of throwable (which never runs out)
export type Pick = { gun: number } | { throwable: ThrowKind }
// A platform of pedestals: where it stands (its middle, on the ground at height `y`), which way it faces (turned
// by `yaw` about the vertical; unturned, it runs along x with its front towards +z) and what sits along it, by
// x from its middle
export type RackLayout = { x: number; z: number; y?: number; yaw?: number; spacing?: number; items: { pick: Pick; x: number }[] }
const pickId = (pick: Pick) => ('gun' in pick ? `gun:${pick.gun}` : `throwable:${pick.throwable}`)
const guns = (list: { gun: number; x: number }[]) => list.map(({ gun, x }) => ({ pick: { gun }, x }))

// The racks: where each platform stands and what sits on each pedestal, by its x along the platform. The
// rocket launcher sweeps the widest of the first two racks, so it gets the end with extra room. The snipers
// sweep wider still, and stand furthest back, about 30 m from the dummies. Beside them, the explosives:
// the throwables and the bomb launcher.
const RACKS: RackLayout[] = [
  { x: -6.9, z: 5, items: guns([0, 1, 2, 3, 4].map((gun, i) => ({ gun, x: (i - 2) * SPACING }))) },
  {
    x: 6.7,
    z: 5,
    items: guns([
      { gun: 5, x: -2 * SPACING },
      { gun: 6, x: -SPACING },
      { gun: 7, x: 0 },
      { gun: 8, x: SPACING },
      { gun: 9, x: 2 * SPACING + 0.3 },
    ]),
  },
  {
    x: 0,
    z: 13,
    spacing: SNIPER_SPACING,
    items: guns([
      { gun: 10, x: -SNIPER_SPACING },
      { gun: 11, x: 0 },
      { gun: 12, x: SNIPER_SPACING },
    ]),
  },
  {
    x: -8.2,
    z: 10,
    spacing: THROW_SPACING,
    items: [
      ...THROW_KINDS.map((throwable, i) => ({ pick: { throwable } as Pick, x: (i - 1.5) * THROW_SPACING })),
      { pick: { gun: 13 }, x: 1.5 * THROW_SPACING + 1.75 },
    ],
  },
]
// Every pedestal with its world position, for finding the one the player stands at (a pedestal's id names its
// rack too, as the same gun can be on more than one)
const pedestalId = (rack: number, pick: Pick) => `${rack}/${pickId(pick)}`
function pedestalsOf(racks: RackLayout[]) {
  return racks.flatMap((rack, r) => {
    const yaw = rack.yaw ?? 0
    return rack.items.map(({ pick, x }) => ({
      id: pedestalId(r, pick),
      pick,
      x: rack.x + x * Math.cos(yaw),
      y: rack.y ?? 0,
      z: rack.z - x * Math.sin(yaw),
    }))
  })
}

const pedestalBase = new THREE.CylinderGeometry(0.42, 0.46, 0.08, 32)
const pedestalRing = new THREE.TorusGeometry(0.36, 0.025, 8, 40)
const beam = new THREE.CylinderGeometry(0.3, 0.36, 0.6, 32, 1, true)
const baseMaterial = new THREE.MeshStandardMaterial({ color: '#2a2d35', roughness: 0.6 })
const platformMaterial = new THREE.MeshStandardMaterial({ color: '#3b4150', roughness: 0.8 })
const trimMaterial = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5 })

const glowCache = new Map<string, { ring: THREE.Material; beam: THREE.Material }>()
function glow(color: string) {
  let g = glowCache.get(color)
  if (!g) {
    g = {
      ring: new THREE.MeshBasicMaterial({ color }),
      beam: new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    }
    glowCache.set(color, g)
  }
  return g
}

const promptStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px 6px 6px',
  borderRadius: 99,
  background: 'rgba(20, 22, 30, 0.78)',
  color: 'white',
  font: '700 13px system-ui, sans-serif',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}
const keyStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 22,
  height: 22,
  borderRadius: 6,
  background: 'white',
  color: '#1f2226',
  fontSize: 12,
}

function Prompt({ keyLabel, text, height = FLOAT + 0.75 }: { keyLabel: string; text: string; height?: number }) {
  return (
    <Html center position={[0, height, 0]} zIndexRange={[10, 0]}>
      <div style={promptStyle}>
        <span style={keyStyle}>{keyLabel}</span>
        {text}
      </div>
    </Html>
  )
}

// How a pickup shows on its pedestal: guns tipped a little like a loot icon, throwables smaller, so lower and
// shown bigger. `seed` keeps neighbours from turning in step.
function display(pick: Pick): { Model: ComponentType; color: string; float: number; scale: number; tip: number; seed: number } {
  if ('gun' in pick) {
    const gun = GUNS[pick.gun]
    return { Model: gun.Model, color: gun.rarity, float: FLOAT, scale: 1, tip: 0.12, seed: pick.gun }
  }
  const throwable = THROWABLES[pick.throwable]
  return {
    Model: throwable.Model,
    color: throwable.rarity,
    float: THROW_FLOAT,
    scale: THROW_SCALE,
    tip: 0,
    seed: 20 + THROW_KINDS.indexOf(pick.throwable),
  }
}

function Pedestal({ pick, x, taken, children }: { pick: Pick; x: number; taken: boolean; children?: ReactNode }) {
  const { Model, color, float, scale, tip, seed } = display(pick)
  const spinner = useRef<THREE.Group>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime + seed * 1.3
    spinner.current!.rotation.y = t * 0.6
    spinner.current!.position.y = float + Math.sin(t * 1.6) * 0.04
  })
  const g = glow(color)
  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={pedestalBase} material={baseMaterial} position={[0, 0.04, 0]} receiveShadow />
      <mesh geometry={pedestalRing} material={g.ring} position={[0, 0.085, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {!taken && <mesh geometry={beam} material={g.beam} position={[0, 0.38, 0]} />}
      <group ref={spinner} visible={!taken}>
        <group rotation={[0, 0, tip]} scale={scale}>
          <Model />
        </group>
      </group>
      {children}
    </group>
  )
}

const lerp = THREE.MathUtils.lerp
const offhandPosition = new THREE.Vector3()
const offhandQuaternion = new THREE.Quaternion()
const inverse = new THREE.Quaternion()

// Shooting
const RANGE = 150 // m
const RAISE_FOR = 0.7 // seconds the gun stays up after shooting when you're not aiming
const READY = 0.7 // how far the gun must have come up before shots leave it
const LOOK_UP = -0.35 // how far above level the camera may look while you hold a gun (to aim at heads)
const TRACER_WIDTH = { bullet: 0.03, pellet: 0.016 }
// Recoil: how far each shot kicks the view up (radians; it recovers) and the gun back in the hands
const RECOIL: Record<Recoil, { view: number; gun: number }> = {
  none: { view: 0, gun: 0 },
  medium: { view: 0.045, gun: 1 },
  minimal: { view: 0.006, gun: 0.35 },
  slight: { view: 0.02, gun: 0.7 },
  strong: { view: 0.11, gun: 1.6 },
}
const VIEW_RECOVERY = 7 // per second
const GUN_RECOVERY = 14
const LAUNCHER_REAR = -0.9 // the rocket launcher's exhaust end, for the backblast
// Scoped aiming: the camera moves up to eye level (just behind the look point, above the head) and, once
// there, looks through the scope. The scope window fills most of the screen.
const SCOPE_ZOOM = 0.02
const SCOPE_READY = 0.9 // how far the aim blend must be before the scope view takes over
const SCOPE_NEAR = 0.5 // ... and how close the camera must have come to its eye-level spot (it stops 0.2 short)
const SCOPE_FOLLOW = 18 // the camera moves up to the scope quickly (it normally follows at 5)
const SCOPE_SIZE = 0.44 // window radius, as a share of the smaller screen side
// Working a bolt after a shot: it starts shortly after the shot and is home just before the next can go
const BOLT_START = 0.15
const BOLT_END = 0.1

const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const ONE = new THREE.Vector3(1, 1, 1)
const camPos = new THREE.Vector3()
const camDir = new THREE.Vector3()
const camRight = new THREE.Vector3()
const camUp = new THREE.Vector3()
const origin = new THREE.Vector3()
const dir = new THREE.Vector3()
const end = new THREE.Vector3()
const muzzleAt = new THREE.Vector3()
const offhandMatrix = new THREE.Matrix4()
const kickAxis = new THREE.Vector3()
const kickTurn = new THREE.Quaternion()
const eye = new THREE.Vector3()
const lobTurn = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

// The gun jumps back along its barrel and tips its muzzle up by `k`, then settles
function kick(position: THREE.Vector3, quaternion: THREE.Quaternion, k: number) {
  if (k < 1e-4) return
  kickAxis.copy(X_AXIS).applyQuaternion(quaternion)
  position.addScaledVector(kickAxis, -0.06 * k)
  quaternion.multiply(kickTurn.setFromAxisAngle(Z_AXIS, 0.16 * k))
}

// Puts the gun in the character's hands and runs it every frame: carrying, raised to aim where the camera
// looks (while aiming or shooting), the trigger, reloads and recoil
function Holding({ index }: { index: number }) {
  const { carry, aim, fire, muzzle, sound } = GUNS[index]
  const physics = useRapier()
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)
  const screenHeight = useThree((s) => s.size.height)
  const screenWidth = useThree((s) => s.size.width)
  const { reload } = useAmmo()
  const [scoped, setScoped] = useState(false)
  const state = useRef({
    aiming: false,
    trigger: false,
    fresh: false, // the trigger was pressed and hasn't fired yet (one shot per click, for single-shot guns)
    boltAt: -Infinity, // when the last shot of a bolt gun went
    pose: 0, // 0 carried .. 1 raised
    zoom: 0, // 0 normal camera .. 1 over the shoulder
    raisedUntil: 0,
    next: 0, // when the next shot may go
    burstLeft: 0,
    burstNext: 0,
    side: 0, // a pair: which gun fires next (0 right, 1 left)
    viewKick: 0,
    viewKickYaw: 0,
    gunKick: [0, 0],
  })
  const held = useRef<Held | null>(null)
  const stopBolt = useRef<(() => void) | null>(null)
  const arc = useRef(newArcAim())
  const rightHand = useRef(new THREE.Vector3())
  const leftHand = useRef(new THREE.Vector3())

  useEffect(() => {
    inHand.gun = index
    inHand.ready = false
    const h = newHeld(HeldGun)
    held.current = h
    setHeld(h)
    const bolt = stopBolt
    return () => {
      held.current = null
      setHeld(null)
      ammo.cancelReload() // switching guns stops a reload
      bolt.current?.()
    }
  }, [index])

  // Right mouse button (or Z) aims; left mouse button fires; R reloads
  useAimTrigger(canvas, state)
  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (!e.repeat && e.code === RELOAD_KEY) ammo.startReload(index)
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [index])

  // One shot: aimed from the camera through the reticle, leaving from the muzzle
  const shoot = () => {
    const s = state.current
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
    rayStart(camPos, camDir, origin)

    playShot(sound)
    const side = fire.alternate ? s.side : 0
    if (fire.alternate) s.side = 1 - s.side
    muzzleAt.set(muzzle[0] * GUN_SCALE[0], muzzle[1] * GUN_SCALE[1], 0)
    if (side === 1) muzzleAt.applyMatrix4(offhandMatrix.compose(offhand.position, offhand.quaternion, ONE))
    muzzleAt.applyMatrix4(inHand.matrix)

    if (fire.rocket) {
      // The warhead flies off towards whatever the reticle is on; the backblast puffs out behind
      const hit = castShot(physics, origin, camDir, RANGE)
      end.copy(hit ? hit.point : origin.clone().addScaledVector(camDir, RANGE))
      addRocket(muzzleAt, end.clone().sub(muzzleAt), fire.rocket.speed, index)
      const rear = new THREE.Vector3(LAUNCHER_REAR * GUN_SCALE[0], 0, 0).applyMatrix4(inHand.matrix)
      const back = rear.clone().sub(muzzleAt).normalize()
      for (let i = 0; i < 5; i++) {
        addPuff(rear, 'smoke', 0.09 + Math.random() * 0.06, back.clone().multiplyScalar(4 + Math.random() * 3).add(new THREE.Vector3(0, 0.6, 0)))
      }
    } else if (fire.lob) {
      // A bomb capsule out of the muzzle, lobbed like a throw (./throwables), nose first; its fuse starts now
      const capsule = PROJECTILES.capsule
      const speed = launchSpeed(fire.lob.reach, Math.abs(physics.world.gravity.y) || 20)
      lobVelocity(camDir, speed, dir)
      launch(
        'capsule',
        muzzleAt,
        dir,
        capsule.fuse,
        { armed: true, spent: true, lit: true, burn: 1 },
        lobTurn.setFromUnitVectors(UP, end.copy(dir).normalize()),
      )
      addPuff(muzzleAt, 'smoke', 0.12, camDir.clone().multiplyScalar(1.5))
    } else {
      // Every bullet (or pellet) that lands on a target adds up into one hit per target per shot
      const tally = new Map<Target, { damage: number; head: boolean }>()
      const pellets = fire.pellets
      const turn = Math.random() * Math.PI * 2
      for (let i = 0; i < (pellets?.count ?? 1); i++) {
        dir.copy(camDir)
        if (pellets) {
          const [r, a] = pelletOffset(pellets, i, turn)
          dir.addScaledVector(camRight, r * Math.cos(a)).addScaledVector(camUp, r * Math.sin(a)).normalize()
        }
        const hit = castShot(physics, origin, dir, RANGE)
        end.copy(hit ? hit.point : origin).addScaledVector(dir, hit ? 0 : RANGE)
        addTracer(muzzleAt, end, pellets ? TRACER_WIDTH.pellet : TRACER_WIDTH.bullet)
        if (!hit) continue
        addPuff(hit.point, 'spark', 0.09)
        const target = targetFor(hit.collider)
        if (!target) continue
        const head = isHeadshot(target, hit.point)
        const sum = tally.get(target) ?? { damage: 0, head: false }
        sum.damage += head ? fire.headshot : fire.damage
        sum.head ||= head
        tally.set(target, sum)
      }
      tally.forEach((sum, target) => target.hit(sum.damage, sum.head))
    }
    if (fire.suppressed) addPuff(muzzleAt, 'smoke', 0.05, new THREE.Vector3(0, 0.3, 0))
    else addPuff(muzzleAt, 'flash', fire.rocket ? 0.4 : fire.lob ? 0.3 : fire.pellets ? 0.24 : 0.16)

    // Recoil kicks the view (not for a gun that lobs: its camera never moves) and the gun in the hands
    const recoil = RECOIL[fire.recoil]
    const view = fire.lob ? 0 : recoil.view
    s.viewKick += view
    s.viewKickYaw += (Math.random() - 0.5) * view * 0.8
    s.gunKick[side] = Math.min(2, s.gunKick[side] + recoil.gun)
  }

  useFrame((_, dt) => {
    const h = held.current
    if (!h) return
    const s = state.current
    const time = now()

    // Raised while aiming or shooting (and a moment after); the camera only closes in while aiming
    if (s.trigger) s.raisedUntil = time + RAISE_FOR
    s.pose = lerp(s.pose, s.aiming || time < s.raisedUntil ? 1 : 0, 1 - Math.exp(-AIM_SPEED * dt))
    s.zoom = lerp(s.zoom, s.aiming ? 1 : 0, 1 - Math.exp(-AIM_SPEED * dt))
    const t = s.pose

    // Recoil settles
    s.viewKick *= Math.exp(-VIEW_RECOVERY * dt)
    s.viewKickYaw *= Math.exp(-VIEW_RECOVERY * dt)
    s.gunKick[0] *= Math.exp(-GUN_RECOVERY * dt)
    s.gunKick[1] *= Math.exp(-GUN_RECOVERY * dt)

    h.position.lerpVectors(carry.position, aim.position, t)
    h.quaternion.slerpQuaternions(carry.quaternion, aim.quaternion, t)
    kick(h.position, h.quaternion, s.gunKick[0])
    // Hands stay on the gun through the blend (and the kick): work them out from where the gun is right now.
    // A hand that's free while carrying grabs on as the gun comes up (its arm blends in by itself).
    h.right = rightHand.current.copy(carry.grip).lerp(aim.grip, t).applyQuaternion(h.quaternion).add(h.position)
    if (carry.offhand && aim.offhand) {
      // A pair: the second gun has its own pose; the left hand holds it, and the held pair draws it
      // relative to the first
      offhandPosition.lerpVectors(carry.offhand.position, aim.offhand.position, t)
      offhandQuaternion.slerpQuaternions(carry.offhand.quaternion, aim.offhand.quaternion, t)
      kick(offhandPosition, offhandQuaternion, s.gunKick[1])
      h.left = leftHand.current.copy(carry.offhand.grip).applyQuaternion(offhandQuaternion).add(offhandPosition)
      inverse.copy(h.quaternion).invert()
      offhand.quaternion.copy(inverse).multiply(offhandQuaternion)
      offhand.position.copy(offhandPosition).sub(h.position).applyQuaternion(inverse)
    } else {
      const support = t > 0.05 ? (aim.support ?? carry.support) : carry.support
      h.left = support ? leftHand.current.copy(support).applyQuaternion(h.quaternion).add(h.position) : null
    }
    h.twist = lerp(carry.twist, aim.twist, t)
    h.lookAround = lerp(carry.lookAround, aim.lookAround, t)
    camera.getWorldDirection(camDir)
    const aimYaw = Math.atan2(camDir.x, camDir.z)
    h.yaw = t > 0.05 && aim.yawOffset !== null ? aimYaw + aim.yawOffset : null
    // A scope takes the camera up to eye level (the look point: above the head, over the right shoulder, lower
    // when crouching), and only once it's there does the view go through the scope
    const player = activePlayerPosition()
    const posture = activePlayerPosture()
    let nowScoped = false
    if (fire.scope && s.zoom > SCOPE_READY && player) {
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
      eye.set(player.x, player.y + (posture?.lookHeight ?? 1), player.z).addScaledVector(camRight, AIM_CAMERA.shift)
      nowScoped = camera.position.distanceTo(eye) < SCOPE_NEAR
    }
    if (nowScoped !== scoped) setScoped(nowScoped)
    // Aiming closes the camera in over the shoulder, except with a gun that lobs: the camera stays just as it
    // is, like for throwing
    const closeIn = fire.lob ? 0 : s.zoom
    h.cameraFollow = fire.scope ? lerp(5, SCOPE_FOLLOW, s.zoom) : 5
    h.cameraZoom = lerp(1, fire.scope ? SCOPE_ZOOM : AIM_CAMERA.zoom, closeIn)
    h.cameraShift = lerp(0, AIM_CAMERA.shift, closeIn)
    h.cameraMagnify = nowScoped ? fire.scope! : 1
    h.cameraKickPitch = s.viewKick
    h.cameraKickYaw = s.viewKickYaw
    h.cameraPitchMin = fire.lob ? null : LOOK_UP

    // Lobbing capsules: while aiming, the arc they'll fly from the muzzle, to a ring as big as their blast
    if (fire.lob) {
      const a = arc.current
      a.show = s.zoom > 0.5 && inHand.ready
      if (a.show) {
        a.from.set(muzzle[0] * GUN_SCALE[0], muzzle[1] * GUN_SCALE[1], 0).applyMatrix4(inHand.matrix)
        camera.getWorldDirection(camDir)
        lobVelocity(camDir, launchSpeed(fire.lob.reach, Math.abs(physics.world.gravity.y) || 20), a.vel)
        a.reach = PROJECTILES.capsule.blast!.radius
      }
    }

    // Working the bolt after a shot: lifted and pulled back, then pushed home before the next shot can go
    if (fire.bolt) {
      const p = (time - s.boltAt - BOLT_START) / (fire.interval - BOLT_START - BOLT_END)
      inHand.boltPull = p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0
    }

    // The trigger: shots go once the gun is up, at the gun's rate; bursts finish on their own. Single-shot
    // guns fire once per click.
    const reloading = ammo.get().reload?.gun === index
    const rolling = activePlayerPosture()?.stance === 'roll' // the gun's put away while rolling
    const ready = t > READY && inHand.ready && !reloading && !rolling
    if (s.burstLeft > 0 && time >= s.burstNext) {
      if (ready && ammo.spend(index)) {
        shoot()
        s.burstLeft -= 1
        s.burstNext += fire.burst?.gap ?? 0
      } else s.burstLeft = 0
    }
    const pressed = fire.single ? s.trigger && s.fresh : s.trigger
    if (pressed && ready && s.burstLeft === 0 && time >= s.next && ammo.spend(index)) {
      shoot()
      s.fresh = false
      s.next = time + fire.interval
      if (fire.bolt) {
        // Its sound is set going with the shot, timed to the bolt's movement
        s.boltAt = time
        stopBolt.current?.()
        stopBolt.current = playBolt(BOLT_START, fire.interval - BOLT_END)
      }
      if (fire.burst) {
        s.burstLeft = fire.burst.count - 1
        s.burstNext = time + fire.burst.gap
      }
    }
    // An empty magazine reloads by itself (if there's anything left to load)
    if (!reloading && s.burstLeft === 0 && ammo.get().mag[index] === 0) ammo.startReload(index)
  })

  // Shotguns show their spread as a hollow circle: the cone's angle, as pixels on screen
  const spread = fire.pellets?.spread
  const fov = (camera as THREE.PerspectiveCamera).fov ?? 50
  const circle = spread ? (Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(fov) / 2)) * (screenHeight / 2) : null
  const gunReload = reload?.gun === index ? reload : null

  // The reload's sounds start with it, and stop if it's cut short (switching guns, putting the gun back)
  const reloadStart = gunReload?.start ?? null
  useEffect(() => {
    if (reloadStart === null) return
    const { ammo: kind, fire: spec } = GUNS[index]
    return playReload(kind, spec.reload, Math.max(0, now() - reloadStart))
  }, [reloadStart, index])

  return (
    <>
      {fire.lob && <AimArc aim={arc} color="#ff5a4a" />}
      <Html fullscreen calculatePosition={pinToScreen} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        {scoped && fire.scope ? (
          <ScopeView radius={Math.min(screenWidth, screenHeight) * SCOPE_SIZE} magnification={fire.scope} />
        ) : (
          <Reticle circle={circle} reload={gunReload} />
        )}
      </Html>
    </>
  )
}

// `racks`: where the platforms stand (the playground's, unless given)
export function GunDisplay({ racks = RACKS }: { racks?: RackLayout[] }) {
  const pedestals = useMemo(() => pedestalsOf(racks), [racks])
  const [slots, setSlots] = useState<[number | null, number | null]>([null, null]) // guns in slots 2 and 3
  const [active, setActive] = useState<Slot>(1)
  const [near, setNear] = useState<string | null>(null) // the pedestal the player stands at
  const carried = usePouch() // throwables, in slot 4
  const gunSlot = active === 2 || active === 3 ? active : null
  const inHand = gunSlot === null ? null : slots[gunSlot - 2]
  const owned = (pick: Pick) => 'gun' in pick && slots.includes(pick.gun)
  const nearPick = pedestals.find((p) => p.id === near)?.pick ?? null

  // A fresh playground starts with nothing carried
  useEffect(() => pouch.reset(), [])

  // Where a picked-up gun goes: the selected slot if it's empty, else any empty slot, else it replaces the
  // gun in the selected slot (or slot 2 when you're not holding a gun), which goes back to its pedestal
  const pickupSlot = (): { slot: 2 | 3; swap: boolean } => {
    if (gunSlot !== null && slots[gunSlot - 2] === null) return { slot: gunSlot, swap: false }
    const empty = slots.indexOf(null)
    if (empty >= 0) return { slot: (empty + 2) as 2 | 3, swap: false }
    return { slot: gunSlot ?? 2, swap: true }
  }

  // Selecting slot 4 again switches to the next kind of throwable you carry
  const select = (slot: Slot) => {
    if (slot === 4 && active === 4) pouch.cycle()
    else setActive(slot)
  }

  // Which pedestal (if any) the player is standing at; and reloads finish when their time is up
  useFrame(() => {
    ammo.update()
    const p = activePlayerPosition()
    let nearest: string | null = null
    if (p) {
      let best = PICKUP_REACH
      for (const pedestal of pedestals) {
        if (p.y - pedestal.y > PLATFORM_HEIGHT + 3 || p.y < pedestal.y) continue
        const d = Math.hypot(p.x - pedestal.x, p.z - pedestal.z)
        if (d < best) {
          best = d
          nearest = pedestal.id
        }
      }
    }
    if (nearest !== near) setNear(nearest)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code in SLOT_KEYS) select(SLOT_KEYS[e.code])
      if (e.code === PICK_KEY && nearPick) {
        if ('throwable' in nearPick) {
          pouch.fill(nearPick.throwable)
          setActive(4)
        } else if (!slots.includes(nearPick.gun)) {
          const { slot } = pickupSlot()
          const next: [number | null, number | null] = [...slots]
          next[slot - 2] = nearPick.gun
          setSlots(next)
          setActive(slot)
        }
      }
      if (e.code === DROP_KEY) {
        if (gunSlot !== null && slots[gunSlot - 2] !== null) {
          ammo.refill(slots[gunSlot - 2]!) // back on its pedestal, restocked
          const next: [number | null, number | null] = [...slots]
          next[gunSlot - 2] = null
          setSlots(next)
        } else if (active === 4 && carried.selected) pouch.putBack(carried.selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const prompt = (pick: Pick) => {
    if ('throwable' in pick) {
      const kind = pick.throwable
      const { name } = THROWABLES[kind]
      const height = THROW_FLOAT + 0.6
      if (active === 4 && carried.selected === kind) return <Prompt keyLabel="G" text={`Put back ${name}`} height={height} />
      const count = carried.counts[kind]
      const text = count === 0 ? `Pick up ${name}` : count < CARRY_MAX ? `Refill ${name}` : `Take out ${name}`
      return <Prompt keyLabel="F" text={text} height={height} />
    }
    const name = GUNS[pick.gun].name
    if (pick.gun === inHand) return <Prompt keyLabel="G" text={`Put back ${name}`} />
    if (owned(pick)) return null
    return <Prompt keyLabel="F" text={pickupSlot().swap ? `Swap for ${name}` : `Pick up ${name}`} />
  }

  return (
    <group>
      {inHand !== null && <Holding key={inHand} index={inHand} />}
      {active === 4 && carried.selected && <Throwing key={carried.selected} kind={carried.selected} />}
      <Effects />
      <ThrowEffects />
      {/* Above the reticle and scope view (which darkens the rest of the screen) */}
      <Html fullscreen calculatePosition={pinToScreen} zIndexRange={[6, 5]} style={{ pointerEvents: 'none' }}>
        <GunHud slots={slots} active={active} pouch={carried} onSelect={select} />
      </Html>
      {racks.map((rack, r) => (
        <Rack key={r} index={r} rack={rack} owned={owned} near={near} prompt={prompt} />
      ))}
    </group>
  )
}

// One platform with its row of pedestals
function Rack({
  index,
  rack,
  owned,
  near,
  prompt,
}: {
  index: number
  rack: RackLayout
  owned: (pick: Pick) => boolean
  near: string | null
  prompt: (pick: Pick) => ReactNode
}) {
  const xs = rack.items.map((p) => p.x)
  const half = (rack.spacing ?? SPACING) / 2
  const x0 = Math.min(...xs) - half - 0.2
  const x1 = Math.max(...xs) + half + 0.2
  const width = x1 - x0
  return (
    <group position={[rack.x, rack.y ?? 0, rack.z]} rotation={[0, rack.yaw ?? 0, 0]}>
      <RigidBody type="fixed" colliders={false} position={[(x0 + x1) / 2, PLATFORM_HEIGHT / 2, 0]}>
        <CuboidCollider args={[width / 2, PLATFORM_HEIGHT / 2, DEPTH / 2]} />
        <mesh material={platformMaterial} castShadow receiveShadow>
          <boxGeometry args={[width, PLATFORM_HEIGHT, DEPTH]} />
        </mesh>
        {/* A yellow edge along the top front */}
        <mesh material={trimMaterial} position={[0, PLATFORM_HEIGHT / 2 - 0.025, DEPTH / 2 + 0.005]}>
          <boxGeometry args={[width + 0.01, 0.05, 0.02]} />
        </mesh>
      </RigidBody>
      <group position={[0, PLATFORM_HEIGHT, 0]}>
        {rack.items.map(({ pick, x }) => (
          <Pedestal key={pickId(pick)} pick={pick} x={x} taken={owned(pick)}>
            {near === pedestalId(index, pick) && prompt(pick)}
          </Pedestal>
        ))}
      </group>
    </group>
  )
}
