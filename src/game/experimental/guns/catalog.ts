import type { ComponentType } from 'react'
import { lowCarry, oneHandAim, pairAim, pairCarry, shoulderCarry, sideOnAim, type Pose } from './holding'
import {
  AssaultRifle,
  BombLauncher,
  BurstSMG,
  DrumShotgun,
  DualPistols,
  DualPistolsHeld,
  HeavyAssaultRifle,
  PumpShotgun,
  RocketLauncher,
  BoltActionSniperRifle,
  SemiAutoSniperRifle,
  Shotgun,
  SuppressedSniperRifle,
  SuppressedSMG,
  TacticalAssaultRifle,
} from './models'
import type { ShotSound } from './sounds'
import { PROJECTILES } from './throwables/catalog'

// Everything about each gun in one place: display name, rarity colour, ammo, how it's carried and aimed,
// and a flat side-view silhouette for the hotbar icon.

// Light ammo (SMGs, pistols), medium ammo (assault rifles), shells (shotguns), heavy ammo (snipers), rockets,
// and the bomb launcher's capsules
export type AmmoKind = 'light' | 'medium' | 'shells' | 'heavy' | 'rockets' | 'capsules'

// Hotbar icon: flat shapes in the gun's own side-view coordinates (the same numbers as the 3D model)
export type IconShape =
  | { rect: [number, number, number, number]; color: string } // x0, y0, x1, y1
  | { poly: [number, number][]; color: string }
  | { circle: [number, number, number]; color: string } // cx, cy, r

// How a gun fires. Holding the trigger repeats at `interval`. Damage is per bullet (per pellet for shotguns).
export type Recoil = 'none' | 'minimal' | 'slight' | 'medium' | 'strong'
export type FireSpec = {
  interval: number // seconds between shots (between bursts, for burst fire)
  damage: number
  headshot: number
  reload: number // seconds
  recoil: Recoil
  // Shotguns: pellets per shot, inside a cone this wide (radians); `even` spreads them evenly over the whole
  // cone (rather than at random)
  pellets?: { count: number; spread: number; even?: boolean }
  burst?: { count: number; gap: number } // rounds per trigger pull, seconds apart
  rocket?: { speed: number; radius: number } // a projectile that explodes: blast radius (m), falling off to 0
  // Lobs bomb capsules (./throwables) along the way it's aimed, fast enough to carry `reach` metres at best:
  // they bounce and roll, and go off a while after they're fired
  alternate?: boolean // a pair: the two guns take turns
  single?: boolean // one shot per click (holding the trigger doesn't repeat)
  bolt?: boolean // the bolt is worked by hand after every shot (over `interval`)
  scope?: number // aiming looks through a scope of this magnification
  suppressed?: boolean // no muzzle flash
  lob?: { reach: number }
}

export type GunSpec = {
  name: string
  // On the pedestal (and in the hands, unless HeldModel says otherwise). `loaded`: whether a round shows
  // (the rocket launcher's warhead is the round itself)
  // `held`: this copy is the one in the character's hands (moving parts like a bolt follow the shooting)
  Model: ComponentType<{ loaded?: boolean; held?: boolean }>
  HeldModel?: ComponentType<{ loaded?: boolean; held?: boolean }>
  muzzle: [number, number] // where shots leave the gun, on its side outline (before GUN_SCALE)
  fire: FireSpec
  sound: ShotSound // what a shot sounds like (./sounds)
  rarity: string // pedestal glow and hotbar tile colour
  ammo: AmmoKind
  magazine: number
  reserve: number
  carry: Pose
  aim: Pose
  icon: IconShape[]
}

