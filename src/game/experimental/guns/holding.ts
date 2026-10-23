import * as THREE from 'three'
import { GUN_SCALE } from './parts'

// How the character carries and aims each gun, in its body space (face towards +z, its right hand on the
// -x side). The bean's arms are short (0.34 from the shoulder) and its body is wide, so the hands can only
// meet an object at the front-sides of the body: every hand target here sits about one arm length from the
// shoulders, which roll forward to (±0.38, 0.06, 0.2) while holding. Aiming turns the body side-on instead
// of stretching the arms forward.

type V2 = [number, number] // a point on the gun's side outline: along the barrel (x), up (y), before GUN_SCALE

export type Pose = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  grip: THREE.Vector3 // right hand, on the gun (gun space, scaled)
  support: THREE.Vector3 | null // left hand on the gun, or null to leave it free
  twist: number // bean turned on its legs
  lookAround: number // face slid round the bean
  yawOffset: number | null // aiming: face the aim direction plus this; null: face the way you move
  // A second gun in the left hand (dual pistols): where it sits in body space and where the hand grips it
  offhand?: { position: THREE.Vector3; quaternion: THREE.Quaternion; grip: THREE.Vector3 }
}

const onGun = (p: V2) => new THREE.Vector3(p[0] * GUN_SCALE[0], p[1] * GUN_SCALE[1], 0)

function pose(q: THREE.Quaternion, hand: THREE.Vector3, grip: V2, extra: Partial<Pose> = {}): Pose {
  return {
    position: hand.clone().sub(onGun(grip).applyQuaternion(q)),
    quaternion: q,
    grip: onGun(grip),
    support: null,
    twist: 0,
    lookAround: 0,
    yawOffset: null,
    ...extra,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Carrying

// Shoulder carry (rifles, shotgun): the right hand holds the grip up by the shoulder and the gun rises
// past the right side of the head, muzzle forward and up, stock back along the side. The left arm swings free.
const CARRY_HAND = new THREE.Vector3(-0.5, 0.36, 0.14)
const CARRY_ALONG = new THREE.Vector3(0, 0.75, 0.66).normalize() // muzzle forward and up, about 50°

export function shoulderCarry(grip: V2): Pose {
  // Upright: sights up and back, grip and magazine forward and down in the hand, side facing out right
  const side = new THREE.Vector3(-1, 0, 0)
  const up = new THREE.Vector3().crossVectors(side, CARRY_ALONG)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(CARRY_ALONG, up, side))
  return pose(q, CARRY_HAND, grip)
}

// Low carry (SMGs): in the right hand at the side, pointing forward, a touch inwards (so the stock clears
// the body) and down, elbow bent.
const LOW_HAND = new THREE.Vector3(-0.4, -0.06, 0.44)
const LOW_TURN_IN = 0.35
const LOW_DIP = 0.15

export function lowCarry(grip: V2): Pose {
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 + LOW_TURN_IN)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -LOW_DIP))
  return pose(q, LOW_HAND, grip)
}

// ---------------------------------------------------------------------------------------------------------
// Aiming

// Side-on (two hands): the gun lies level across the chest, right hand on the grip, left hand on the
// handguard, both where the arms comfortably reach. The bean turns side-on on its legs so the muzzle
// points straight at the aim; the legs turn part of the way, the body the rest, and the face slides round
// towards the target so the character looks down the barrel.
const AIM_RIGHT = new THREE.Vector3(-0.3, 0.12, 0.5)
const BODY_TWIST = 1.1 // the rest of the quarter turn comes from the legs
const LOOK_ROUND = 1.0

export function sideOnAim(grip: V2, support: V2): Pose {
  const p = pose(new THREE.Quaternion(), AIM_RIGHT, grip, {
    twist: -BODY_TWIST,
    lookAround: LOOK_ROUND,
    // The gun points along the body's +x, a quarter turn from the body's front: face the aim a quarter
    // turn minus the twist
    yawOffset: -Math.PI / 2 + BODY_TWIST,
  })
  p.support = onGun(support)
  return p
}

// One-handed (short SMGs): the right arm comes forward, gun at chest height pointing ahead, turned in a
// touch; the character turns the same touch the other way so the muzzle points straight at the aim.
const AIM_ONE = new THREE.Vector3(-0.36, 0.2, 0.5)
const AIM_TURN_IN = 0.3

export function oneHandAim(grip: V2): Pose {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 + AIM_TURN_IN)
  return pose(q, AIM_ONE, grip, { yawOffset: -AIM_TURN_IN })
}

// ---------------------------------------------------------------------------------------------------------
// Pairs (dual pistols): one gun in each hand, mirrored

const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

// Pointing forward, turned in towards the middle by `turnIn` and down by `dip`, for the right (-x) or left
// (+x) hand. Right: the muzzle leans towards +x; left: towards -x.
function forwardIn(side: 1 | -1, turnIn: number, dip: number) {
  const yaw = side < 0 ? -Math.PI / 2 + turnIn : -Math.PI / 2 - turnIn
  return new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(Z, -dip))
}

function pair(right: THREE.Vector3, turnIn: number, dip: number, grip: V2, extra: Partial<Pose> = {}): Pose {
  const p = pose(forwardIn(-1, turnIn, dip), right, grip, extra)
  const q = forwardIn(1, turnIn, dip)
  const leftHand = new THREE.Vector3(-right.x, right.y, right.z)
  p.offhand = { position: leftHand.clone().sub(onGun(grip).applyQuaternion(q)), quaternion: q, grip: onGun(grip) }
  return p
}

// Carried low in both hands at the sides, pointing forward and a touch down, elbows bent
export function pairCarry(grip: V2): Pose {
  return pair(LOW_HAND, LOW_TURN_IN, LOW_DIP, grip)
}

// Aimed with both arms forward, the pistols side by side at chest height angled slightly inwards, the
// character facing the target squarely
const PAIR_AIM = new THREE.Vector3(-0.28, 0.2, 0.52)
export function pairAim(grip: V2): Pose {
  return pair(PAIR_AIM, 0.1, 0, grip, { yawOffset: 0 })
}
