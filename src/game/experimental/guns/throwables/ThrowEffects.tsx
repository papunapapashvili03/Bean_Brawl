import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { allTargets } from '../../combat'
import { addPuff } from '../fx'
import { playFire, playLanding, playShatter } from '../sounds'
import { cast, type Hit, type Physics, type Ray } from './cast'
import { PROJECTILES, THROWABLES } from './catalog'
import { distanceFromPlayer, explodeAt, popSmoke, throwWorld, useThrowWorld, type Fire, type FirePatch, type Smoke, type Thrown } from './world'

// Moves and draws everything thrown: throwables flying, bouncing and rolling to a stop, fuses running
// down, molotov fires spreading and burning whoever stands in them, and smoke clouds billowing out.


// Flying and bouncing
const STEP = 1 / 120 // small steps, so nothing flies through a thin wall
const BOUNCE_SPEED = 1.5 // slower than this into a surface and it slides along it instead of bouncing
const GRIP = 0.5 // how much of its speed along a surface a bounce keeps
const ROLL_FRICTION = 12 // m/s², slowing it as it slides or rolls along the ground
const SETTLE = 0.15 // slower than this on the ground and it comes to rest
const FALL_LIMIT = -30 // fell off the world
// Fire
const CELL = 0.3 // the fire's circle is checked for ground in cells this size
const SPREAD_SPEED = 3.5 // m/s: how fast the fire runs out from where the bottle broke
const FIRE_FADE = 1.5 // seconds the flames take to die down at the end
const FLAMES_PER_PATCH = 3
// Smoke
const SMOKE_PUFFS = 96
const EMIT_TIME = 2.5 // seconds the can takes to pour out the cloud
const BILLOW_TIME = 2.2 // seconds a puff takes to billow out to its place in the cloud
const SMOKE_FADE = 4
const JET_TIME = 6 // seconds the can visibly spews smoke

// Molotovs that broke this frame, to set their fires going
const broken: { at: THREE.Vector3; normal: THREE.Vector3 }[] = []

const DOWN = { x: 0, y: -1, z: 0 }
const Y = new THREE.Vector3(0, 1, 0)
const dir = new THREE.Vector3()
const normal = new THREE.Vector3()
const tangent = new THREE.Vector3()
const lying = new THREE.Vector3()
const spinTurn = new THREE.Quaternion()
const rest = new THREE.Quaternion()

