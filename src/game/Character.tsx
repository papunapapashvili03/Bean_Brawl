import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Accessories } from './Accessories'
import type { GrabKind } from './grab'
import { useHeld, type Held } from './held'
import { Outlined } from './Outlined'
import type { Outfit } from './outfit'
import type { Vec3 } from './playerContact'
import { BOTTOM, TOP, ink, onFace, toon } from './toon'

// Where the hands hold on while hanging, in world space
export type HangPose = {
  kind: GrabKind
  hands: [Vec3, Vec3] // grip points, ordered along the edge direction (tx, tz)
  tx: number
  tz: number
  yaw: number // facing
  shimmy: number // -1..1, sideways input along the edge
}

// Written by the Player every frame; read here to drive facing and animation.
export type CharacterMotion = {
  vx: number
  vz: number
  grounded: boolean
  hang: HangPose | null
  grabs: number // counts catches, so the character can react to each new one
  jolt: number // 0..1, how hard the last catch was
  crouch?: number // 0..1, how far into a crouch
  roll?: boolean // rolling along on its side
}

const BODY_COLOR = '#ff6b35'

function buildBodyGeometry() {
  const points: THREE.Vector2[] = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * (Math.PI / 2)
    points.push(new THREE.Vector2(BOTTOM.rx * Math.cos(t), BOTTOM.y + BOTTOM.ry * Math.sin(t)))
  }
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2)
    points.push(new THREE.Vector2(TOP.rx * Math.cos(t), TOP.y + TOP.ry * Math.sin(t)))
  }
  points[0].x = 0.0001 // close the poles without a degenerate seam
  points[points.length - 1].x = 0.0001
  return new THREE.LatheGeometry(points, 40)
}


const bodyGeometry = buildBodyGeometry()
const limbGeometry = new THREE.CapsuleGeometry(0.1, 0.2, 6, 12)
const handGeometry = new THREE.SphereGeometry(0.13, 16, 12)
const thumbGeometry = new THREE.SphereGeometry(0.055, 10, 8)
const fingerGeometry = new THREE.CapsuleGeometry(0.036, 0.05, 4, 8)
const legGeometry = new THREE.CapsuleGeometry(0.11, 0.16, 6, 12)
const footGeometry = new THREE.SphereGeometry(1, 18, 12)
const eyeGeometry = new THREE.SphereGeometry(1, 16, 12)
const browGeometry = new THREE.CapsuleGeometry(0.017, 0.075, 4, 8)
const mouthGeometry = new THREE.TorusGeometry(0.075, 0.017, 6, 16, Math.PI * 0.5)

// Arms hang along the pivot's local -y, so any pose is one rotation plus a stretch.
// At rest they angle out from the body by ARM_SPLAY; reaching up for a grip they stretch like noodles.
const ARM_LENGTH = 0.336 // shoulder to hand centre
const ARM_SPLAY = Math.atan2(0.15, 0.3)
const SHOULDER_REST = new THREE.Vector3(0.43, 0.05, 0)
const SHOULDER_REACH = new THREE.Vector3(0.34, 0.42, 0.06) // shrugged up and forward while hanging
const SHOULDER_HOLD = new THREE.Vector3(0.38, 0.06, 0.2) // rolled forward to hold something in front
const THUMB_REST = new THREE.Vector3(-0.018, 0.076, 0.1)
const THUMB_GRIP = new THREE.Vector3(-0.085, -0.06, 0.07) // tucked under the edge from the inside
const FINGERS = [-1, 0, 1]

// Crouching, the bean sinks down onto its feet (which hide under it) and leans in a little; held items stay level
const CROUCH_DROP = 0.28
const CROUCH_LEAN = 0.18
const CROUCH_KNEES = 0.25 // legs slant forward, feet ahead
// Stride rate per metre travelled: shorter, quicker steps crouching
const CADENCE = { stand: 2.2, crouch: 3.2 }

// Rolling, the bean tips over onto its side (about its middle, which comes down to lie its widest part on the
// ground) and turns about its own length like a log, legs and arms tucked in
const ROLL_MID = (BOTTOM.y - BOTTOM.ry + TOP.y + TOP.ry) / 2
const ROLL_RADIUS = BOTTOM.rx
const ROLL_DROP = ROLL_MID + 1 - ROLL_RADIUS

