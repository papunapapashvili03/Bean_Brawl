import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { activePlayerPosition } from '../../playerContact'
import { blastDamage, isHeadshot, targetFor } from '../combat'
import { GUNS } from './catalog'
import { BLAST_POOL, PUFF_POOL, ROCKET_POOL, TRACER_POOL, addBlast, addPuff, fx, type PuffKind } from './fx'
import { Rocket } from './models'
import { castShot } from './shots'
import { playExplosion } from './sounds'

// Draws and animates everything in ./fx, and flies the rockets: each frame a rocket checks the path
// it's about to travel, and explodes on whatever it meets (or after a few seconds of flight).

const STREAK = 2.5 // tracer streak length (m)
const ROCKET_LIFE = 5 // seconds before a rocket that hit nothing goes off anyway
const SMOKE_EVERY = 0.025 // seconds between smoke puffs behind a rocket
const BLAST_TIME = 0.45

const PUFF_COLORS: Record<PuffKind, THREE.Color> = {
  spark: new THREE.Color('#ffd166').multiplyScalar(1.4),
  flash: new THREE.Color('#fff0b0').multiplyScalar(1.6),
  smoke: new THREE.Color('#a4a8b0'),
  ember: new THREE.Color('#ff9a3c').multiplyScalar(1.3),
}

const unitBox = new THREE.BoxGeometry(1, 1, 1)
const unitSphere = new THREE.SphereGeometry(1, 10, 8)
const tracerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3c4').multiplyScalar(1.5), toneMapped: false })
const puffMaterial = new THREE.MeshBasicMaterial({ toneMapped: false })
// Smoke is soft and see-through, so a puff near the camera doesn't blot out the view
const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#b4b8c0', transparent: true, opacity: 0.45, depthWrite: false })
const flameGeometry = new THREE.ConeGeometry(0.07, 0.35, 10).rotateZ(Math.PI / 2) // pointing back along -x
const flameMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(1.5), toneMapped: false })

// Each blast slot has its own materials so it can fade on its own
const blastLooks = Array.from({ length: BLAST_POOL }, () => ({
  fire: new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, depthWrite: false, toneMapped: false }),
  core: new THREE.MeshBasicMaterial({ color: '#fff1a8', transparent: true, depthWrite: false, toneMapped: false }),
}))

const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const p = new THREE.Vector3()
const s = new THREE.Vector3()
const tail = new THREE.Vector3()