export function ThrowEffects() {
  const physics = useRapier()
  const { thrown, fires, smokes } = useThrowWorld()
  const ray = useRef<Ray | null>(null)
  const fireLight = useRef<THREE.PointLight>(null)
  const nextPuff = useRef(0)

  // Leaving the playground takes everything thrown with it (and silences it)
  useEffect(() => () => throwWorld.clear(), [])

  useFrame((state, dt) => {
    const r = (ray.current ??= new physics.rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }))
    const gravity = Math.abs(physics.world.gravity.y) || 20
    const world = throwWorld.get()

    for (const t of world.thrown) {
      const spec = PROJECTILES[t.kind]
      // The fuse: a grenade or dynamite goes off wherever it's got to; a smoke grenade starts pouring smoke
      if (t.fuse !== null) {
        t.fuse -= dt
        if (spec.fuse) t.live.burn = Math.max(0, t.fuse / spec.fuse)
        if (t.fuse <= 0) {
          if (spec.blast) {
            explodeAt(t.kind, t.pos)
            throwWorld.removeThrown(t)
            continue
          }
          t.fuse = null
          popSmoke(t)
        }
      }
      if (!t.resting && fly(physics, r, t, dt, gravity)) continue
      turn(t, dt)
      if (t.pos.y < FALL_LIMIT) throwWorld.removeThrown(t)
    }

    for (const f of world.fires) burn(f, dt)

    // Fires smoke and throw up embers; smoke cans spew smoke for a while after they pop
    nextPuff.current -= dt
    if (nextPuff.current <= 0) {
      nextPuff.current = 0.05
      for (const f of world.fires) {
        const p = f.patches[Math.floor(Math.random() * f.patches.length)]
        if (!p || f.age < p.lightAt || f.age > THROWABLES.molotov.fire!.duration - FIRE_FADE) continue
        const at = p.at.clone().add(new THREE.Vector3(0, 0.7, 0))
        addPuff(at, 'smoke', 0.18 + Math.random() * 0.12, new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.4, (Math.random() - 0.5) * 0.6))
        if (Math.random() < 0.4) addPuff(at, 'ember', 0.04, new THREE.Vector3((Math.random() - 0.5) * 2, 4 + Math.random() * 2, (Math.random() - 0.5) * 2))
      }
      for (const s of world.smokes) {
        if (s.age > JET_TIME) continue
        const top = s.can.pos.clone().add(new THREE.Vector3(0, 0.15, 0))
        addPuff(top, 'smoke', 0.2 + Math.random() * 0.15, new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5))
      }
    }

    for (const s of world.smokes) {
      s.age += dt
      if (s.age > THROWABLES.smoke.smoke!.duration) {
        throwWorld.removeSmoke(s)
        throwWorld.removeThrown(s.can) // the empty can goes with it
      }
    }

    // One flickering light for the newest fire (a light always there, so fires coming and going don't make
    // every material rebuild itself for a new light)
    const light = fireLight.current!
    const newest = world.fires[world.fires.length - 1]
    if (newest) {
      const fade = THREE.MathUtils.clamp((THROWABLES.molotov.fire!.duration - newest.age) / FIRE_FADE, 0, 1)
      light.position.set(newest.at.x, newest.at.y + 1, newest.at.z)
      light.intensity = 6 * fade * (0.8 + 0.2 * Math.sin(state.clock.elapsedTime * 21) * Math.sin(state.clock.elapsedTime * 13))
    } else light.intensity = 0

    // Molotovs that broke this frame start their fires (after the loop above, so they aren't counted twice)
    for (const b of broken.splice(0)) ignite(physics, r, b.at, b.normal)
  })

  return (
    <>
      <pointLight ref={fireLight} color="#ff8a3a" intensity={0} distance={9} decay={1.5} />
      {thrown.map((t) => (
        <ThrownView key={t.id} t={t} />
      ))}
      {fires.map((f) => (
        <FireView key={f.id} fire={f} />
      ))}
      {smokes.map((s) => (
        <SmokeView key={s.id} smoke={s} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Flying: gravity, bouncing off whatever it hits (harder hits bounce more), sliding along the ground until it
// stops. Returns true when it's gone (a molotov breaking).

function fly(physics: Physics, ray: Ray, t: Thrown, dt: number, gravity: number) {
  const { size } = PROJECTILES[t.kind]
  t.onGround = false
  let left = dt
  while (left > 1e-6 && !t.resting) {
    const h = Math.min(STEP, left)
    left -= h
    t.vel.y -= gravity * h
    const speed = t.vel.length()
    if (speed > 1e-6) {
      dir.copy(t.vel).divideScalar(speed)
      const hit = cast(physics, ray, t.pos, dir, speed * h + size)
      if (hit) {
        t.pos.addScaledVector(dir, Math.max(0, hit.timeOfImpact - size))
        if (contact(t, hit.normal, h)) return true
      } else t.pos.addScaledVector(dir, speed * h)
    }
    // Lying or sliding on the ground: kept on top of it rather than sinking in
    const ground = cast(physics, ray, t.pos, DOWN, size + 0.01)
    if (ground && ground.normal.y > 0.5) {
      t.pos.y += size - ground.timeOfImpact
      t.onGround = true
      if (contact(t, ground.normal, h)) return true
    }
  }
  return false
}

function contact(t: Thrown, n: Hit['normal'], h: number) {
  const spec = PROJECTILES[t.kind]
  const into = t.vel.x * n.x + t.vel.y * n.y + t.vel.z * n.z
  if (into >= 0) return false // already moving away
  if (spec.fire) {
    // A bottle breaks on whatever it hits first
    for (let i = 0; i < 10; i++) {
      addPuff(t.pos, 'spark', 0.035, new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(4))
    }
    playShatter(distanceFromPlayer(t.pos))
    broken.push({ at: t.pos.clone(), normal: new THREE.Vector3(n.x, n.y, n.z) })
    throwWorld.removeThrown(t)
    return true
  }
  normal.set(n.x, n.y, n.z)
  tangent.copy(t.vel).addScaledVector(normal, -into)
  if (-into > BOUNCE_SPEED) {
    t.vel.copy(tangent).multiplyScalar(GRIP).addScaledVector(normal, -into * spec.bounce)
    t.spin *= 0.6
    playLanding(spec.landing, -into, distanceFromPlayer(t.pos))
  } else {
    const along = tangent.length()
    const slower = Math.max(0, along - ROLL_FRICTION * h)
    t.vel.copy(tangent).multiplyScalar(along > 1e-6 ? slower / along : 0)
    t.spin *= Math.exp(-4 * h)
    if (slower < SETTLE && n.y > 0.6) {
      t.resting = true
      t.vel.set(0, 0, 0)
    }
  }
  return false
}

// Tumbling through the air (or flying nose first, for a streamlined one); on the ground it settles onto its side
function turn(t: Thrown, dt: number) {
  if (!t.onGround && !t.resting) {
    if (PROJECTILES[t.kind].streamline && t.vel.lengthSq() > 1e-4) t.quat.setFromUnitVectors(Y, dir.copy(t.vel).normalize())
    else t.quat.premultiply(spinTurn.setFromAxisAngle(t.spinAxis, t.spin * dt))
    return
  }
  lying.copy(Y).applyQuaternion(t.quat).setY(0)
  if (lying.lengthSq() < 1e-4) lying.set(t.spinAxis.z, 0, -t.spinAxis.x)
  if (lying.lengthSq() < 1e-4) lying.set(1, 0, 0)
  rest.setFromUnitVectors(Y, lying.normalize())
  t.quat.slerp(rest, 1 - Math.exp(-10 * dt))
}

// ---------------------------------------------------------------------------------------------------------
// Fire: patches of burning ground at random spots in a circle round where the bottle broke, until they cover
// the share of it the molotov says, catching one after another as the fire runs outwards

function ignite(physics: Physics, ray: Ray, at: THREE.Vector3, normal: THREE.Vector3) {
  const spec = THROWABLES.molotov.fire!
  // The ground below where it broke (it may have hit a wall, so step out from that first)
  const start = at.clone().addScaledVector(normal, 0.3).add(new THREE.Vector3(0, 0.5, 0))
  const floor = cast(physics, ray, start, DOWN, 4)
  if (!floor) return
  const centre = start.clone().add(new THREE.Vector3(0, -floor.timeOfImpact, 0))

  // The spots of ground in the circle, at about the same height (not down a drop or up on a ledge)
  const cells: THREE.Vector3[] = []
  const probe = new THREE.Vector3()
  for (let x = -spec.radius; x <= spec.radius; x += CELL) {
    for (let z = -spec.radius; z <= spec.radius; z += CELL) {
      if (Math.hypot(x, z) > spec.radius) continue
      probe.set(centre.x + x, centre.y + 1.2, centre.z + z)
      const hit = cast(physics, ray, probe, DOWN, 2.6)
      if (!hit || hit.normal.y < 0.5) continue
      const y = probe.y - hit.timeOfImpact
      if (Math.abs(y - centre.y) < 1) cells.push(new THREE.Vector3(probe.x, y, probe.z))
    }
  }
  if (cells.length === 0) return

  // Patches until they cover the share: the first where it broke, the rest wherever they land
  const covered = new Set<number>()
  const patches: FirePatch[] = []
  const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z)
  const nearest = cells.reduce((best, c) => (flat(c, centre) < flat(best, centre) ? c : best), cells[0])
  for (let tries = 0; covered.size < spec.cover * cells.length && tries < 400; tries++) {
    const spot = tries === 0 ? nearest : cells[Math.floor(Math.random() * cells.length)]
    const r = 0.35 + Math.random() * 0.3
    let added = 0
    cells.forEach((c, i) => {
      if (!covered.has(i) && flat(c, spot) <= r) {
        covered.add(i)
        added++
      }
    })
    if (added === 0) continue
    patches.push({ at: spot.clone(), r, lightAt: flat(spot, centre) / SPREAD_SPEED + Math.random() * 0.15 })
  }
  throwWorld.addFire({
    id: throwWorld.newId(),
    at: centre,
    patches,
    age: 0,
    cover: covered.size / cells.length,
    nextBurn: new Map(),
    stopSound: playFire(spec.duration, distanceFromPlayer(centre)),
  })
}

const burning = (f: Fire, p: FirePatch) => f.age >= p.lightAt && f.age < THROWABLES.molotov.fire!.duration - 0.3

// Anyone standing in a burning patch takes damage every tick; the fire dies when its time is up
function burn(f: Fire, dt: number) {
  const spec = THROWABLES.molotov.fire!
  f.age += dt
  if (f.age > spec.duration) {
    throwWorld.removeFire(f)
    return
  }
  for (const target of allTargets()) {
    if (!target.alive()) continue
    const c = target.centre()
    const feet = c.y - 1
    const inFire = f.patches.some(
      (p) => burning(f, p) && Math.abs(feet - p.at.y) < 0.8 && Math.hypot(c.x - p.at.x, c.z - p.at.z) < p.r + 0.3,
    )
    if (!inFire) {
      f.nextBurn.delete(target)
      continue
    }
    const next = f.nextBurn.get(target) ?? f.age
    if (f.age >= next) {
      target.hit(spec.damage, false)
      f.nextBurn.set(target, next + spec.tick)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Drawing

function ThrownView({ t }: { t: Thrown }) {
  const { Model } = PROJECTILES[t.kind]
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    group.current!.position.copy(t.pos)
    group.current!.quaternion.copy(t.quat)
  })
  return (
    <group ref={group}>
      <Model live={t.live} />
    </group>
  )
}

// Flames: tongues of fire flickering on each patch, over a glow on the ground
const flameGeometry = new THREE.ConeGeometry(0.16, 0.6, 7).translate(0, 0.3, 0)
const flameMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false })
const glowGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)
const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
const FLAME_COLORS = ['#ffd23a', '#ff9a2a', '#ff6a1a'].map((c) => new THREE.Color(c).multiplyScalar(1.2))
const m = new THREE.Matrix4()
const pos = new THREE.Vector3()
const scale = new THREE.Vector3()
const tilt = new THREE.Euler()
const q = new THREE.Quaternion()

function FireView({ fire }: { fire: Fire }) {
  const spec = THROWABLES.molotov.fire!
  const flames = useRef<THREE.InstancedMesh>(null)
  const glows = useRef<THREE.InstancedMesh>(null)
  // Where each flame stands in its patch, how big it is and how it flickers
  const layout = useMemo(
    () =>
      fire.patches.flatMap((p, patch) =>
        Array.from({ length: FLAMES_PER_PATCH }, () => {
          const a = Math.random() * Math.PI * 2
          const d = Math.sqrt(Math.random()) * p.r * 0.7
          return {
            patch,
            dx: Math.cos(a) * d,
            dz: Math.sin(a) * d,
            height: 0.6 + Math.random() * 0.7,
            width: 0.8 + Math.random() * 0.5,
            phase: Math.random() * 10,
            rate: 7 + Math.random() * 6,
          }
        }),
      ),
    [fire],
  )
  useFrame((state) => {
    const f = flames.current!
    const g = glows.current!
    if (!f.instanceColor) layout.forEach((_, i) => f.setColorAt(i, FLAME_COLORS[i % FLAME_COLORS.length]))
    const time = state.clock.elapsedTime
    const fade = THREE.MathUtils.clamp((spec.duration - fire.age) / FIRE_FADE, 0, 1)
    const life = (p: FirePatch) => THREE.MathUtils.clamp((fire.age - p.lightAt) / 0.3, 0, 1) * fade
    layout.forEach((flame, i) => {
      const p = fire.patches[flame.patch]
      const l = life(p)
      const flicker = 0.75 + 0.2 * Math.sin(time * flame.rate + flame.phase) + 0.12 * Math.sin(time * flame.rate * 2.3 + flame.phase * 1.7)
      pos.set(p.at.x + flame.dx, p.at.y, p.at.z + flame.dz)
      q.setFromEuler(tilt.set(Math.sin(time * 3 + flame.phase) * 0.12, 0, Math.cos(time * 2.6 + flame.phase) * 0.12))
      scale.set(flame.width * l + 1e-3, flame.height * flicker * l + 1e-3, flame.width * l + 1e-3)
      f.setMatrixAt(i, m.compose(pos, q, scale))
    })
    f.instanceMatrix.needsUpdate = true
    fire.patches.forEach((p, i) => {
      pos.set(p.at.x, p.at.y + 0.02, p.at.z)
      g.setMatrixAt(i, m.compose(pos, q.identity(), scale.setScalar(p.r * 1.15 * life(p) + 1e-3)))
    })
    g.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={flames} args={[flameGeometry, flameMaterial, layout.length]} frustumCulled={false} />
      <instancedMesh ref={glows} args={[glowGeometry, glowMaterial, fire.patches.length]} frustumCulled={false} />
    </>
  )
}

// Smoke: big soft puffs pouring out of the can and billowing out to fill the cloud, then churning about:
// each drifts round the cloud, rises or sinks, and wanders about its place, all at their own random pace
function smokeTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  let seed = 11
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  // A few soft blobs on top of each other, so a puff isn't a perfect disc (all fading out before the edge)
  for (let i = 0; i < 7; i++) {
    const x = 64 + (rand() - 0.5) * 40
    const y = 64 + (rand() - 0.5) * 40
    const r = 26 + rand() * 14
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(255,255,255,0.7)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const puffTexture = smokeTexture()

type SmokePuff = {
  angle: number
  r: number
  y: number
  size: number
  emitAt: number
  swirl: number
  rise: number
  wander: THREE.Vector3
  drift: THREE.Vector3
  alpha: number
  spin: number
}

function smokePuffs(): SmokePuff[] {
  const { radius, height } = THROWABLES.smoke.smoke!
  return Array.from({ length: SMOKE_PUFFS }, (_, i) => {
    const size = 3 + Math.random() * 2.5
    return {
      angle: Math.random() * Math.PI * 2,
      r: Math.sqrt(Math.random()) * (radius - size * 0.35),
      y: size * 0.35 + Math.pow(Math.random(), 1.3) * (height - size * 0.75),
      size,
      emitAt: (i / SMOKE_PUFFS) * EMIT_TIME,
      swirl: (Math.random() - 0.5) * 0.14,
      rise: (Math.random() - 0.5) * 0.3,
      wander: new THREE.Vector3(),
      drift: new THREE.Vector3(),
      alpha: 0.8 + Math.random() * 0.2,
      spin: (Math.random() - 0.5) * 0.4,
    }
  })
}

const home = new THREE.Vector3()
const source = new THREE.Vector3()

function SmokeView({ smoke }: { smoke: Smoke }) {
  const { height, duration } = THROWABLES.smoke.smoke!
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const puffs = useRef<SmokePuff[] | null>(null)
  puffs.current ??= smokePuffs()
  useFrame((_, dt) => {
    const fade = THREE.MathUtils.clamp((duration - smoke.age) / SMOKE_FADE, 0, 1)
    source.copy(smoke.can.pos).add(new THREE.Vector3(0, 0.2, 0))
    puffs.current!.forEach((p, i) => {
      const sprite = sprites.current[i]
      if (!sprite) return
      const since = smoke.age - p.emitAt
      sprite.visible = since > 0
      if (since <= 0) return
      p.angle += p.swirl * dt
      p.y += p.rise * dt
      const low = p.size * 0.35
      const high = height - p.size * 0.4
      if (p.y < low || p.y > high) {
        p.y = THREE.MathUtils.clamp(p.y, low, high)
        p.rise = -p.rise
      }
      p.drift.x += (Math.random() - 0.5) * dt * 1.2
      p.drift.y += (Math.random() - 0.5) * dt * 0.5
      p.drift.z += (Math.random() - 0.5) * dt * 1.2
      p.drift.multiplyScalar(Math.exp(-0.5 * dt))
      p.wander.addScaledVector(p.drift, dt).clampLength(0, 1.2)
      home.set(smoke.at.x + Math.cos(p.angle) * p.r, smoke.at.y + p.y, smoke.at.z + Math.sin(p.angle) * p.r).add(p.wander)
      const out = 1 - (1 - Math.min(1, since / BILLOW_TIME)) ** 3
      sprite.position.lerpVectors(source, home, out)
      sprite.scale.setScalar(THREE.MathUtils.lerp(0.3, p.size, out))
      const material = sprite.material
      material.opacity = p.alpha * Math.min(1, since / 0.5) * fade
      material.rotation += p.spin * dt
    })
  })
  return (
    <>
      {Array.from({ length: SMOKE_PUFFS }, (_, i) => (
        <sprite key={i} ref={(s) => void (sprites.current[i] = s)} visible={false}>
          <spriteMaterial
            map={puffTexture}
            transparent
            depthWrite={false}
            opacity={0}
            color={new THREE.Color('#dde0e4').multiplyScalar(0.84 + (i % 5) * 0.04)}
          />
        </sprite>
      ))}
    </>
  )
}
