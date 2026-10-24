import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { newHeld, setHeld, type Held } from '../../../held'
import { now } from '../ammo'
import { useAimTrigger } from '../input'
import { TouchFire } from '../TouchFire'
import { ScreenOverlay } from '../ScreenOverlay'
import { playFuse, playPin, playThrow } from '../sounds'
import { AimArc } from './AimArc'
import { newArcAim } from './arc'
import { THROWABLES, THROW_REACH, launchSpeed, lobVelocity, type ThrowKind } from './catalog'
import { HeldThrowable } from './HeldThrowable'
import { pouch, throwInHand } from './pouch'
import { explodeAt, launch } from './world'

// A throwable in the character's hand. Right mouse button (or Z) winds up to throw, showing where it'll
// land; left mouse button throws (winding up first isn't needed). The camera stays just as it is: looking
// up or down throws further or shorter. Grenade and dynamite start their
// countdown as you start aiming, shown under the aim; stop aiming and it's called off. Held until it runs
// out, it goes off in your hand.

const COOLDOWN = 0.55 // seconds before the next one comes out of the pouch
const SWING = 0.12 // seconds the arm takes to swing through a throw
const RECOVER = 0.35 // ... and to come back down after
const AIM_SPEED = 10 // how quickly the arm winds up (per second)

// Poses in the character's body space (face towards +z, its right hand on the -x side): where the right
// hand goes, carrying, wound up behind the head and at the release; the other arm points where it's
// going. The throwable sits in the mitten a little above and in front of the hand's middle.
const CARRY_HAND = new THREE.Vector3(-0.45, -0.18, 0.33)
const WINDUP_HAND = new THREE.Vector3(-0.46, 0.38, 0.02)
const RELEASE_HAND = new THREE.Vector3(-0.2, 0.05, 0.5)
const POINT_HAND = new THREE.Vector3(0.28, 0.22, 0.5)
const IN_MITTEN = new THREE.Vector3(0, 0.1, 0.06)
const WINDUP_TWIST = -0.45 // the throwing shoulder turns back...
const FOLLOW_TWIST = 0.3 // ...and comes round through the throw

const MARKER_COLORS: Record<ThrowKind, string> = { grenade: '#ff5a4a', dynamite: '#ff5a4a', molotov: '#ff9f2e', smoke: '#e4e8ee' }
const RING_R = 15
const RING_C = 2 * Math.PI * RING_R

const lerp = THREE.MathUtils.lerp
const damp = (current: number, target: number, rate: number, dt: number) => lerp(current, target, 1 - Math.exp(-rate * dt))
const hand = new THREE.Vector3()
const look = new THREE.Vector3()
const tilt = new THREE.Euler()
const at = new THREE.Vector3()
const turned = new THREE.Quaternion()
const size = new THREE.Vector3()
const vel = new THREE.Vector3()