export function Effects() {
  const physics = useRapier()
  const tracers = useRef<THREE.InstancedMesh>(null)
  const puffs = useRef<THREE.InstancedMesh>(null)
  const smoke = useRef<THREE.InstancedMesh>(null)
  const rockets = useRef<(THREE.Group | null)[]>([])
  const blasts = useRef<({ group: THREE.Group | null; fire: THREE.Mesh | null; core: THREE.Mesh | null })[]>(
    Array.from({ length: BLAST_POOL }, () => ({ group: null, fire: null, core: null })),
  )

  useFrame((_, dt) => {
    // Tracers: a streak runs from the muzzle to the hit point, then vanishes
    fx.tracers = fx.tracers.filter((t) => (t.age += dt) < t.life)
    fx.tracers.forEach((t, i) => {
      const head = Math.min(t.length, (t.age / (t.life - 0.02)) * t.length)
      const len = Math.min(STREAK, head)
      p.copy(t.from).addScaledVector(t.dir, head - len / 2)
      q.setFromUnitVectors(Z, t.dir)
      s.set(t.width, t.width, Math.max(len, 0.01))
      tracers.current!.setMatrixAt(i, m.compose(p, q, s))
    })
    tracers.current!.count = fx.tracers.length
    tracers.current!.instanceMatrix.needsUpdate = true

    // Rockets: fly straight, checking the stretch ahead for anything to hit
    const flying: typeof fx.rockets = []
    for (const r of fx.rockets) {
      r.age += dt
      const step = r.speed * dt
      const hit = castShot(physics, r.pos, r.dir, step)
      if (hit || r.age > ROCKET_LIFE) {
        explode(hit ? hit.point : r.pos, hit ? hit.collider : null, r.gun)
        continue
      }
      r.pos.addScaledVector(r.dir, step)
      r.smoke += dt
      while (r.smoke > SMOKE_EVERY) {
        r.smoke -= SMOKE_EVERY
        tail.copy(r.pos).addScaledVector(r.dir, -0.55)
        addPuff(tail, 'smoke', 0.1 + Math.random() * 0.05, new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4))
      }
      flying.push(r)
    }
    fx.rockets = flying
    for (let i = 0; i < ROCKET_POOL; i++) {
      const g = rockets.current[i]
      const r = fx.rockets[i]
      if (!g) continue
      g.visible = !!r
      if (!r) continue
      g.position.copy(r.pos)
      g.quaternion.setFromUnitVectors(X, r.dir)
      const flame = g.children[1]
      flame.scale.setScalar(0.8 + Math.random() * 0.5)
    }

    // Puffs: sparks and flashes shrink away, smoke swells and fades, embers fly out and fall
    fx.puffs = fx.puffs.filter((f) => (f.age += dt) < f.life)
    let glowing = 0
    let smoking = 0
    for (const f of fx.puffs) {
      const t = f.age / f.life
      let size = f.size * (1 - t)
      if (f.kind === 'smoke') size = f.size * (0.8 + 1.4 * t) * (1 - t * t)
      if (f.kind === 'ember') f.drift.y -= 12 * dt
      f.at.addScaledVector(f.drift, dt)
      m.compose(f.at, q.identity(), s.setScalar(Math.max(size, 0.001)))
      if (f.kind === 'smoke') smoke.current!.setMatrixAt(smoking++, m)
      else {
        puffs.current!.setMatrixAt(glowing, m)
        puffs.current!.setColorAt(glowing++, PUFF_COLORS[f.kind])
      }
    }
    puffs.current!.count = glowing
    puffs.current!.instanceMatrix.needsUpdate = true
    if (puffs.current!.instanceColor) puffs.current!.instanceColor.needsUpdate = true
    smoke.current!.count = smoking
    smoke.current!.instanceMatrix.needsUpdate = true

    // Explosions: a fireball swells to the blast radius and fades, around a bright shrinking core
    fx.blasts = fx.blasts.filter((b) => (b.age += dt) < BLAST_TIME)
    for (let i = 0; i < BLAST_POOL; i++) {
      const slot = blasts.current[i]
      const b = fx.blasts[i]
      if (!slot.group) continue
      slot.group.visible = !!b
      if (!b) continue
      const t = b.age / BLAST_TIME
      slot.group.position.copy(b.at)
      slot.fire!.scale.setScalar(b.radius * (0.3 + 0.7 * (1 - (1 - t) ** 3)))
      slot.core!.scale.setScalar(b.radius * 0.55 * (1 - t))
      blastLooks[i].fire.opacity = 0.8 * (1 - t)
      blastLooks[i].core.opacity = 1 - t
    }
  })

  return (
    <>
      <instancedMesh ref={tracers} args={[unitBox, tracerMaterial, TRACER_POOL]} frustumCulled={false} />
      <instancedMesh ref={puffs} args={[unitSphere, puffMaterial, PUFF_POOL]} frustumCulled={false} />
      <instancedMesh ref={smoke} args={[unitSphere, smokeMaterial, PUFF_POOL]} frustumCulled={false} />
      {Array.from({ length: ROCKET_POOL }, (_, i) => (
        <group key={i} ref={(g) => void (rockets.current[i] = g)} visible={false}>
          <Rocket />
          <mesh geometry={flameGeometry} material={flameMaterial} position={[-0.62, 0, 0]} />
        </group>
      ))}
      {blastLooks.map((look, i) => (
        <group key={i} ref={(g) => void (blasts.current[i].group = g)} visible={false}>
          <mesh ref={(mesh) => void (blasts.current[i].fire = mesh)} geometry={unitSphere} material={look.fire} />
          <mesh ref={(mesh) => void (blasts.current[i].core = mesh)} geometry={unitSphere} material={look.core} />
        </group>
      ))}
    </>
  )
}

// A rocket goes off: a direct hit takes the full (or headshot) damage; everyone else within the blast
// radius takes damage falling off from the maximum at the centre to nothing at the edge
function explode(point: THREE.Vector3, collider: number | null, gun: number) {
  const { damage, headshot, rocket } = GUNS[gun].fire
  const radius = rocket?.radius ?? 2
  const direct = collider === null ? undefined : targetFor(collider)
  if (direct?.alive()) {
    const head = isHeadshot(direct, point)
    direct.hit(head ? headshot : damage, head)
  }
  blastDamage(point, radius, damage, direct)
  addBlast(point, radius)
  const player = activePlayerPosition()
  playExplosion(player ? point.distanceTo(new THREE.Vector3(player.x, player.y, player.z)) : 0)
}
