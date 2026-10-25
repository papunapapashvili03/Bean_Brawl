import type { RapierRigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import type { CharacterMotion } from '../Character'
import { isHeadshot, targetFor, type Shooter, type Target } from '../experimental/combat'
import { GUNS } from '../experimental/guns/catalog'
import { addPuff, addTracer } from '../experimental/guns/fx'
import { playShot } from '../experimental/guns/sounds'
import { shooterPreset } from './difficulty'
import { within } from './presets'
import { pelletOffset } from '../experimental/guns/spread'
import type { Held } from '../held'
import { activePlayerPosition } from '../playerContact'
import { combatants, MAX_HEALTH, MAX_SHIELD, now, playerTeam, type Combatant } from './match'
import type { NavGrid } from './nav'

// What a bot thinks and does, every frame: look round for enemies (anyone on the other side it can see, in
// front of it or close by), and fight the nearest: strafe, keep to the distance its gun likes, aim (a little
// off, more so far away or on the move) and shoot. Lose sight of them and it goes to where they were last
// seen; otherwise it roams, mostly towards the other side's half. Getting shot makes it turn to look.

type Physics = ReturnType<typeof useRapier>

export type BotDef = {
  name: string
  team: string
  colour: string
  gun: number
  rank: number // 0..1: where it stands among the bots (its skill's that far up the difficulty's range)
  home: [number, number] // its side's start
  away: [number, number] // the other side's start
}

// Guns the bots carry: the rifles, SMGs and shotguns (no launchers or scopes)
export const BOT_GUNS = [0, 1, 2, 3, 4, 5, 7]

const SPEED = 5
const STRAFE_SPEED = 3.4
const JUMP_VELOCITY = 8
const SIGHT = 55 // m
const FOV = Math.cos(THREE.MathUtils.degToRad(75)) // sees this far either side of the way it faces
const HEAR = 9 // notices anyone this close, whichever way it faces
const LOOK_EVERY = 0.22 // seconds between looks round
const EYE = 0.55 // above the body centre
const DAMAGE = 0.8 // bots hit a little softer than the player
const POSE_SPEED = 10
const RANGE_SHOT = 120

// The distance a gun likes to fight at
function liked(gun: number) {
  const f = GUNS[gun].fire
  if (f.pellets) return 7
  if (f.interval <= 0.15 || f.burst) return 13
  return 20
}

const pos = new THREE.Vector3()
const aimAt = new THREE.Vector3()
const dir = new THREE.Vector3()
const side = new THREE.Vector3()
const upish = new THREE.Vector3()
const eye = new THREE.Vector3()
const muzzle = new THREE.Vector3()
const end = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
let groundRay: InstanceType<Physics['rapier']['Ray']> | null = null

export class Brain {
  readonly def: BotDef
  readonly held: Held
  readonly motion: { current: CharacterMotion } = { current: { vx: 0, vz: 0, grounded: true, hang: null, grabs: 0, jolt: 0 } }
  readonly shooter: Shooter
  // Life
  health = MAX_HEALTH
  shield = MAX_SHIELD
  down = false
  downAt = 0
  protectedUntil = 0
  // What it knows
  enemy: Combatant | null = null
  seen = false // the enemy was in sight at the last look
  reactAt = 0 // when it starts shooting at an enemy it's just seen
  lastSeen = new THREE.Vector3()
  lastSeenAt = -Infinity
  nextLook = 0
  // Getting about
  mode: 'roam' | 'fight' | 'hunt' = 'roam'
  path: number[] = []
  step = 0
  from = -1 // the node it set off from
  goal = -1
  repathAt = 0
  yaw = 0 // the way it faces (for what it can see)
  aimYaw = 0
  strafe = 1
  strafeUntil = 0
  checkAt = 0 // progress checks, to notice being stuck
  checkPos = new THREE.Vector3()
  stuck = 0
  jumpAt = 0
  // The gun
  mag: number
  reloadUntil = 0
  nextShot = 0
  burstLeft = 0
  pose = 0 // 0 carried .. 1 aimed
  fall = 0 // toppling over when eliminated: 0 standing .. 1 down
  at = new THREE.Vector3() // where it was last frame
  private right = new THREE.Vector3()
  private left = new THREE.Vector3()

  // How good it is, 0.6 (slow, wild) .. 1 (quick, steady), and how long it takes to react over and above
  // that: by the difficulty its side plays at this match (./difficulty)
  private get preset() {
    return shooterPreset(this.def.team === playerTeam())
  }
  private get skill() {
    return within(this.preset.shooterSkill, this.def.rank)
  }
  private get reaction() {
    return this.preset.reaction
  }

  constructor(def: BotDef, held: Held) {
    this.def = def
    this.held = held
    this.shooter = { name: def.name, team: def.team }
    this.mag = GUNS[def.gun].magazine
    this.yaw = Math.atan2(def.away[0] - def.home[0], def.away[1] - def.home[1])
  }

  // Back in at the start: fresh, with a full magazine, and briefly untouchable
  reset(protection: number) {
    this.health = MAX_HEALTH
    this.shield = MAX_SHIELD
    this.down = false
    this.protectedUntil = now() + protection
    this.enemy = null
    this.seen = false
    this.mode = 'roam'
    this.path = []
    this.goal = -1
    this.mag = GUNS[this.def.gun].magazine
    this.reloadUntil = 0
    this.burstLeft = 0
    this.pose = 0
  }

  // Shot by someone: turn to face where it came from
  shotBy(from: Shooter) {
    const c = combatants.get(from.name)
    if (!c || this.seen) return
    const p = c.position()
    this.yaw = Math.atan2(p.x - this.at.x, p.z - this.at.z)
    this.nextLook = 0
  }

  update(rb: RapierRigidBody, dt: number, physics: Physics, nav: NavGrid | null) {
    const t = now()
    const p = rb.translation()
    pos.set(p.x, p.y, p.z)
    this.at.copy(pos)
    const vel = rb.linvel()
    const grounded = this.grounded(physics, rb)

    // 1. Look round for enemies
    if (t >= this.nextLook) {
      this.nextLook = t + LOOK_EVERY * (0.8 + Math.random() * 0.4)
      this.look(physics, rb, t)
    }
    if (this.seen) this.mode = 'fight'
    else if (this.mode === 'fight') {
      this.mode = 'hunt'
      this.goal = -1
    }
    if (this.mode === 'hunt' && t - this.lastSeenAt > 7) {
      this.mode = 'roam'
      this.goal = -1
    }

    // 2. Where to go
    let mx = 0
    let mz = 0
    let jump = false
    if (nav) {
      if (this.mode === 'fight' && this.enemy) {
        const e = this.enemy.position()
        const dx = e.x - pos.x
        const dz = e.z - pos.z
        const d = Math.hypot(dx, dz) || 1
        const want = liked(this.def.gun)
        if (d > want * 1.5) {
          // Too far for this gun: close in along a path
          if (t >= this.repathAt || this.goal < 0) this.route(nav, e.x, e.y, e.z, t, 1)
          const go = this.follow(nav)
          if (go) [mx, mz, jump] = [go[0] * SPEED, go[1] * SPEED, go[2]]
        } else {
          // In range: strafe from side to side, backing off if too close; never off an edge
          if (t >= this.strafeUntil) {
            this.strafe = Math.random() < 0.5 ? -1 : 1
            this.strafeUntil = t + 0.6 + Math.random() * 1.1
          }
          const back = d < want * 0.6 ? -0.8 : 0
          let sx = (-dz / d) * this.strafe + (dx / d) * back
          let sz = (dx / d) * this.strafe + (dz / d) * back
          const len = Math.hypot(sx, sz) || 1
          sx /= len
          sz /= len
          const feet = pos.y - 1
          if (!nav.standable(pos.x + sx * 1.2, feet, pos.z + sz * 1.2)) {
            this.strafe = -this.strafe
            sx = -sx
            sz = -sz
            if (!nav.standable(pos.x + sx * 1.2, feet, pos.z + sz * 1.2)) sx = sz = 0
          }
          mx = sx * STRAFE_SPEED
          mz = sz * STRAFE_SPEED
        }
      } else {
        // Hunting where an enemy was last seen, or roaming
        if (this.goal < 0 || t >= this.repathAt) {
          if (this.mode === 'hunt') this.route(nav, this.lastSeen.x, this.lastSeen.y, this.lastSeen.z, t, 2)
          else if (this.goal < 0) this.wander(nav, t)
          else this.repathAt = t + 4
        }
        const go = this.follow(nav)
        if (go) [mx, mz, jump] = [go[0] * SPEED, go[1] * SPEED, go[2]]
        else if (this.mode === 'roam') this.goal = -1 // there: somewhere else next
        else this.mode = 'roam'
      }
    }

    // Stuck against something: hop, and after a few tries find another way
    const wantsToMove = mx * mx + mz * mz > 1
    if (t >= this.checkAt) {
      const moved = Math.hypot(pos.x - this.checkPos.x, pos.z - this.checkPos.z)
      this.stuck = wantsToMove && moved < 0.35 ? this.stuck + 1 : 0
      if (this.stuck >= 1) jump = true
      if (this.stuck >= 4) {
        this.stuck = 0
        this.goal = -1
        this.path = []
      }
      this.checkPos.copy(pos)
      this.checkAt = t + 0.5
    }
    let vy = vel.y
    if (jump && grounded && vel.y < 1 && t >= this.jumpAt) {
      vy = JUMP_VELOCITY
      this.jumpAt = t + 0.6
    }
    rb.setLinvel({ x: mx, y: vy, z: mz }, true)
    if (wantsToMove && this.mode !== 'fight') this.yaw = this.aimYaw = Math.atan2(mx, mz)

    // 3. Aim and shoot
    const fighting = this.mode === 'fight' && this.enemy !== null
    if (fighting) {
      const e = this.enemy!.position()
      this.aimYaw = Math.atan2(e.x - pos.x, e.z - pos.z)
      this.yaw = this.aimYaw
    }
    this.pose = THREE.MathUtils.lerp(this.pose, fighting || this.mode === 'hunt' ? 1 : 0, 1 - Math.exp(-POSE_SPEED * dt))
    const gun = GUNS[this.def.gun]
    if (this.reloadUntil && t >= this.reloadUntil) {
      this.reloadUntil = 0
      this.mag = gun.magazine
    }
    if (fighting && this.seen && t >= this.reactAt && this.pose > 0.7 && !this.reloadUntil && t >= this.nextShot) this.fire(physics, rb, t, wantsToMove)
    if (!fighting && !this.reloadUntil && this.mag < gun.magazine / 2) this.reloadUntil = t + gun.fire.reload // top up between fights

    // 4. The gun in its hands, and how its body moves
    this.holdGun()
    const m = this.motion.current
    m.vx = mx
    m.vz = mz
    m.grounded = grounded
  }

  private grounded({ world, rapier }: Physics, rb: RapierRigidBody) {
    const ray = (groundRay ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }))
    ray.origin = rb.translation()
    return world.castRay(ray, 1.2, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, rb) !== null
  }

  // A clear line from the eyes to someone
  private sees({ world, rapier }: Physics, rb: RapierRigidBody, c: Combatant) {
    const q = c.position()
    eye.set(pos.x, pos.y + EYE, pos.z)
    dir.set(q.x - eye.x, q.y + 0.3 - eye.y, q.z - eye.z)
    const d = dir.length()
    if (d < 0.01) return true
    dir.divideScalar(d)
    const hit = world.castRay(new rapier.Ray(eye, dir), d, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, rb, (collider) => {
      const target = targetFor(collider.handle)
      return !target || target.alive()
    })
    return !hit || targetFor(hit.collider.handle) === c.target
  }

  private look(physics: Physics, rb: RapierRigidBody, t: number) {
    const fx = Math.sin(this.yaw)
    const fz = Math.cos(this.yaw)
    let best: Combatant | null = null
    let bestScore = Infinity
    for (const c of combatants.values()) {
      if (c.team === this.def.team || !c.target.alive()) continue
      const q = c.position()
      const dx = q.x - pos.x
      const dz = q.z - pos.z
      const flat = Math.hypot(dx, dz)
      const d = Math.hypot(flat, q.y - pos.y)
      if (d > SIGHT) continue
      const current = c === this.enemy && this.seen
      if (!current && d > HEAR && (dx * fx + dz * fz) / (flat || 1) < FOV) continue
      if (!this.sees(physics, rb, c)) continue
      const score = current ? d * 0.7 : d
      if (score < bestScore) {
        bestScore = score
        best = c
      }
    }
    if (best) {
      if (best !== this.enemy || !this.seen) this.reactAt = t + ((0.3 + Math.random() * 0.35) / this.skill) * this.reaction
      this.enemy = best
      this.seen = true
      const q = best.position()
      this.lastSeen.set(q.x, q.y, q.z)
      this.lastSeenAt = t
    } else this.seen = false
  }

  // A path to near (x, y, z)
  private route(nav: NavGrid, x: number, y: number, z: number, t: number, every: number) {
    this.repathAt = t + every * (0.8 + Math.random() * 0.4)
    const start = nav.nearest(pos.x, pos.y, pos.z)
    const goal = nav.nearest(x, y, z, 4)
    if (start < 0 || goal < 0) return
    const path = start === goal ? [] : nav.path(start, goal)
    if (!path) return
    this.from = start
    this.goal = goal
    this.path = path
    this.step = 0
  }

  // Somewhere new to roam to: mostly into the other side's half, never right here
  private wander(nav: NavGrid, t: number) {
    const { home, away } = this.def
    const forward = Math.random() < 0.65
    for (let tries = 0; tries < 12; tries++) {
      const n = nav.goals[Math.floor(Math.random() * nav.goals.length)]
      if (n === undefined) return
      const x = nav.xs[n]
      const z = nav.zs[n]
      if (Math.hypot(x - pos.x, z - pos.z) < 10) continue
      const toAway = Math.hypot(x - away[0], z - away[1])
      const toHome = Math.hypot(x - home[0], z - home[1])
      if (forward && toAway > toHome * 1.3 && tries < 10) continue
      this.route(nav, x, nav.ys[n] + 1, z, t, 6)
      if (this.goal >= 0) return
    }
    this.repathAt = t + 1
  }

  // Along the path: which way to go (x, z) and whether to jump; null when there
  private follow(nav: NavGrid): [number, number, boolean] | null {
    const feet = pos.y - 1
    while (this.step < this.path.length) {
      const n = this.path[this.step]
      const close = Math.hypot(nav.xs[n] - pos.x, nav.zs[n] - pos.z) < (this.step < this.path.length - 1 ? 0.75 : 0.45)
      if (!close || Math.abs(nav.ys[n] - feet) > 1.2) break
      this.from = n
      this.step++
    }
    if (this.step >= this.path.length) return null
    // Head for a point a little further along, so it cuts the grid's corners
    let n = this.path[this.step]
    const ahead = this.path[Math.min(this.step + 2, this.path.length - 1)]
    if (Math.abs(nav.ys[ahead] - nav.ys[n]) < 0.3 && nav.link(this.from, n)?.kind === 'walk') n = ahead
    const dx = nav.xs[n] - pos.x
    const dz = nav.zs[n] - pos.z
    const d = Math.hypot(dx, dz) || 1
    const next = this.path[this.step]
    const link = nav.link(this.from, next)
    const jump = link?.kind === 'jump' && Math.hypot(nav.xs[next] - pos.x, nav.zs[next] - pos.z) < 1.4
    return [dx / d, dz / d, jump]
  }

  // One shot (or a shotgun's pellets) at the enemy, a little off
  private fire({ world, rapier }: Physics, rb: RapierRigidBody, t: number, moving: boolean) {
    const gun = GUNS[this.def.gun]
    const f = gun.fire
    if (this.mag <= 0) {
      this.reloadUntil = t + f.reload
      return
    }
    const e = this.enemy!.position()
    eye.set(pos.x, pos.y + EYE, pos.z)
    aimAt.set(e.x, e.y + 0.1 + Math.random() * 0.45, e.z)
    const spread = (0.02 + (moving ? 0.015 : 0)) / this.skill
    dir.subVectors(aimAt, eye).normalize()
    side.crossVectors(dir, UP).normalize()
    upish.crossVectors(side, dir)
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15
    dir.addScaledVector(side, gauss() * spread).addScaledVector(upish, gauss() * spread).normalize()
    muzzle.set(pos.x + Math.sin(this.aimYaw) * 0.8, pos.y + 0.32, pos.z + Math.cos(this.aimYaw) * 0.8)

    const tally = new Map<Target, { damage: number; head: boolean }>()
    const shot = new THREE.Vector3()
    const turn = Math.random() * Math.PI * 2
    for (let i = 0; i < (f.pellets?.count ?? 1); i++) {
      shot.copy(dir)
      if (f.pellets) {
        const [r, a] = pelletOffset(f.pellets, i, turn)
        shot.addScaledVector(side, r * Math.cos(a)).addScaledVector(upish, r * Math.sin(a)).normalize()
      }
      const hit = world.castRay(new rapier.Ray(eye, shot), RANGE_SHOT, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, rb, (collider) => {
        const target = targetFor(collider.handle)
        return !target || target.alive()
      })
      end.copy(eye).addScaledVector(shot, hit ? hit.timeOfImpact : RANGE_SHOT)
      addTracer(muzzle, end, f.pellets ? 0.016 : 0.03)
      if (!hit) continue
      addPuff(end, 'spark', 0.09)
      const target = targetFor(hit.collider.handle)
      if (!target || target.team === this.def.team) continue
      const head = isHeadshot(target, end)
      const sum = tally.get(target) ?? { damage: 0, head: false }
      sum.damage += (head ? f.headshot : f.damage) * DAMAGE
      sum.head ||= head
      tally.set(target, sum)
    }
    tally.forEach((sum, target) => target.hit(Math.max(1, Math.round(sum.damage)), sum.head, this.shooter))
    if (f.suppressed) addPuff(muzzle, 'smoke', 0.05, new THREE.Vector3(0, 0.3, 0))
    else addPuff(muzzle, 'flash', f.pellets ? 0.24 : 0.16)
    const player = activePlayerPosition()
    playShot(gun.sound, player ? Math.hypot(player.x - pos.x, player.y - pos.y, player.z - pos.z) : 30)

    this.mag--
    if (f.burst && this.burstLeft === 0) this.burstLeft = f.burst.count - 1
    else if (this.burstLeft > 0) this.burstLeft--
    this.nextShot = t + (this.burstLeft > 0 ? f.burst!.gap : f.interval * (1.15 + Math.random() * 0.45))
    if (this.mag <= 0) {
      this.burstLeft = 0
      this.reloadUntil = t + f.reload
    }
  }

  // The gun between carried and aimed, hands on it (as the player holds one: ../experimental/guns)
  private holdGun() {
    const { carry, aim } = GUNS[this.def.gun]
    const h = this.held
    const t = this.pose
    h.position.lerpVectors(carry.position, aim.position, t)
    h.quaternion.slerpQuaternions(carry.quaternion, aim.quaternion, t)
    h.right = this.right.copy(carry.grip).lerp(aim.grip, t).applyQuaternion(h.quaternion).add(h.position)
    const support = t > 0.05 ? (aim.support ?? carry.support) : carry.support
    h.left = support ? this.left.copy(support).applyQuaternion(h.quaternion).add(h.position) : null
    h.twist = THREE.MathUtils.lerp(carry.twist, aim.twist, t)
    h.lookAround = THREE.MathUtils.lerp(carry.lookAround, aim.lookAround, t)
    h.yaw = t > 0.05 && aim.yawOffset !== null ? this.aimYaw + aim.yawOffset : null
  }
}