export function Throwing({ kind }: { kind: ThrowKind }) {
  const spec = THROWABLES[kind]
  const physics = useRapier()
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)
  const state = useRef({
    aiming: false,
    toggled: false,
    trigger: false,
    fresh: false,
    pose: 0, // 0 carried .. 1 wound up
    armed: false, // the countdown is running
    fuse: 0, // seconds left on it
    thrownAt: -Infinity,
    stopFuse: null as (() => void) | null,
  })
  const held = useRef<Held | null>(null)
  const rightHand = useRef(new THREE.Vector3())
  const leftHand = useRef(new THREE.Vector3())
  const arc = useRef(newArcAim())
  const countdown = useRef<HTMLDivElement>(null)
  const countdownRing = useRef<SVGCircleElement>(null)
  const countdownText = useRef<HTMLSpanElement>(null)

  useAimTrigger(canvas, state)

  useEffect(() => {
    throwInHand.kind = kind
    const live = throwInHand.live
    live.armed = live.spent = live.lit = false
    live.burn = 1
    throwInHand.show = 0
    throwInHand.ready = false
    const h = newHeld(HeldThrowable)
    held.current = h
    setHeld(h)
    const s = state.current
    return () => {
      held.current = null
      setHeld(null)
      // Put away while lit: the fuse goes out
      s.stopFuse?.()
      s.stopFuse = null
      s.armed = false
    }
  }, [kind])

  // How fast which way it leaves the hand: lofted above where the camera looks, fast enough to reach THROW_REACH
  const throwVelocity = (out: THREE.Vector3) => {
    camera.getWorldDirection(look)
    return lobVelocity(look, launchSpeed(THROW_REACH, Math.abs(physics.world.gravity.y) || 20), out)
  }

  useFrame((_, dt) => {
    const h = held.current
    if (!h) return
    const s = state.current
    const live = throwInHand.live
    const time = now()
    const since = time - s.thrownAt
    const ready = pouch.get().counts[kind] > 0 && since > COOLDOWN
    throwInHand.show = ready ? Math.min(1, throwInHand.show + dt * 7) : 0
    throwInHand.matrix.decompose(at, turned, size)

    const disarm = () => {
      s.armed = false
      live.armed = false
      live.burn = 1
      s.stopFuse?.()
      s.stopFuse = null
    }

    // Winding up to throw starts the countdown (the pin comes out, the fuse is lit); stopping calls it off
    if (spec.fuse !== null && ready && s.aiming && !s.armed) {
      s.armed = true
      s.fuse = spec.fuse
      live.armed = true
      if (kind === 'dynamite') s.stopFuse = playFuse()
      else playPin()
    }
    if (s.armed && !s.aiming) disarm()
    live.lit = kind === 'dynamite' ? s.armed : kind === 'molotov' && ready && s.aiming
    if (s.armed) {
      s.fuse -= dt
      live.burn = Math.max(0, s.fuse / spec.fuse!)
      if (s.fuse <= 0) {
        // Held too long: it goes off in the hand
        disarm()
        explodeAt(kind, at)
        pouch.use(kind)
        s.thrownAt = time
        throwInHand.show = 0
      }
    }

    // Left mouse button: throw it
    if (s.fresh) {
      s.fresh = false
      if (ready && throwInHand.ready) {
        const fuse = spec.fuse !== null ? (s.armed ? s.fuse : spec.fuse) : (spec.pop ?? null)
        launch(
          kind,
          at,
          throwVelocity(vel),
          fuse,
          { armed: true, spent: true, lit: kind === 'dynamite' || kind === 'molotov', burn: spec.fuse && fuse ? fuse / spec.fuse : 1 },
          turned,
          kind === 'dynamite' ? playFuse() : null,
        )
        if (!s.armed && kind !== 'molotov' && kind !== 'dynamite') playPin()
        disarm()
        live.lit = false
        pouch.use(kind)
        s.thrownAt = time
        throwInHand.show = 0
        playThrow()
        // (Wound up with the on-screen Aim button: thrown, that's done with, so the next isn't lit straight away)
        if (s.toggled) s.toggled = s.aiming = false
      }
    }

    // The arm: carried, wound up while aiming, swinging through a throw and coming back down
    const since2 = time - s.thrownAt
    s.pose = damp(s.pose, ready && s.aiming ? 1 : 0, AIM_SPEED, dt)
    const swing = since2 < SWING ? since2 / SWING : since2 < SWING + RECOVER ? 1 - (since2 - SWING) / RECOVER : 0
    hand.lerpVectors(CARRY_HAND, WINDUP_HAND, s.pose).lerp(RELEASE_HAND, swing)
    h.right = rightHand.current.copy(hand)
    h.position.copy(hand).add(IN_MITTEN)
    h.quaternion.setFromEuler(tilt.set(-0.5 * s.pose, 0, 0))
    h.left = s.pose > 0.3 || swing > 0.3 ? leftHand.current.copy(POINT_HAND) : null
    h.twist = lerp(WINDUP_TWIST * s.pose, FOLLOW_TWIST, swing)
    h.lookAround = -h.twist
    camera.getWorldDirection(look)
    h.yaw = s.pose > 0.05 || swing > 0 ? Math.atan2(look.x, look.z) : null

    // Where it'll go, from the hand
    const a = arc.current
    a.show = s.pose > 0.5 && ready && throwInHand.ready
    if (a.show) {
      a.from.copy(at)
      throwVelocity(a.vel)
      a.reach = spec.reach
    }

    // The countdown, under the aim: seconds left, and a ring running down, red at the end
    const box = countdown.current
    if (box) {
      box.style.display = s.armed ? 'flex' : 'none'
      if (s.armed && spec.fuse) {
        const urgent = s.fuse < 1.5
        countdownText.current!.textContent = Math.max(0, s.fuse).toFixed(1)
        countdownText.current!.style.color = urgent ? '#ff5a4a' : '#ffffff'
        countdownRing.current!.style.strokeDashoffset = String(RING_C * (1 - s.fuse / spec.fuse))
        countdownRing.current!.style.stroke = urgent ? '#ff5a4a' : '#ffffff'
      }
    }
  })

  const ringSize = RING_R * 2 + 8
  return (
    <>
      <AimArc aim={arc} color={MARKER_COLORS[kind]} />
      <ScreenOverlay zIndexRange={[4, 0]}>
        <div
          ref={countdown}
          style={{
            position: 'absolute',
            left: '50%',
            top: 'calc(50% + 34px)',
            transform: 'translateX(-50%)',
            display: 'none',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px 3px 4px',
            borderRadius: 99,
            background: 'rgba(20, 22, 30, 0.6)',
          }}
        >
          <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={4} />
            <circle
              ref={countdownRing}
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={RING_R}
              fill="none"
              stroke="#ffffff"
              strokeWidth={4}
              strokeDasharray={RING_C}
              strokeDashoffset={0}
            />
          </svg>
          <span
            ref={countdownText}
            style={{ font: "900 italic 20px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif", color: '#fff', textShadow: '0 2px 0 rgba(0,0,0,0.45)', minWidth: 38 }}
          />
        </div>
        <TouchFire state={state} throwable />
      </ScreenOverlay>
    </>
  )
}