type ArmRig = {
  pivot: THREE.Group | null
  limb: THREE.Group | null
  hand: THREE.Group | null
  thumb: THREE.Group | null
  fingers: THREE.Group | null
}

function Arm({ side, rig, skin }: { side: 1 | -1; rig: RefObject<ArmRig>; skin: THREE.Material }) {
  const bind = (part: keyof ArmRig) => (g: THREE.Group | null) => {
    rig.current[part] = g
  }
  return (
    <group ref={bind('pivot')} position={[side * SHOULDER_REST.x, SHOULDER_REST.y, 0]}>
      <group ref={bind('limb')}>
        <Outlined material={skin} geometry={limbGeometry} position={[0, -0.157, 0]} />
      </group>
      <group ref={bind('hand')} position={[0, -ARM_LENGTH, 0.02]}>
        <Outlined material={skin} geometry={handGeometry} />
        <group ref={bind('thumb')} position={[side * THUMB_REST.x, THUMB_REST.y, THUMB_REST.z]}>
          <Outlined material={skin} geometry={thumbGeometry} />
        </group>
        {/* Grip: three stubby fingers that roll out of the mitten and curl over whatever it holds */}
        <group ref={bind('fingers')} position={[0, 0.03, 0.08]} scale={0}>
          {FINGERS.map((i) => (
            <Outlined
              key={i}
              material={skin}
              geometry={fingerGeometry}
              position={[i * 0.068, 0, 0.02 - Math.abs(i) * 0.015]}
              rotation={[Math.PI / 2 + 0.95, 0, -i * 0.12]}
            />
          ))}
        </group>
      </group>
    </group>
  )
}

function Leg({ side, pivot, skin }: { side: 1 | -1; pivot: RefObject<THREE.Group | null>; skin: THREE.Material }) {
  return (
    <group ref={pivot} position={[side * 0.2, -0.52, 0]}>
      <Outlined material={skin} geometry={legGeometry} position={[0, -0.2, 0]} />
      <Outlined material={skin} geometry={footGeometry} position={[0, -0.4, 0.06]} scale={[0.14, 0.085, 0.2]} />
    </group>
  )
}

function Face() {
  const eyeL = onFace(-0.14, 0.44)
  const eyeR = onFace(0.14, 0.44)
  const browL = onFace(-0.15, 0.6, 0.006)
  const browR = onFace(0.15, 0.6, 0.006)
  const mouth = onFace(0, 0.34, 0)
  return (
    <>
      {[eyeL, eyeR].map((e, i) => (
        <mesh
          key={i}
          geometry={eyeGeometry}
          material={ink}
          position={e.position}
          rotation={[0, e.yaw, 0]}
          scale={[0.058, 0.075, 0.03]}
        />
      ))}
      {[
        // Outer ends slightly lower: a friendly look (the reverse reads as angry)
        { f: browL, tilt: 0.15 },
        { f: browR, tilt: -0.15 },
      ].map(({ f, tilt }, i) => (
        <mesh
          key={i}
          geometry={browGeometry}
          material={ink}
          position={f.position}
          rotation={[0, f.yaw, Math.PI / 2 + tilt]}
        />
      ))}
      {/* Small curved line mouth: a shallow torus arc along the bottom */}
      <mesh geometry={mouthGeometry} material={ink} position={mouth.position} rotation={[0, 0, Math.PI * 1.25]} />
    </>
  )
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt))

function dampAngle(current: number, target: number, rate: number, dt: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * (1 - Math.exp(-rate * dt))
}

// Scratch objects for the arm solve
const DOWN = new THREE.Vector3(0, -1, 0)
const restEuler = new THREE.Euler()
const restQ = new THREE.Quaternion()
const reachQ = new THREE.Quaternion()
const handQ = new THREE.Quaternion()
const IDENTITY = new THREE.Quaternion()
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const spin = new THREE.Quaternion()
const level = new THREE.Quaternion()
const shoulder = new THREE.Vector3()
const reach = new THREE.Vector3()
const aim = new THREE.Vector3()
const newRig = (): ArmRig => ({ pivot: null, limb: null, hand: null, thumb: null, fingers: null })