// One pistol's silhouette, and a helper to offset a copy (for the pair)
const PISTOL_ICON: IconShape[] = [
  { poly: [[-0.16, 0], [-0.08, 0], [-0.1, -0.2], [-0.12, -0.22], [-0.19, -0.21]], color: '#2a2b2e' },
  { rect: [-0.08, -0.0045, 0.22, 0.0305], color: '#3d4046' },
  { rect: [-0.16, 0.0275, 0.24, 0.1125], color: '#b9bec6' },
]
function shifted(shapes: IconShape[], dx: number, dy: number): IconShape[] {
  return shapes.map((s) => {
    if ('rect' in s) return { ...s, rect: [s.rect[0] + dx, s.rect[1] + dy, s.rect[2] + dx, s.rect[3] + dy] }
    if ('circle' in s) return { ...s, circle: [s.circle[0] + dx, s.circle[1] + dy, s.circle[2]] }
    return { ...s, poly: s.poly.map(([x, y]): [number, number] => [x + dx, y + dy]) }
  })
}

// Grip points are on the gun's side outline: the pistol grip (or stock wrist) and, for two hands, the
// handguard. Rifles and the shotgun ride on the shoulder and aim side-on with both hands; the SMGs are
// carried low in one hand. Dual pistols are carried low and aimed forward, one in each hand. The rocket
// launcher is longer than the assault rifles. The snipers are the longest guns, carried on the shoulder,
// and aimed through their scopes. The bomb launcher is carried and aimed like a rifle, its foregrip in the
// left hand. The suppressed SMG is long enough to aim with both hands; the burst SMG aims
// one-handed.
export const GUNS: GunSpec[] = [
  {
    name: 'M16',
    muzzle: [0.79, 0.055],
    fire: { interval: 0.24, damage: 30, headshot: 35, reload: 2.2, recoil: 'minimal' },
    sound: 'rifle',
    Model: AssaultRifle,
    rarity: '#5bd45b',
    ammo: 'medium',
    magazine: 30,
    reserve: 120,
    carry: shoulderCarry([-0.21, -0.1]),
    aim: sideOnAim([-0.21, -0.1], [0.36, 0.05]),
    icon: [
      { poly: [[-0.64, -0.13], [-0.64, 0.06], [-0.56, 0.065], [-0.42, 0.05], [-0.42, -0.02], [-0.5, -0.04], [-0.58, -0.13]], color: '#3a3d42' },
      { rect: [-0.44, 0.006, -0.28, 0.054], color: '#3a3d42' },
      { rect: [0.4, 0.038, 0.72, 0.072], color: '#5d6168' },
      { rect: [0.72, 0.029, 0.79, 0.081], color: '#3a3d42' },
      { poly: [[0.43, 0.05], [0.5, 0.05], [0.475, 0.21], [0.455, 0.21]], color: '#5d6168' },
      { rect: [0.12, 0.007, 0.4, 0.103], color: '#3a3d42' },
      { poly: [[-0.045, -0.06], [0.045, -0.06], [0.06, -0.19], [0.09, -0.3], [0.01, -0.31], [-0.02, -0.2]], color: '#3a3d42' },
      { poly: [[-0.24, -0.03], [-0.17, -0.03], [-0.19, -0.2], [-0.22, -0.22], [-0.28, -0.21]], color: '#3a3d42' },
      { rect: [-0.28, -0.04, 0.02, 0.04], color: '#5d6168' },
      { rect: [-0.28, 0.035, 0.12, 0.105], color: '#5d6168' },
      { rect: [-0.25, 0.16, 0.01, 0.19], color: '#5d6168' },
      { rect: [-0.255, 0.095, -0.215, 0.165], color: '#5d6168' },
      { rect: [-0.035, 0.095, -0.005, 0.165], color: '#5d6168' },
    ],
  },
  {
    name: 'Suppressed SMG',
    muzzle: [0.555, 0.04],
    fire: { interval: 0.1, damage: 12, headshot: 15, reload: 2.2, recoil: 'minimal' },
    sound: 'suppressedSmg',
    Model: SuppressedSMG,
    rarity: '#3fa9f5',
    ammo: 'light',
    magazine: 30,
    reserve: 180,
    carry: lowCarry([-0.13, -0.1]),
    aim: sideOnAim([-0.13, -0.1], [0.44, 0.04]),
    icon: [
      { rect: [-0.43, 0.036, -0.23, 0.054], color: '#3d4046' },
      { rect: [-0.43, -0.019, -0.23, -0.001], color: '#3d4046' },
      { rect: [-0.455, -0.075, -0.425, 0.095], color: '#2a2c30' },
      { rect: [0.07, -0.018, 0.53, 0.098], color: '#2a2c30' },
      { rect: [0.53, -0.018, 0.551, 0.098], color: '#c8c0ad' },
      { poly: [[-0.01, -0.03], [0.05, -0.03], [0.07, -0.13], [0.11, -0.24], [0.15, -0.32], [0.09, -0.35], [0.05, -0.26], [0.02, -0.16], [0, -0.08]], color: '#2a2c30' },
      { poly: [[-0.16, -0.03], [-0.09, -0.03], [-0.11, -0.19], [-0.14, -0.21], [-0.2, -0.2]], color: '#2a2c30' },
      { rect: [-0.23, -0.035, 0.07, 0.09], color: '#34373c' },
      { rect: [-0.21, 0.09, -0.19, 0.14], color: '#3d4046' },
    ],
  },
  {
    name: 'Heavy Assault Rifle',
    muzzle: [0.735, 0.03],
    fire: { interval: 0.4, damage: 40, headshot: 47, reload: 2.8, recoil: 'slight' },
    sound: 'heavyRifle',
    Model: HeavyAssaultRifle,
    rarity: '#b45cff',
    ammo: 'medium',
    magazine: 25,
    reserve: 100,
    carry: shoulderCarry([-0.18, -0.1]),
    aim: sideOnAim([-0.18, -0.1], [0.38, 0.035]),
    icon: [
      { poly: [[-0.66, -0.14], [-0.66, 0.05], [-0.6, 0.075], [-0.32, 0.08], [-0.3, 0.01], [-0.36, -0.03], [-0.52, -0.06], [-0.6, -0.14]], color: '#56613f' },
      { rect: [-0.685, -0.135, -0.655, 0.065], color: '#232528' },
      { rect: [0.42, 0.012, 0.64, 0.048], color: '#35383d' },
      { rect: [0.625, -0.002, 0.735, 0.062], color: '#232528' },
      { rect: [0.46, 0.075, 0.48, 0.2], color: '#232528' },
      { rect: [0.12, -0.015, 0.42, 0.085], color: '#232528' },
      { rect: [0.22, 0.0025, 0.38, 0.0375], color: '#8f949b' },
      { poly: [[-0.02, -0.02], [0.09, -0.02], [0.12, -0.12], [0.17, -0.21], [0.23, -0.29], [0.14, -0.34], [0.08, -0.25], [0.03, -0.15], [0, -0.07]], color: '#232528' },
      { poly: [[-0.2, -0.02], [-0.13, -0.02], [-0.15, -0.2], [-0.18, -0.23], [-0.24, -0.22]], color: '#232528' },
      { rect: [-0.31, -0.025, 0.13, 0.085], color: '#232528' },
      { rect: [-0.31, 0.05, -0.05, 0.1], color: '#56613f' },
      { rect: [-0.11, 0.085, 0.39, 0.105], color: '#232528' },
    ],
  },
  {
    name: 'Burst SMG',
    muzzle: [0.425, 0.07],
    fire: { interval: 0.45, damage: 13, headshot: 17, reload: 2, recoil: 'minimal', burst: { count: 3, gap: 0.08 } },
    sound: 'smg',
    Model: BurstSMG,
    rarity: '#ffb627',
    ammo: 'light',
    magazine: 24,
    reserve: 144,
    carry: lowCarry([-0.1, -0.1]),
    aim: oneHandAim([-0.1, -0.1]),
    icon: [
      { rect: [-0.4, 0.045, -0.22, 0.075], color: '#26282b' },
      { poly: [[-0.46, -0.08], [-0.46, 0.1], [-0.38, 0.1], [-0.38, 0.02], [-0.42, -0.08]], color: '#e8e6e1' },
      { rect: [0.22, 0.051, 0.36, 0.089], color: '#26282b' },
      { rect: [0.355, 0.042, 0.425, 0.098], color: '#6b6d70' },
      { rect: [0.1, -0.38, 0.18, -0.18], color: '#26282b' },
      { rect: [0.09, -0.405, 0.19, -0.375], color: '#26282b' },
      { poly: [[-0.14, 0], [-0.06, 0], [-0.07, -0.2], [-0.09, -0.22], [-0.15, -0.21], [-0.15, -0.1]], color: '#e8e6e1' },
      { poly: [[-0.22, 0], [-0.22, 0.1], [-0.18, 0.13], [0.18, 0.13], [0.22, 0.09], [0.22, -0.02], [0.2, -0.18], [0.08, -0.18], [0.07, -0.02], [-0.08, 0]], color: '#e8e6e1' },
      { rect: [-0.17, 0.13, 0.17, 0.15], color: '#26282b' },
    ],
  },
  {
    name: 'Sovereign Shotgun',
    muzzle: [0.72, 0.045],
    fire: { interval: 0.7, damage: 15, headshot: 17, reload: 3, recoil: 'slight', pellets: { count: 8, spread: 0.045 } },
    sound: 'shotgun',
    Model: Shotgun,
    rarity: '#d9dde3',
    ammo: 'shells',
    magazine: 6,
    reserve: 30,
    carry: shoulderCarry([-0.33, -0.02]),
    aim: sideOnAim([-0.33, -0.02], [0.2, -0.005]),
    icon: [
      { poly: [[-0.72, -0.13], [-0.72, 0.03], [-0.64, 0.05], [-0.32, 0.035], [-0.3, -0.01], [-0.36, -0.04], [-0.42, -0.035], [-0.47, -0.07], [-0.52, -0.1], [-0.62, -0.13]], color: '#5e646b' },
      { rect: [-0.745, -0.135, -0.715, 0.035], color: '#1f2124' },
      { rect: [-0.67, -0.105, -0.53, -0.035], color: '#3b2f28' },
      { rect: [-0.02, 0.019, 0.7, 0.071], color: '#1f2124' },
      { rect: [-0.01, 0.083, 0.69, 0.093], color: '#1f2124' },
      { rect: [0, -0.02, 0.6, 0.02], color: '#3a3d42' },
      { rect: [0.68, 0.014, 0.72, 0.076], color: '#1f2124' },
      { poly: [[0.02, -0.04], [0.3, -0.04], [0.32, -0.02], [0.3, 0.03], [0.02, 0.03], [0, 0]], color: '#5e646b' },
      { rect: [-0.3, -0.035, -0.02, 0.065], color: '#3a3d42' },
      { rect: [-0.24, -0.005, -0.12, 0.045], color: '#9aa0a6' },
    ],
  },
  {
    name: 'Tactical Assault Rifle',
    muzzle: [0.8, 0.06],
    fire: { interval: 0.4, damage: 35, headshot: 41, reload: 2.5, recoil: 'slight' },
    sound: 'rifle',
    Model: TacticalAssaultRifle,
    rarity: '#ffb627',
    ammo: 'medium',
    magazine: 30,
    reserve: 120,
    carry: shoulderCarry([-0.2, -0.12]),
    aim: sideOnAim([-0.2, -0.12], [0.3, 0.02]),
    icon: [
      { poly: [[-0.66, -0.14], [-0.66, 0.06], [-0.6, 0.08], [-0.34, 0.075], [-0.34, -0.01], [-0.5, -0.04], [-0.58, -0.14]], color: '#c9b27c' },
      { rect: [-0.6925, -0.14, -0.6575, 0.06], color: '#232528' },
      { rect: [0.34, 0.04, 0.72, 0.08], color: '#35383d' },
      { rect: [0.72, 0.03, 0.8, 0.09], color: '#232528' },
      { poly: [[-0.02, -0.05], [0.08, -0.05], [0.1, -0.17], [0.14, -0.3], [0.06, -0.32], [0.02, -0.18]], color: '#8f949b' },
      { poly: [[-0.22, -0.04], [-0.15, -0.04], [-0.17, -0.22], [-0.2, -0.24], [-0.26, -0.23]], color: '#232528' },
      { rect: [-0.28, -0.05, 0.02, 0.02], color: '#a8925f' },
      { rect: [-0.34, 0, 0.34, 0.12], color: '#c9b27c' },
      { rect: [0.005, 0.069, 0.095, 0.091], color: '#232528' },
      { rect: [0.135, 0.069, 0.225, 0.091], color: '#232528' },
      { rect: [-0.32, 0.12, 0.32, 0.14], color: '#232528' },
    ],
  },
  {
    name: 'Drum Shotgun',
    muzzle: [0.74, 0.06],
    fire: { interval: 0.25, damage: 7, headshot: 8, reload: 3.5, recoil: 'slight', pellets: { count: 8, spread: 0.06 } },
    sound: 'shotgun',
    Model: DrumShotgun,
    rarity: '#3fa9f5',
    ammo: 'shells',
    magazine: 10,
    reserve: 40,
    carry: shoulderCarry([-0.2, -0.1]),
    aim: sideOnAim([-0.2, -0.1], [0.36, 0.02]),
    icon: [
      { poly: [[-0.62, -0.15], [-0.62, 0.05], [-0.32, 0.075], [-0.3, 0], [-0.46, -0.03], [-0.53, -0.15]], color: '#2b2d31' },
      { rect: [-0.645, -0.155, -0.615, 0.055], color: '#232528' },
      { poly: [[-0.22, -0.03], [-0.15, -0.03], [-0.17, -0.21], [-0.2, -0.23], [-0.26, -0.22]], color: '#232528' },
      { rect: [0.62, 0.008, 0.74, 0.112], color: '#4a4d53' },
      { rect: [-0.32, -0.03, 0.02, 0.1], color: '#2b2d31' },
      { rect: [-0.2, -0.01, -0.04, 0.05], color: '#4a4d53' },
      { rect: [0, -0.02, 0.62, 0.13], color: '#2b2d31' },
      { rect: [0.26, 0.02, 0.46, 0.05], color: '#4a4d53' },
      { rect: [-0.23, 0.13, 0.55, 0.15], color: '#232528' },
      { circle: [0.1, -0.2, 0.14], color: '#9c2a24' },
      { circle: [0.1, -0.2, 0.1], color: '#55585e' },
      { circle: [0.1, -0.2, 0.03], color: '#4a4d53' },
    ],
  },
  {
    name: 'Pump Shotgun',
    muzzle: [0.75, 0.045],
    fire: { interval: 1, damage: 4, headshot: 5, reload: 2.8, recoil: 'slight', pellets: { count: 24, spread: 0.06, even: true } },
    sound: 'shotgun',
    Model: PumpShotgun,
    rarity: '#5bd45b',
    ammo: 'shells',
    magazine: 5,
    reserve: 25,
    carry: shoulderCarry([-0.33, -0.03]),
    aim: sideOnAim([-0.33, -0.03], [0.27, -0.004]),
    icon: [
      { poly: [[-0.72, -0.14], [-0.72, 0.03], [-0.62, 0.05], [-0.34, 0.04], [-0.3, -0.01], [-0.4, -0.05], [-0.5, -0.06], [-0.6, -0.14]], color: '#8a5a33' },
      { rect: [-0.7525, -0.145, -0.7175, 0.035], color: '#232528' },
      { rect: [0, 0.019, 0.75, 0.071], color: '#232528' },
      { rect: [0, -0.03, 0.6, 0.014], color: '#232528' },
      { rect: [0.72, 0.068, 0.74, 0.1], color: '#232528' },
      { rect: [0.13, -0.048, 0.41, 0.04], color: '#8a5a33' },
      { rect: [-0.3, -0.04, 0, 0.07], color: '#6a6e75' },
      { rect: [-0.22, 0.07, -0.18, 0.11], color: '#232528' },
    ],
  },
  {
    name: 'Dual Pistols',
    muzzle: [0.25, 0.075],
    fire: { interval: 0.3, damage: 32, headshot: 38, reload: 2, recoil: 'minimal', alternate: true },
    sound: 'pistol',
    Model: DualPistols,
    HeldModel: DualPistolsHeld,
    rarity: '#d9dde3',
    ammo: 'light',
    magazine: 32,
    reserve: 96,
    carry: pairCarry([-0.13, -0.1]),
    aim: pairAim([-0.13, -0.1]),
    icon: [...shifted(PISTOL_ICON, 0.1, 0.08), ...PISTOL_ICON],
  },
  {
    name: 'Rocket Launcher',
    muzzle: [0.6, 0],
    fire: { interval: 0.5, damage: 150, headshot: 200, reload: 3, recoil: 'strong', rocket: { speed: 25, radius: 2 } },
    sound: 'rocket',
    Model: RocketLauncher,
    rarity: '#b45cff',
    ammo: 'rockets',
    magazine: 1,
    reserve: 6,
    carry: shoulderCarry([-0.26, -0.12]),
    aim: sideOnAim([-0.26, -0.12], [0.18, 0]),
    icon: [
      { poly: [[-0.9, -0.11], [-0.75, -0.055], [-0.75, 0.055], [-0.9, 0.11]], color: '#262729' },
      { rect: [-0.75, -0.055, 0.3, 0.055], color: '#262729' },
      { rect: [-0.57, -0.064, -0.33, 0.064], color: '#8a5a33' },
      { rect: [0.02, -0.064, 0.18, 0.064], color: '#8a5a33' },
      { poly: [[-0.28, -0.05], [-0.21, -0.05], [-0.23, -0.21], [-0.26, -0.23], [-0.32, -0.22]], color: '#232528' },
      { poly: [[-0.02, -0.05], [0.06, -0.05], [0.05, -0.2], [0.02, -0.22], [-0.03, -0.2]], color: '#8a5a33' },
      { rect: [-0.26, 0.055, -0.14, 0.125], color: '#232528' },
      { rect: [0.31, -0.035, 0.41, 0.035], color: '#5c6068' },
      { rect: [0.41, -0.05, 0.46, 0.05], color: '#e0782a' },
      { poly: [[0.46, -0.06], [0.59, -0.105], [0.91, -0.035], [0.91, 0.035], [0.59, 0.105], [0.46, 0.06]], color: '#6b7a2a' },
      { poly: [[0.62, -0.06], [0.86, -0.012], [0.62, 0.025]], color: '#ffffff' },
      { poly: [[0.64, -0.045], [0.83, -0.012], [0.64, 0.012]], color: '#b0282a' },
      { rect: [0.91, -0.03, 0.96, 0.03], color: '#5c6068' },
    ],
  },
  {
    name: 'Semi-Auto Sniper Rifle',
    Model: SemiAutoSniperRifle,
    rarity: '#3fa9f5',
    muzzle: [1.055, 0.02],
    fire: { interval: 0.5, damage: 100, headshot: 250, reload: 3, recoil: 'medium', scope: 4 },
    sound: 'sniper',
    ammo: 'heavy',
    magazine: 10,
    reserve: 30,
    carry: shoulderCarry([-0.23, -0.12]),
    aim: sideOnAim([-0.23, -0.12], [0.3, 0.01]),
    icon: [
      { rect: [-0.75, -0.2, -0.72, 0], color: '#aab0b6' },
      { poly: [[-0.34, 0.03], [-0.72, -0.04], [-0.72, -0.015], [-0.34, 0.05]], color: '#aab0b6' },
      { poly: [[-0.34, -0.06], [-0.72, -0.18], [-0.72, -0.155], [-0.34, -0.04]], color: '#aab0b6' },
      { rect: [0.4, -0.015, 1.055, 0.055], color: '#2a2c30' },
      { rect: [-0.1, -0.2, 0, -0.04], color: '#7a8078' },
      { poly: [[-0.24, -0.04], [-0.17, -0.04], [-0.19, -0.22], [-0.22, -0.24], [-0.28, -0.23]], color: '#8a5a33' },
      { rect: [-0.34, -0.04, 0.14, 0.09], color: '#5d6560' },
      { rect: [0.02, -0.05, 0.4, 0.07], color: '#8a5a33' },
      { rect: [-0.24, 0.09, -0.19, 0.15], color: '#1e2023' },
      { rect: [-0.03, 0.09, 0.02, 0.15], color: '#1e2023' },
      { poly: [[-0.3, 0.144], [-0.38, 0.128], [-0.38, 0.232], [-0.3, 0.216]], color: '#1f2124' },
      { rect: [-0.3, 0.144, 0.08, 0.216], color: '#1f2124' },
      { poly: [[0.08, 0.144], [0.2, 0.105], [0.2, 0.255], [0.08, 0.216]], color: '#1f2124' },
      { rect: [0.2, 0.11, 0.23, 0.25], color: '#3d7bd6' },
    ],
  },
  {
    name: 'Suppressed Sniper Rifle',
    Model: SuppressedSniperRifle,
    rarity: '#b45cff',
    muzzle: [1.115, 0.065],
    fire: { interval: 1, damage: 90, headshot: 225, reload: 2, recoil: 'none', single: true, bolt: true, scope: 4, suppressed: true },
    sound: 'suppressedSniper',
    ammo: 'heavy',
    magazine: 5,
    reserve: 20,
    carry: shoulderCarry([-0.24, -0.14]),
    aim: sideOnAim([-0.24, -0.14], [0.25, -0.01]),
    icon: [
      {
        poly: [
          [-0.78, -0.17],
          [-0.78, 0.06],
          [-0.62, 0.07],
          [-0.46, 0.05],
          [-0.32, 0.03],
          [0.34, 0.03],
          [0.36, -0.01],
          [0.33, -0.05],
          [-0.08, -0.05],
          [-0.16, -0.08],
          [-0.2, -0.22],
          [-0.28, -0.23],
          [-0.31, -0.12],
          [-0.5, -0.1],
          [-0.64, -0.11],
          [-0.7, -0.17],
        ],
        color: '#c9b27c',
      },
      { poly: [[-0.44, -0.02], [-0.34, -0.02], [-0.32, -0.08], [-0.36, -0.09], [-0.44, -0.07]], color: '#5a4d34' },
      { rect: [-0.8125, -0.175, -0.7775, 0.065], color: '#1e2023' },
      { rect: [-0.64, 0.07, -0.48, 0.1], color: '#1e2023' },
      { rect: [-0.34, 0.03, 0.1, 0.1], color: '#6d7278' },
      { rect: [0.1, 0.045, 0.62, 0.085], color: '#a7adb4' },
      { rect: [0.62, 0.015, 1.11, 0.115], color: '#1e2023' },
      { rect: [-0.055, -0.105, 0.035, -0.05], color: '#1e2023' },
      { rect: [-0.24, 0.1, -0.19, 0.15], color: '#1e2023' },
      { rect: [-0.05, 0.1, 0, 0.15], color: '#1e2023' },
      { poly: [[-0.3, 0.147], [-0.38, 0.132], [-0.38, 0.228], [-0.3, 0.213]], color: '#1e2023' },
      { rect: [-0.3, 0.147, 0.06, 0.213], color: '#1e2023' },
      { poly: [[0.06, 0.147], [0.18, 0.115], [0.18, 0.245], [0.06, 0.213]], color: '#1e2023' },
      { rect: [0.18, 0.12, 0.2, 0.24], color: '#2f5d9e' },
    ],
  },
  {
    name: 'Bolt-Action Sniper Rifle',
    Model: BoltActionSniperRifle,
    rarity: '#ffb627',
    muzzle: [1.0, 0.05],
    fire: { interval: 1, damage: 95, headshot: 238, reload: 2, recoil: 'medium', single: true, bolt: true, scope: 5 },
    sound: 'sniper',
    ammo: 'heavy',
    magazine: 5,
    reserve: 20,
    carry: shoulderCarry([-0.25, -0.12]),
    aim: sideOnAim([-0.25, -0.12], [0.36, 0.04]),
    icon: [
      { poly: [[-0.78, -0.17], [-0.78, 0.07], [-0.66, 0.1], [-0.46, 0.1], [-0.44, 0.03], [-0.34, 0.03], [-0.34, -0.02], [-0.5, -0.05], [-0.62, -0.07], [-0.66, -0.17]], color: '#1e2023' },
      { rect: [-0.8125, -0.175, -0.7775, 0.075], color: '#1e2023' },
      { rect: [0.58, 0.028, 0.9, 0.072], color: '#4a4e55' },
      { rect: [0.9, 0.016, 1.0, 0.084], color: '#2a2c30' },
      { rect: [-0.05, -0.16, 0.05, -0.03], color: '#1e2023' },
      { poly: [[-0.26, -0.03], [-0.19, -0.03], [-0.21, -0.21], [-0.24, -0.23], [-0.3, -0.22]], color: '#1e2023' },
      { rect: [-0.34, -0.03, 0.04, 0.08], color: '#3a3d42' },
      { rect: [0.04, -0.02, 0.58, 0.1], color: '#6f747c' },
      { rect: [0.07, 0.004, 0.13, 0.026], color: '#1e2023' },
      { rect: [0.25, 0.004, 0.31, 0.026], color: '#1e2023' },
      { rect: [0.43, 0.004, 0.49, 0.026], color: '#1e2023' },
      { rect: [0.16, 0.054, 0.22, 0.076], color: '#1e2023' },
      { rect: [0.34, 0.054, 0.4, 0.076], color: '#1e2023' },
      { rect: [-0.3, 0.1, 0.58, 0.12], color: '#1e2023' },
      { rect: [-0.225, 0.12, -0.175, 0.19], color: '#1e2023' },
      { rect: [0.035, 0.12, 0.085, 0.19], color: '#1e2023' },
      { poly: [[-0.28, 0.172], [-0.375, 0.155], [-0.375, 0.265], [-0.28, 0.248]], color: '#26282c' },
      { rect: [-0.28, 0.172, 0.14, 0.248], color: '#26282c' },
      { poly: [[0.14, 0.172], [0.26, 0.14], [0.26, 0.28], [0.14, 0.248]], color: '#26282c' },
    ],
  },
  {
    // Each capsule's blast (see ./throwables) does the damage
    name: 'Bomb Launcher',
    muzzle: [0.65, 0.07],
    fire: {
      interval: 0.8,
      damage: PROJECTILES.capsule.blast!.damage,
      headshot: PROJECTILES.capsule.blast!.damage,
      reload: 3,
      recoil: 'slight',
      lob: { reach: 50 },
    },
    sound: 'launcher',
    Model: BombLauncher,
    rarity: '#f5a623',
    ammo: 'capsules',
    magazine: 6,
    reserve: 18,
    carry: shoulderCarry([-0.22, -0.1]),
    aim: sideOnAim([-0.22, -0.1], [0.4, -0.12]),
    icon: [
      { rect: [-0.74, -0.13, -0.68, 0.09], color: '#c9a46a' },
      { rect: [-0.69, 0.005, -0.35, 0.055], color: '#c9a46a' },
      { rect: [-0.5, 0, -0.46, 0.06], color: '#b3262a' },
      { rect: [-0.35, -0.045, -0.13, 0.085], color: '#c9a46a' },
      { rect: [-0.33, 0.085, -0.07, 0.125], color: '#3a3230' },
      { poly: [[-0.25, -0.04], [-0.18, -0.04], [-0.2, -0.2], [-0.23, -0.22], [-0.29, -0.21]], color: '#2a2a2c' },
      { rect: [-0.13, -0.18, 0.09, 0.12], color: '#c9a46a' },
      { rect: [-0.05, -0.18, 0.01, 0.12], color: '#3a3230' },
      { rect: [0.09, 0.015, 0.56, 0.125], color: '#3a3230' },
      { rect: [0.55, -0.002, 0.65, 0.142], color: '#3a3230' },
      { rect: [0.33, 0.005, 0.43, 0.135], color: '#c9a46a' },
      { rect: [0.355, 0.135, 0.405, 0.205], color: '#a4814b' },
      { poly: [[0.37, -0.01], [0.43, -0.01], [0.48, -0.2], [0.42, -0.21]], color: '#2a2a2c' },
    ],
  },
]
