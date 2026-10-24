import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { Character, type CharacterMotion } from './Character'
import type { ControlName } from './controls'
import { getHeld } from './held'
import { devZoomScale } from './devZoom'
import { setActivePlayer, type Stance } from './playerContact'
import { STANCES, STANCE_RATE, createRunner, damp, knockRunner, restingMotion, stepRunner, type PlayerRules, type Runner, type RunnerInput } from './runner'
import { touch } from './touch/touch'

// The player: a runner's body (./runner) told what to do by the keyboard (or, on a phone or tablet, the
// on-screen controls: ./touch), with the camera following it. Input is relative to the camera: W runs away
// from it, whichever way it faces.

export type { PlayerRules }

// Pass to <Physics updatePriority>. Stepping physics before the player's frame callback (priority 0)
// guarantees the camera reads this frame's interpolated position. Negative keeps r3f's auto-render on.
export const PHYSICS_PRIORITY = -1

const LOOK_OFFSET = new THREE.Vector3(0, 1, 0)
const CAMERA_FLOOR = 0.3 // the camera stays this far above the feet: looking up from low down, it comes in closer

// Orbit camera. Yaw 0 looks down -z; the default distance and pitch put the camera 5 up and 9 back.
const CAMERA_DISTANCE = Math.hypot(5, 9)
const DEFAULT_PITCH = Math.atan2(5, 9)
const PITCH_MIN = 0.12
const PITCH_MAX = 1.25
const DRAG_YAW = 0.005 // radians per pixel of mouse drag
const DRAG_PITCH = 0.004
const KEY_TURN_SPEED = 2.2 // radians per second while Q/E is held
const TOUCH_TURN = 1.4 // a finger dragged across the screen turns the view this much more than the mouse
// A held item (e.g. a gun) may let the camera look further up than usual
const pitchMin = () => Math.min(PITCH_MIN, getHeld()?.cameraPitchMin ?? PITCH_MIN)

// Reused every frame to avoid allocating new objects
const UP = new THREE.Vector3(0, 1, 0)
const direction = new THREE.Vector3()
const cameraOffset = new THREE.Vector3()
const targetCamPos = new THREE.Vector3()
const lookAt = new THREE.Vector3()
const cameraRight = new THREE.Vector3()
const renderedPos = new THREE.Vector3()
const cameraDir = new THREE.Vector3()
const CAMERA_PAD = 0.3 // how far in front of a wall the camera stops
const input: RunnerInput = { x: 0, z: 0, jump: false, drop: false, crouchHeld: false, crouchPressed: false }

type Orbit = { yaw: number; pitch: number }

// Turns the camera for a drag of (dx, dy) pixels
function turn(o: Orbit, dx: number, dy: number) {
  // Through a scope the view is magnified, so the same drag turns it proportionally less
  const magnify = getHeld()?.cameraMagnify ?? 1
  o.yaw -= (dx * DRAG_YAW) / magnify
  o.pitch = THREE.MathUtils.clamp(o.pitch + (dy * DRAG_PITCH) / magnify, pitchMin(), PITCH_MAX)
}

// Drag anywhere on the canvas (left or right button, or a finger) to orbit the camera
function useOrbitDrag(orbit: { current: Orbit }) {
  const canvas = useThree((s) => s.gl.domElement)
  useEffect(() => {
    // What's dragging (the mouse, or the first finger down on the view) and where it was
    let drag: { id: number; x: number; y: number; finger: boolean } | null = null
    const down = (e: PointerEvent) => {
      if (drag || (e.button !== 0 && e.button !== 2)) return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, finger: e.pointerType !== 'mouse' }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return
      // (The mouse says how far it's moved; a finger, where it's got to)
      if (drag.finger) turn(orbit.current, (e.clientX - drag.x) * TOUCH_TURN, (e.clientY - drag.y) * TOUCH_TURN)
      else turn(orbit.current, e.movementX, e.movementY)
      drag.x = e.clientX
      drag.y = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null
    }
    const noMenu = (e: Event) => e.preventDefault()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('contextmenu', noMenu)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('contextmenu', noMenu)
    }
  }, [canvas, orbit])
}