// `color` is the body colour. Only the player (`isPlayer`) wears the Wardrobe outfit and holds what's in its
// hands (../held); other characters (training dummies, bots) are plain beans, holding `held` if given.
export function Character({
  motion,
  color = BODY_COLOR,
  isPlayer = true,
  held: holding,
  outfit,
}: {
  motion: RefObject<CharacterMotion>
  color?: string
  isPlayer?: boolean
  held?: Held | null
  outfit?: Outfit // what it's wearing, if it isn't the player (who wears the Wardrobe's outfit)
}) {
  const skin = toon(color)
  const root = useRef<THREE.Group>(null)
  const rollPivot = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const armL = useRef<ArmRig>(newRig())
  const armR = useRef<ArmRig>(newRig())
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const holdFrame = useRef<THREE.Group>(null)
  const heldItem = useRef<THREE.Group>(null)
  const face = useRef<THREE.Group>(null)
  const inHands = useHeld()
  const held = holding !== undefined ? holding : isPlayer ? inHands : null
  const anim = useRef({
    yaw: 0,
    phase: 0,
    walk: 0,
    air: 0,
    hang: 0, // 0..1 blend into the hanging pose
    grabs: 0,
    sway: 0, // pendulum swing after a catch
    swayVel: 0,
    shimmyPhase: 0,
    // Last hand targets in body space, held while the arms relax after letting go
    reach: [new THREE.Vector3(-0.3, 0.9, 0.3), new THREE.Vector3(0.3, 0.9, 0.3)],
    // Holding an item: per-arm blend (0..1) and the last grip point in body space, so an arm can
    // relax smoothly after letting go
    holdArms: [0, 0],
    twist: 0, // the bean turned on its legs, following the held item's pose
    lookAround: 0, // the face slid round the bean
    holdTargets: [new THREE.Vector3(-0.3, 0, 0.45), new THREE.Vector3(0.3, 0, 0.45)],
    roll: 0, // 0..1 blend onto its side
    rollAngle: 0, // how far it has turned about its own length
  })

  useFrame((state, dt) => {
    const m = motion.current
    const { vx, vz, grounded, hang } = m
    const a = anim.current
    const speed = Math.hypot(vx, vz)

    // Rolling: onto its side, turning as far as it travels (unwinding to a whole turn as it comes up, so it
    // faces the way it was going)
    const rolling = !!m.roll && !hang
    a.roll = damp(a.roll, rolling ? 1 : 0, rolling ? 16 : 9, dt)
    if (rolling) a.rollAngle += (speed * dt * a.roll) / ROLL_RADIUS
    else a.rollAngle = damp(a.rollAngle, Math.round(a.rollAngle / (Math.PI * 2)) * Math.PI * 2, 10, dt)
    const rp = rollPivot.current!
    rp.quaternion.setFromAxisAngle(Z_AXIS, (Math.PI / 2) * a.roll).multiply(spin.setFromAxisAngle(Y_AXIS, -a.rollAngle))
    rp.position.y = ROLL_MID - ROLL_DROP * a.roll
    const upright = 1 - a.roll

    const heldYaw = held && !hang && !rolling ? held.yaw : null
    if (hang) a.yaw = hang.yaw
    else if (heldYaw !== null) a.yaw = heldYaw // e.g. aiming: face where the item says
    else if (speed > 0.1) a.yaw = Math.atan2(vx, vz)
    root.current!.rotation.y = dampAngle(root.current!.rotation.y, a.yaw, hang || heldYaw !== null ? 24 : 14, dt)

    a.walk = damp(a.walk, speed > 0.1 && grounded ? 1 : 0, 10, dt)
    a.air = damp(a.air, grounded || hang ? 0 : 1, 12, dt)
    a.hang = damp(a.hang, hang ? 1 : 0, hang ? 24 : 9, dt) // snap in fast, like a reflex; relax slower
    const crouch = m.crouch ?? 0
    const lerp = THREE.MathUtils.lerp
    a.phase += dt * speed * lerp(CADENCE.stand, CADENCE.crouch, crouch)
    const swing = Math.sin(a.phase) * a.walk
    const breathe = Math.sin(state.clock.elapsedTime * 2.5) * 0.015 * (1 - a.walk) * (1 - a.air) * (1 - a.hang)

    // Catching an edge sets the body swinging like a pendulum, harder the faster you came in
    if (m.grabs !== a.grabs) {
      a.grabs = m.grabs
      a.swayVel += 4.5 * m.jolt
    }
    a.swayVel += (-a.sway * 45 - a.swayVel * 3.5) * dt
    a.sway += a.swayVel * dt
    const shimmy = hang ? hang.shimmy : 0
    const shuffle = Math.min(1, Math.abs(shimmy) * 2)
    a.shimmyPhase += dt * Math.abs(shimmy) * 9

    const b = body.current!
    const bob = Math.abs(Math.sin(a.phase)) * 0.06 * a.walk * (1 - 0.5 * crouch) * upright
    b.position.y = bob - CROUCH_DROP * crouch
    b.rotation.x = (0.12 * a.walk + CROUCH_LEAN * crouch) * upright + (a.sway * 0.25 - 0.06) * a.hang
    b.rotation.z = Math.sin(a.shimmyPhase) * 0.06 * shuffle * a.hang
    // A held item can turn the bean on its legs and slide the face round it (e.g. a side-on aiming stance)
    const keepPose = held && a.hang < 0.5
    a.twist = damp(a.twist, keepPose ? held.twist : 0, 14, dt)
    a.lookAround = damp(a.lookAround, keepPose ? held.lookAround : 0, 14, dt)
    b.rotation.y = a.twist
    face.current!.rotation.y = a.lookAround
    const hangStretch = 0.04 * a.hang // hanging weight pulls the bean a little longer
    b.scale.set(1 - breathe * 0.5, 1 + breathe + hangStretch, 1 - breathe * 0.5)

    // Legs dangle and swing under a hang, kicking along while shimmying. Crouching, they slant forward and
    // apart with shorter steps.
    const kick = Math.sin(a.shimmyPhase) * 0.35 * shuffle
    const step = swing * 0.7 * (1 - 0.4 * crouch)
    const standL = step - 0.45 * a.air - CROUCH_KNEES * crouch
    const standR = -step + 0.25 * a.air - CROUCH_KNEES * crouch
    legL.current!.rotation.x = lerp(standL, a.sway * 0.6 + kick, a.hang)
    legR.current!.rotation.x = lerp(standR, a.sway * 0.6 - kick, a.hang)
    const splay = 0.15 * crouch
    legL.current!.rotation.z = -splay
    legR.current!.rotation.z = splay
    legL.current!.scale.setScalar(1 - 0.85 * a.roll)
    legR.current!.scale.setScalar(1 - 0.85 * a.roll)

    // A held item rides the body, swaying gently with the stride; it's put away while hanging
    const hf = holdFrame.current!
    hf.visible = !!held && a.hang < 0.5 && a.roll < 0.3
    if (held) {
      heldItem.current?.position.copy(held.position)
      heldItem.current?.quaternion.copy(held.quaternion)
    }
    hf.rotation.z = Math.sin(a.phase) * 0.035 * a.walk
    // It stays level as the bean leans into a crouch
    const tilt = CROUCH_LEAN * crouch
    hf.rotation.x = -tilt
    hf.updateMatrix()
    level.setFromAxisAngle(X_AXIS, -tilt)

    // Arms: blend the walk/air pose into a reach towards the grip points (a ledge, or a held item)
    b.updateWorldMatrix(true, false)
    const rigs = [armL.current, armR.current]
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const r = rigs[i]
      const target = a.reach[i]
      if (hang) {
        // Pick the grip point on this arm's side: compare the edge direction with the body's right (+x)
        const rightDot = hang.tx * Math.cos(hang.yaw) - hang.tz * Math.sin(hang.yaw)
        const p = hang.hands[side > 0 === rightDot > 0 ? 1 : 0]
        // Hand over hand while shimmying: each hand lifts and steps in turn
        const beat = a.shimmyPhase + (side * Math.PI) / 2
        const step = Math.sin(beat) * 0.07 * shuffle
        const lift = Math.max(0, Math.cos(beat)) * 0.07 * shuffle
        target.set(p.x + hang.tx * step, p.y + lift, p.z + hang.tz * step)
        b.worldToLocal(target)
      }
      // Holding: the character's right hand is on the -x side. Grip points come in the hold frame's space.
      const grip = held ? (side < 0 ? held.right : held.left) : null
      if (grip) a.holdTargets[i].copy(grip).applyMatrix4(hf.matrix)
      a.holdArms[i] = damp(a.holdArms[i], grip && a.hang < 0.5 && !rolling ? 1 : 0, 14, dt)
      const hold = a.holdArms[i] * (1 - a.hang)
      const holding = hold > a.hang
      const w = Math.max(a.hang, hold) // how far this arm is posed towards its target

      shoulder.copy(SHOULDER_REST).lerp(SHOULDER_REACH, a.hang).lerp(SHOULDER_HOLD, hold)
      shoulder.x *= side
      r.pivot!.position.copy(shoulder)
      reach.subVectors(holding ? a.holdTargets[i] : target, shoulder)
      const len = reach.length()
      reachQ.setFromUnitVectors(DOWN, aim.copy(reach).divideScalar(len || 1))
      restEuler.set(side * swing * 0.8, 0, side * (ARM_SPLAY + 0.15 + 1.9 * a.air))
      restQ.setFromEuler(restEuler)
      r.pivot!.quaternion.slerpQuaternions(restQ, reachQ, w)
      r.pivot!.scale.setScalar(1 - 0.7 * a.roll) // tucked in while rolling

      // Hanging arms stretch like noodles to reach a ledge; holding keeps them close to their real length
      const fit = holding ? THREE.MathUtils.clamp(len / ARM_LENGTH, 0.75, 1.2) : THREE.MathUtils.clamp(len / ARM_LENGTH, 0.7, 2.4)
      const stretch = THREE.MathUtils.lerp(1, fit, w)
      const thin = 1 / Math.pow(stretch, 0.3) // noodle arms get a bit thinner as they stretch
      r.limb!.scale.set(thin, stretch, thin)
      r.hand!.position.y = -ARM_LENGTH * stretch

      // Gripping, the mitten lines up with the body (palm down, fingers forward) rather than the arm,
      // squashes onto the edge, rolls its fingers out over it and tucks the thumb underneath. Crouching, it
      // stays level, like what it holds.
      handQ.copy(r.pivot!.quaternion).invert().multiply(level)
      r.hand!.quaternion.slerpQuaternions(IDENTITY, handQ, w)
      r.hand!.scale.set(1 + 0.06 * w, 1 - 0.12 * w, 1 + 0.08 * w)
      r.fingers!.scale.setScalar(w)
      r.thumb!.position.lerpVectors(THUMB_REST, THUMB_GRIP, w)
      r.thumb!.position.x *= side
    }
  })

  return (
    <group ref={root}>
      {/* Tips over about the bean's middle to roll */}
      <group ref={rollPivot} position={[0, ROLL_MID, 0]}>
        <group position={[0, -ROLL_MID, 0]}>
          <Leg side={-1} pivot={legL} skin={skin} />
          <Leg side={1} pivot={legR} skin={skin} />
          {/* Turned on its legs (twist) before leaning, so a held item can be kept level whichever way it's turned */}
          <group ref={body} rotation={[0, 0, 0, 'YXZ']}>
            <Outlined material={skin} geometry={bodyGeometry} />
            {/* The face and anything worn on the head can slide round the bean together */}
            <group ref={face}>
              <Face />
              {(isPlayer || outfit) && <Accessories part="head" outfit={outfit} />}
            </group>
            {(isPlayer || outfit) && <Accessories part="back" outfit={outfit} />}
            <Arm side={-1} rig={armL} skin={skin} />
            <Arm side={1} rig={armR} skin={skin} />
            <group ref={holdFrame}>
              {held && (
                <group ref={heldItem}>
                  <held.Item />
                </group>
              )}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
