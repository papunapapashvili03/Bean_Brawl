import type { ComponentType } from 'react'
import * as THREE from 'three'
import type { Landing } from '../sounds'
import { Capsule, Dynamite, Grenade, Molotov, SmokeGrenade } from './models'

// EXPERIMENTAL: throwables, part of the guns feature. Everything about each one in one place.
//
// Grenade and dynamite start their countdown when you start aiming (the pin comes out, the fuse is lit), and
// it stops again if you stop aiming without throwing; if it runs out in your hand, it goes off there. After
// the throw it carries on counting from where it was. The molotov breaks on whatever it hits first and sets
// the ground around it alight; the smoke grenade pours out smoke shortly after it's thrown.
// The bomb launcher (a gun) fires capsules that fly, bounce and go off the same way.

export type ThrowKind = 'grenade' | 'dynamite' | 'molotov' | 'smoke' // carried, in slot 4
export const THROW_KINDS: ThrowKind[] = ['grenade', 'dynamite', 'molotov', 'smoke']
export type ProjectileKind = ThrowKind | 'capsule' // anything flying: throwables, and the bomb launcher's capsules

// How far (m) a throw can reach, at its best angle (45°) over flat ground
export const THROW_REACH = 50
// The speed that carries something `reach` metres at best, under `gravity` (m/s²)
export const launchSpeed = (reach: number, gravity: number) => Math.sqrt(reach * gravity)

// Throws (and the bomb launcher's lobs) go off well above where the camera looks, which never moves for them:
// looking as far up as the camera goes (about level) sends them off at 45°, as far as they go, and looking
// further down throws them shorter
const LOFT = 0.82 // radians
const BEST = Math.PI / 4

// The velocity to throw at, `speed` m/s, given the direction the camera `look`s in
export function lobVelocity(look: THREE.Vector3, speed: number, out: THREE.Vector3) {
  const yaw = Math.atan2(look.x, look.z)
  const pitch = Math.min(Math.asin(THREE.MathUtils.clamp(look.y, -1, 1)) + LOFT, BEST)
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(speed)
}

// The state a throwable shows, changed in place while it's held or flying: the pin pulled, the spoon gone
// (thrown), alight (the dynamite's fuse, the molotov's rag), and how much of the fuse is left (0..1)
export type Live = { armed: boolean; spent: boolean; lit: boolean; burn: number }
export const freshLive = (): Live => ({ armed: false, spent: false, lit: false, burn: 1 })

export type ThrowSpec = {
  name: string
  Model: ComponentType<{ live?: Live }>
  rarity: string // pedestal glow and hotbar tile colour
  fuse: number | null // seconds from arming (starting to aim) to the blast
  pop?: number // seconds from the throw until the smoke starts
  blast?: { radius: number; damage: number } // falling off from `damage` at the centre to nothing at the edge
  // The ground around the impact catches fire in patches, until they cover `cover` of the circle; anyone
  // standing in the fire takes `damage` every `tick` seconds
  fire?: { radius: number; cover: number; duration: number; damage: number; tick: number }
  smoke?: { radius: number; height: number; duration: number }
  size: number // how far its surface is from its middle, for bouncing and rolling
  bounce: number // how much of its speed into a surface it keeps, bouncing off
  landing: Landing // the sound of it landing
  reach: number // radius of the landing marker while aiming: what it covers
  streamline?: boolean // flies nose first (along its y), rather than tumbling
}

export const THROWABLES: Record<ThrowKind, ThrowSpec> = {
  grenade: {
    name: 'Grenade',
    Model: Grenade,
    rarity: '#4aa8ff',
    fuse: 4,
    blast: { radius: 2, damage: 150 },
    size: 0.09,
    bounce: 0.35,
    landing: 'metal',
    reach: 2,
  },
  dynamite: {
    name: 'Dynamite',
    Model: Dynamite,
    rarity: '#b26bff',
    fuse: 5, // a slow burn
    blast: { radius: 3, damage: 150 },
    size: 0.075,
    bounce: 0.2,
    landing: 'thud',
    reach: 3,
  },
  molotov: {
    name: 'Molotov Cocktail',
    Model: Molotov,
    rarity: '#ff9f2e',
    fuse: null,
    fire: { radius: 3, cover: 0.7, duration: 8, damage: 5, tick: 0.5 },
    size: 0.07,
    bounce: 0,
    landing: 'glass',
    reach: 3,
  },
  smoke: {
    name: 'Smoke Grenade',
    Model: SmokeGrenade,
    rarity: '#9aa3ad',
    fuse: null,
    pop: 1.5,
    smoke: { radius: 5, height: 8, duration: 20 },
    size: 0.065,
    bounce: 0.3,
    landing: 'metal',
    reach: 5,
  },
}

// The bomb launcher's capsule: a small metal bomb that goes off 5 seconds after it's fired, wherever it has
// bounced and rolled to
const CAPSULE: ThrowSpec = {
  name: 'Bomb Capsule',
  Model: Capsule,
  rarity: '#9aa3ad',
  fuse: 5,
  blast: { radius: 2, damage: 100 },
  size: 0.04,
  bounce: 0.35,
  landing: 'metal',
  reach: 2,
  streamline: true,
}

export const PROJECTILES: Record<ProjectileKind, ThrowSpec> = { ...THROWABLES, capsule: CAPSULE }