export function Player({ spawn = [0, 3, 0], rules }: { spawn?: [number, number, number]; rules?: PlayerRules }) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const visual = useRef<THREE.Group>(null)
  const motion = useRef<CharacterMotion>(restingMotion())
  const runner = useRef<Runner | null>(null)
  // The crouch key (C) toggles on a press, caught as it happens (a quick tap can come and go between frames)
  const crouchPressed = useRef(false)
  const rollLook = useRef(0) // eases the camera down while rolling
  // Each stance gets a capsule of its own: reshaping one while it rests on the floor would leave its contact
  // with the floor where the old shape touched it, and the body would be held up off the ground
  const [capsule, setCapsule] = useState<Stance>('stand')
  const [subscribeKeys, getKeys] = useKeyboardControls<ControlName>()
  const physics = useRapier()
  const { rapier, world } = physics
  const cameraRay = useRef<InstanceType<typeof rapier.Ray>>(null)
  const orbit = useRef({ yaw: rules?.cameraYaw ?? 0, pitch: DEFAULT_PITCH })
  const baseFov = useRef<number | null>(null)
  useOrbitDrag(orbit)

  useEffect(
    () =>
      subscribeKeys(
        (keys) => keys.crouch,
        (down) => {
          if (down) crouchPressed.current = true
        },
      ),
    [subscribeKeys],
  )

  useEffect(() => {
    const rb = body.current!
    const r = (runner.current ??= createRunner(motion))
    return setActivePlayer({
      handle: rb.handle,
      position: () => rb.translation(),
      velocity: () => rb.linvel(),
      posture: () => r.posture,
      motion: () => motion.current,
      knock: (v) => knockRunner(r, v),
    })
  }, [])

  useFrame((state, delta) => {
    const rb = body.current
    if (!rb) return
    const { forward, back, left, right, jump, drop, crouch, camLeft, camRight } = getKeys()
    const o = orbit.current
    o.yaw += (Number(camLeft) - Number(camRight)) * KEY_TURN_SPEED * delta
    // (Turned from an on-screen button too, e.g. dragging Shoot)
    if (touch.lookX || touch.lookY) {
      turn(o, touch.lookX * TOUCH_TURN, touch.lookY * TOUCH_TURN)
      touch.lookX = touch.lookY = 0
    }

    // 1, 2. The body does what the keys, or the on-screen controls, say (./runner). The stick can be pushed
    // part way, for a walk.
    direction.set(Number(right) - Number(left) + touch.x, 0, Number(back) - Number(forward) - touch.y)
    const push = direction.length()
    if (push > 1) direction.divideScalar(push)
    if (push > 0) direction.applyAxisAngle(UP, o.yaw)
    input.x = direction.x
    input.z = direction.z
    input.jump = jump || touch.jump
    input.drop = drop || touch.drop
    input.crouchHeld = crouch || touch.crouchHeld
    input.crouchPressed = crouchPressed.current || touch.crouchPressed
    crouchPressed.current = false
    touch.crouchPressed = false
    const r = (runner.current ??= createRunner(motion))
    stepRunner(r, { rb, collider: collider.current, physics, rules, spawn, setCapsule }, input, delta)
    const ps = r.posture

    // 3. Follow camera: smoothly move behind the player, look at them.
    // Track the drawn mesh, not rb.translation(): physics steps at a fixed 60Hz and Rapier draws bodies
    // interpolated between steps, so the raw position jumps while the mesh glides, which makes the view shake.
    const shown = visual.current!.getWorldPosition(renderedPos)
    // A held item can ask for a closer, over-the-shoulder view (e.g. while aiming)
    const held = getHeld()
    // Put the item away while looking up past the usual limit: ease back down to it
    const minPitch = pitchMin()
    if (o.pitch < minPitch) o.pitch = THREE.MathUtils.lerp(o.pitch, minPitch, 1 - Math.exp(-6 * delta))
    const zoom = held?.cameraZoom ?? 1
    // Dev zoom (./devZoom) pulls the camera out further still
    const devScale = devZoomScale()
    const shift = held?.cameraShift ?? 0
    cameraRight.set(Math.cos(o.yaw), 0, -Math.sin(o.yaw)).multiplyScalar(shift)
    // The camera sits on a line out from the look point (just above the head); zooming slides it along that
    // line, so the view keeps its angle, all the way up to eye level (a scope). Crouching brings the look point
    // (and the whole view) down with the head.
    rollLook.current = damp(rollLook.current, ps.stance === 'roll' ? 1 : 0, STANCE_RATE, delta)
    ps.lookHeight = THREE.MathUtils.lerp(THREE.MathUtils.lerp(STANCES.stand.look, STANCES.crouch.look, ps.crouch), STANCES.roll.look, rollLook.current)
    lookAt.copy(shown).add(cameraRight)
    lookAt.y += ps.lookHeight
    cameraOffset
      .set(0, CAMERA_DISTANCE * Math.sin(o.pitch), CAMERA_DISTANCE * Math.cos(o.pitch))
      .sub(LOOK_OFFSET)
      .multiplyScalar(zoom * devScale)
      .applyAxisAngle(UP, o.yaw)
    targetCamPos.copy(lookAt).add(cameraOffset)
    // Looking up from low down (e.g. with a gun) would put the camera under the floor: it comes in closer along
    // its line instead
    const floorY = shown.y - 1 + CAMERA_FLOOR
    if (targetCamPos.y < floorY && lookAt.y > floorY) {
      targetCamPos.lerpVectors(lookAt, targetCamPos, (lookAt.y - floorY) / (lookAt.y - targetCamPos.y))
    }
    // Something solid in the way (walls, ceilings, not loose things): the camera comes in to just in front of
    // it (unless dev zoom has it out past the usual distance)
    let blocked = false
    if (rules?.cameraCollides && devScale <= 1) {
      const flags = rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC
      const ray = (cameraRay.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }))
      // Under a ceiling, the camera keeps just below it (rather than sliding in close along its line)
      if (targetCamPos.y > lookAt.y) {
        ray.origin = { x: lookAt.x, y: lookAt.y, z: lookAt.z }
        ray.dir = { x: 0, y: 1, z: 0 }
        const ceiling = world.castRay(ray, targetCamPos.y - lookAt.y + CAMERA_PAD, true, flags, undefined, undefined, rb)
        const under = lookAt.y + (ceiling?.timeOfImpact ?? Infinity) - CAMERA_PAD
        if (targetCamPos.y > under) {
          targetCamPos.y = Math.max(lookAt.y, under)
          blocked = true
        }
      }
      cameraDir.subVectors(targetCamPos, lookAt)
      const full = cameraDir.length()
      if (full > 0.01) {
        cameraDir.divideScalar(full)
        ray.origin = { x: lookAt.x, y: lookAt.y, z: lookAt.z }
        ray.dir = { x: cameraDir.x, y: cameraDir.y, z: cameraDir.z }
        const hit = world.castRay(ray, full + CAMERA_PAD, true, flags, undefined, undefined, rb)
        if (hit && hit.timeOfImpact - CAMERA_PAD < full) {
          targetCamPos.copy(lookAt).addScaledVector(cameraDir, Math.max(0.35, hit.timeOfImpact - CAMERA_PAD))
          blocked = true
        }
      }
    }
    // (Hemmed in, the camera goes straight to where it can be; out in the open it glides after you)
    if (blocked) state.camera.position.copy(targetCamPos)
    else state.camera.position.lerp(targetCamPos, 1 - Math.exp(-(held?.cameraFollow ?? 5) * delta))
    state.camera.lookAt(lookAt)
    // A scope narrows the field of view (from whatever it started as)
    const cam = state.camera as THREE.PerspectiveCamera
    baseFov.current ??= cam.fov
    const fov = baseFov.current / (held?.cameraMagnify ?? 1)
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    // Recoil kicks the view on top of where it looks
    if (held) {
      state.camera.rotateX(held.cameraKickPitch)
      state.camera.rotateY(held.cameraKickYaw)
    }
  })

  const shape = STANCES[capsule]
  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={spawn}
      enabledRotations={[false, false, false]} // stay upright
      friction={0.2}
    >
      <CapsuleCollider
        key={capsule}
        ref={collider}
        args={[shape.halfHeight, shape.radius]}
        position={[0, -1 + shape.radius + shape.halfHeight, 0]}
      />
      <group ref={visual}>
        <Character motion={motion} />
      </group>
    </RigidBody>
  )
}
