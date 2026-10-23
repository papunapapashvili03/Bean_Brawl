import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { inHand } from './inHand'
import { offhand } from './offhand'
import { Part } from './Part'
import { GUN_SCALE, camo, shark } from './parts'

// The guns, each in its own space: muzzle towards +x, top towards +y, about 1-1.4 long before the
// chunky GUN_SCALE (the character is 2 tall). Side outlines are extruded profiles; round parts are rods along x.

const BLACK = '#232528'
const GUNMETAL = '#35383d'
const HALF_PI = Math.PI / 2

// Rows of small blocks along the top of a rail, from x0 in steps of `pitch`
function RailTeeth({ x0, count, pitch, y, color }: { x0: number; count: number; pitch: number; y: number; color: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Part key={i} shape={{ box: [pitch * 0.45, 0.014, 0.052] }} color={color} at={[x0 + i * pitch, y, 0]} />
      ))}
    </>
  )
}

// Trigger guard (a half ring under the receiver) and trigger
function TriggerGroup({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <>
      <Part shape={{ ring: [0.034, 0.007, Math.PI] }} color={color} at={[x, y, 0]} rot={[0, 0, Math.PI]} />
      <Part shape={{ box: [0.012, 0.04, 0.012] }} color={BLACK} at={[x - 0.005, y - 0.012, 0]} rot={[0, 0, 0.2]} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Heavy assault rifle: black with olive furniture, a curved magazine with grey windows, a railed
// handguard with grey side panels, a tall front sight and a slotted muzzle brake

export function HeavyAssaultRifle() {
  const olive = '#56613f'
  const stripe = '#8f949b'
  const magAngle = -1.09 // the magazine curves forward and down at this slope
  return (
    <group scale={GUN_SCALE}>
      {/* Stock and butt pad */}
      <Part
        shape={{
          profile: [
            [-0.66, -0.14],
            [-0.66, 0.05],
            [-0.6, 0.075],
            [-0.32, 0.08],
            [-0.3, 0.01],
            [-0.36, -0.03],
            [-0.52, -0.06],
            [-0.6, -0.14],
          ],
          depth: 0.06,
        }}
        color={olive}
      />
      <Part shape={{ box: [0.03, 0.2, 0.068] }} color={BLACK} at={[-0.67, -0.035, 0]} />
      {/* Receiver with an olive upper at the back and a rear sight */}
      <Part shape={{ box: [0.44, 0.11, 0.074] }} color={BLACK} at={[-0.09, 0.03, 0]} />
      <Part shape={{ box: [0.26, 0.05, 0.078] }} color={olive} at={[-0.18, 0.075, 0]} />
      <Part shape={{ box: [0.035, 0.05, 0.035] }} color={BLACK} at={[-0.26, 0.12, 0]} />
      {/* Top rail over the receiver front and handguard */}
      <Part shape={{ box: [0.5, 0.02, 0.05] }} color={BLACK} at={[0.14, 0.095, 0]} />
      <RailTeeth x0={-0.09} count={10} pitch={0.05} y={0.11} color={BLACK} />
      {/* Handguard with grey side panels */}
      <Part shape={{ box: [0.3, 0.1, 0.08] }} color={BLACK} at={[0.27, 0.035, 0]} />
      <Part shape={{ box: [0.16, 0.035, 0.084] }} color={stripe} at={[0.3, 0.02, 0]} />
      {/* Barrel, gas block and tall front sight */}
      <Part shape={{ rod: [0.018, 0.22] }} color={GUNMETAL} at={[0.53, 0.03, 0]} />
      <Part shape={{ rod: [0.016, 0.06] }} color={BLACK} at={[0.45, 0.075, 0]} />
      <Part shape={{ box: [0.045, 0.06, 0.05] }} color={BLACK} at={[0.46, 0.055, 0]} />
      <Part shape={{ box: [0.02, 0.11, 0.02] }} color={BLACK} at={[0.47, 0.13, 0]} />
      <Part shape={{ box: [0.03, 0.03, 0.05] }} color={BLACK} at={[0.47, 0.18, 0]} />
      {/* Muzzle brake with two slots each side */}
      <Part shape={{ rod: [0.032, 0.11] }} color={BLACK} at={[0.68, 0.03, 0]} />
      {[0.66, 0.7].map((x) => (
        <Part key={x} shape={{ box: [0.022, 0.028, 0.068] }} color={GUNMETAL} at={[x, 0.03, 0]} />
      ))}
      {/* Pistol grip and trigger */}
      <Part
        shape={{
          profile: [
            [-0.2, -0.02],
            [-0.13, -0.02],
            [-0.15, -0.2],
            [-0.18, -0.23],
            [-0.24, -0.22],
          ],
          depth: 0.055,
        }}
        color={BLACK}
      />
      <TriggerGroup x={-0.08} y={-0.03} color={BLACK} />
      {/* Curved magazine with grey windows and floorplate */}
      <Part
        shape={{
          profile: [
            [-0.02, -0.02],
            [0.09, -0.02],
            [0.12, -0.12],
            [0.17, -0.21],
            [0.23, -0.29],
            [0.14, -0.34],
            [0.08, -0.25],
            [0.03, -0.15],
            [0.0, -0.07],
          ],
          depth: 0.058,
        }}
        color={BLACK}
      />
      {[
        [0.08, -0.108],
        [0.11, -0.168],
        [0.14, -0.227],
      ].map(([x, y]) => (
        <Part key={x} shape={{ box: [0.05, 0.022, 0.072] }} color={stripe} at={[x, y, 0]} rot={[0, 0, magAngle]} />
      ))}
      <Part shape={{ box: [0.1, 0.025, 0.072] }} color={stripe} at={[0.185, -0.318, 0]} rot={[0, 0, 0.507]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Assault rifle (M4 style): gunmetal, with a carry handle, a ribbed round handguard, a triangular front
// sight, a slightly curved magazine and a flash hider

export function AssaultRifle() {
  const metal = '#4b4e54'
  const dark = '#2e3034'
  return (
    <group scale={GUN_SCALE}>
      {/* Adjustable stock on its buffer tube */}
      <Part
        shape={{
          profile: [
            [-0.64, -0.13],
            [-0.64, 0.06],
            [-0.56, 0.065],
            [-0.42, 0.05],
            [-0.42, -0.02],
            [-0.5, -0.04],
            [-0.58, -0.13],
          ],
          depth: 0.06,
        }}
        color={dark}
      />
      <Part shape={{ rod: [0.024, 0.16] }} color={dark} at={[-0.36, 0.03, 0]} />
      {/* Lower and upper receiver, ejection port, forward assist, charging handle */}
      <Part shape={{ box: [0.3, 0.08, 0.068] }} color={metal} at={[-0.13, 0, 0]} />
      <Part shape={{ box: [0.4, 0.07, 0.07] }} color={metal} at={[-0.08, 0.07, 0]} />
      <Part shape={{ box: [0.08, 0.025, 0.074] }} color={dark} at={[-0.05, 0.07, 0]} />
      <Part shape={{ rod: [0.012, 0.04] }} color={dark} at={[-0.2, 0.08, 0.04]} />
      <Part shape={{ box: [0.04, 0.015, 0.05] }} color={dark} at={[-0.29, 0.1, 0]} />
      {/* Carry handle with rear sight aperture */}
      <Part shape={{ box: [0.26, 0.028, 0.035] }} color={metal} at={[-0.12, 0.175, 0]} />
      <Part shape={{ box: [0.04, 0.07, 0.035] }} color={metal} at={[-0.235, 0.13, 0]} />
      <Part shape={{ box: [0.03, 0.07, 0.035] }} color={metal} at={[-0.02, 0.13, 0]} />
      <Part shape={{ ring: [0.016, 0.005] }} color={dark} at={[-0.235, 0.205, 0]} rot={[0, HALF_PI, 0]} />
      {/* Magwell, magazine, pistol grip, trigger */}
      <Part shape={{ box: [0.1, 0.06, 0.074] }} color={metal} at={[0, -0.05, 0]} />
      <Part
        shape={{
          profile: [
            [-0.045, -0.06],
            [0.045, -0.06],
            [0.06, -0.19],
            [0.09, -0.3],
            [0.01, -0.31],
            [-0.02, -0.2],
          ],
          depth: 0.055,
        }}
        color={dark}
      />
      <Part
        shape={{
          profile: [
            [-0.24, -0.03],
            [-0.17, -0.03],
            [-0.19, -0.2],
            [-0.22, -0.22],
            [-0.28, -0.21],
          ],
          depth: 0.055,
        }}
        color={dark}
      />
      <TriggerGroup x={-0.12} y={-0.04} color={metal} />
      {/* Ribbed round handguard between two end caps */}
      <Part shape={{ rod: [0.048, 0.28] }} color={dark} at={[0.26, 0.055, 0]} />
      {Array.from({ length: 6 }, (_, i) => (
        <Part key={i} shape={{ ring: [0.048, 0.006] }} color={dark} at={[0.15 + i * 0.044, 0.055, 0]} rot={[0, HALF_PI, 0]} />
      ))}
      {[0.12, 0.4].map((x) => (
        <Part key={x} shape={{ rod: [0.054, 0.02] }} color={metal} at={[x, 0.055, 0]} />
      ))}
      {/* Barrel, triangular front sight, flash hider */}
      <Part shape={{ rod: [0.017, 0.32] }} color={metal} at={[0.56, 0.055, 0]} />
      <Part
        shape={{
          profile: [
            [0.43, 0.05],
            [0.5, 0.05],
            [0.475, 0.21],
            [0.455, 0.21],
          ],
          hole: [
            [0.452, 0.085],
            [0.482, 0.085],
            [0.467, 0.165],
          ],
          depth: 0.03,
        }}
        color={metal}
      />
      <Part shape={{ rod: [0.026, 0.07] }} color={dark} at={[0.755, 0.055, 0]} />
      <Part shape={{ box: [0.04, 0.012, 0.056] }} color={metal} at={[0.765, 0.055, 0]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Suppressed SMG: compact round-topped receiver, drum rear sight, a long suppressor with a pale tip,
// a slim curved magazine and a two-strut stock

export function SuppressedSMG() {
  const dark = '#2a2c30'
  const metal = '#3d4046'
  const tip = '#c8c0ad'
  return (
    <group scale={GUN_SCALE}>
      {/* Two-strut stock and butt plate */}
      {[-0.025, 0.025].map((z) => (
        <Part key={z} shape={{ box: [0.2, 0.018, 0.012] }} color={metal} at={[-0.33, 0.045, z]} />
      ))}
      <Part shape={{ box: [0.2, 0.018, 0.012] }} color={metal} at={[-0.33, -0.01, 0]} />
      <Part shape={{ box: [0.03, 0.17, 0.07] }} color={dark} at={[-0.44, 0.01, 0]} />
      {/* Receiver: round top over a boxy lower */}
      <Part shape={{ rod: [0.05, 0.3] }} color={dark} at={[-0.08, 0.04, 0]} />
      <Part shape={{ box: [0.26, 0.06, 0.07] }} color={dark} at={[-0.1, -0.005, 0]} />
      {/* Drum rear sight and hooded front sight */}
      <Part shape={{ box: [0.02, 0.04, 0.02] }} color={metal} at={[-0.2, 0.09, 0]} />
      <Part shape={{ ring: [0.022, 0.008] }} color={metal} at={[-0.2, 0.118, 0]} rot={[0, HALF_PI, 0]} />
      <Part shape={{ box: [0.02, 0.04, 0.02] }} color={metal} at={[0.04, 0.09, 0]} />
      <Part shape={{ ring: [0.02, 0.007] }} color={metal} at={[0.04, 0.115, 0]} rot={[0, HALF_PI, 0]} />
      <Part shape={{ box: [0.03, 0.02, 0.05] }} color={metal} at={[0.0, 0.07, 0.04]} rot={[0, 0, 0.5]} />
      {/* Suppressor with grip rings, a pale end cap and the bore */}
      <Part shape={{ rod: [0.058, 0.46] }} color={dark} at={[0.3, 0.04, 0]} />
      {Array.from({ length: 5 }, (_, i) => (
        <Part key={i} shape={{ ring: [0.058, 0.006] }} color={metal} at={[0.1 + i * 0.025, 0.04, 0]} rot={[0, HALF_PI, 0]} />
      ))}
      <Part shape={{ rod: [0.059, 0.022] }} color={tip} at={[0.54, 0.04, 0]} />
      <Part shape={{ rod: [0.026, 0.006] }} color="#111114" at={[0.552, 0.04, 0]} />
      {/* Grip, trigger housing, trigger */}
      <Part
        shape={{
          profile: [
            [-0.16, -0.03],
            [-0.09, -0.03],
            [-0.11, -0.19],
            [-0.14, -0.21],
            [-0.2, -0.2],
          ],
          depth: 0.055,
        }}
        color={dark}
      />
      <Part shape={{ box: [0.12, 0.03, 0.066] }} color={metal} at={[-0.08, -0.045, 0]} />
      <TriggerGroup x={-0.05} y={-0.06} color={metal} />
      {/* Slim curved magazine with a light base */}
      <Part
        shape={{
          profile: [
            [-0.01, -0.03],
            [0.05, -0.03],
            [0.07, -0.13],
            [0.11, -0.24],
            [0.15, -0.32],
            [0.09, -0.35],
            [0.05, -0.26],
            [0.02, -0.16],
            [0, -0.08],
          ],
          depth: 0.045,
        }}
        color={dark}
      />
      <Part shape={{ box: [0.07, 0.02, 0.05] }} color="#8a8d93" at={[0.12, -0.337, 0]} rot={[0, 0, 0.46]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Burst SMG: a boxy white body with the magazine in a front housing, a ribbed white grip, a black top
// rail with flip sights, a short barrel with a flash hider and a brace stock on a rod

export function BurstSMG() {
  const white = '#e8e6e1'
  const light = '#c4c2bd'
  const grey = '#6b6d70'
  return (
    <group scale={GUN_SCALE}>
      {/* Body with its front housing */}
      <Part
        shape={{
          profile: [
            [-0.22, 0],
            [-0.22, 0.1],
            [-0.18, 0.13],
            [0.18, 0.13],
            [0.22, 0.09],
            [0.22, -0.02],
            [0.2, -0.18],
            [0.08, -0.18],
            [0.07, -0.02],
            [-0.08, 0],
          ],
          depth: 0.09,
        }}
        color={white}
      />
      {/* Panel lines, side screw and charging bar */}
      <Part shape={{ box: [0.2, 0.008, 0.096] }} color={light} at={[-0.02, 0.06, 0]} />
      <Part shape={{ box: [0.008, 0.1, 0.096] }} color={light} at={[0.12, -0.08, 0]} />
      {[-1, 1].map((s) => (
        <Part key={s} shape={{ ring: [0.018, 0.005] }} color={grey} at={[0.17, 0.08, s * 0.05]} />
      ))}
      <Part shape={{ box: [0.12, 0.018, 0.1] }} color={BLACK} at={[-0.07, 0.09, 0]} />
      {/* Top rail with flip sights */}
      <Part shape={{ box: [0.34, 0.02, 0.05] }} color={BLACK} at={[0, 0.14, 0]} />
      <RailTeeth x0={-0.15} count={7} pitch={0.045} y={0.155} color={BLACK} />
      <Part shape={{ box: [0.03, 0.05, 0.045] }} color={BLACK} at={[-0.16, 0.175, 0]} />
      <Part shape={{ box: [0.03, 0.05, 0.045] }} color={BLACK} at={[0.15, 0.175, 0]} />
      {/* Barrel and flash hider */}
      <Part shape={{ rod: [0.019, 0.14] }} color={BLACK} at={[0.29, 0.07, 0]} />
      <Part shape={{ rod: [0.028, 0.07] }} color={grey} at={[0.39, 0.07, 0]} />
      {/* Magazine and base plate */}
      <Part shape={{ box: [0.08, 0.2, 0.06] }} color={BLACK} at={[0.14, -0.28, 0]} />
      <Part shape={{ box: [0.1, 0.03, 0.07] }} color={BLACK} at={[0.14, -0.39, 0]} />
      {/* Ribbed grip and trigger */}
      <Part
        shape={{
          profile: [
            [-0.14, 0],
            [-0.06, 0],
            [-0.07, -0.2],
            [-0.09, -0.22],
            [-0.15, -0.21],
            [-0.15, -0.1],
          ],
          depth: 0.065,
        }}
        color={white}
      />
      {[0, 1, 2].map((i) => (
        <Part key={i} shape={{ box: [0.07, 0.012, 0.072] }} color={light} at={[-0.105, -0.08 - i * 0.04, 0]} />
      ))}
      <TriggerGroup x={0} y={-0.02} color={BLACK} />
      {/* Brace stock on a rod */}
      <Part shape={{ rod: [0.015, 0.18] }} color={BLACK} at={[-0.31, 0.06, 0]} />
      <Part
        shape={{
          profile: [
            [-0.46, -0.08],
            [-0.46, 0.1],
            [-0.38, 0.1],
            [-0.38, 0.02],
            [-0.42, -0.08],
          ],
          depth: 0.06,
        }}
        color={white}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Shotgun: a long black barrel with a vent rib and bead sight over the magazine tube, a grey camo
// stock and pump forend, a receiver with a silver side plate, and a shell holder with red shells

export function Shotgun() {
  const silver = '#9aa0a6'
  const leather = '#3b2f28'
  return (
    <group scale={GUN_SCALE}>
      {/* Camo stock, butt pad, shell holder with four shells */}
      <Part
        shape={{
          profile: [
            [-0.72, -0.13],
            [-0.72, 0.03],
            [-0.64, 0.05],
            [-0.32, 0.035],
            [-0.3, -0.01],
            [-0.36, -0.04],
            [-0.42, -0.035],
            [-0.47, -0.07],
            [-0.52, -0.1],
            [-0.62, -0.13],
          ],
          depth: 0.06,
        }}
        map={camo}
      />
      <Part shape={{ box: [0.03, 0.17, 0.064] }} color={BLACK} at={[-0.73, -0.05, 0]} />
      <Part shape={{ box: [0.14, 0.07, 0.07] }} color={leather} at={[-0.6, -0.07, 0]} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[-0.645 + i * 0.03, -0.07, 0.04]}>
          <Part shape={{ post: [0.013, 0.07] }} color="#c8252b" />
          <Part shape={{ post: [0.0135, 0.018] }} color="#c9a14a" at={[0, -0.042, 0]} />
        </group>
      ))}
      {/* Receiver with silver side plate, trigger */}
      <Part shape={{ box: [0.28, 0.1, 0.07] }} color={GUNMETAL} at={[-0.16, 0.015, 0]} />
      <Part shape={{ box: [0.12, 0.05, 0.074] }} color={silver} at={[-0.18, 0.02, 0]} />
      <Part shape={{ box: [0.1, 0.008, 0.076] }} color={GUNMETAL} at={[-0.18, 0.02, 0]} />
      <TriggerGroup x={-0.19} y={-0.04} color={BLACK} />
      {/* Barrel with vent rib, magazine tube, muzzle and bead sight */}
      <Part shape={{ rod: [0.026, 0.72] }} color={BLACK} at={[0.34, 0.045, 0]} />
      <Part shape={{ box: [0.7, 0.01, 0.022] }} color={BLACK} at={[0.34, 0.088, 0]} />
      {Array.from({ length: 7 }, (_, i) => (
        <Part key={i} shape={{ box: [0.012, 0.018, 0.014] }} color={BLACK} at={[0.03 + i * 0.1, 0.076, 0]} />
      ))}
      <Part shape={{ rod: [0.02, 0.6] }} color={GUNMETAL} at={[0.3, 0, 0]} />
      <Part shape={{ rod: [0.022, 0.02] }} color={BLACK} at={[0.605, 0, 0]} />
      <Part shape={{ rod: [0.031, 0.04] }} color={BLACK} at={[0.7, 0.045, 0]} />
      <Part shape={{ sphere: 0.009 }} color={silver} at={[0.68, 0.1, 0]} />
      {/* Camo pump forend */}
      <Part
        shape={{
          profile: [
            [0.02, -0.04],
            [0.3, -0.04],
            [0.32, -0.02],
            [0.3, 0.03],
            [0.02, 0.03],
            [0, 0],
          ],
          depth: 0.07,
        }}
        map={camo}
      />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Drum shotgun (automatic): a boxy black body with a long square shroud slashed with vents, a rail on top,
// a ported muzzle brake, a red drum magazine and an angular skeleton stock

export function DrumShotgun() {
  const body = '#2b2d31'
  const steel = '#4a4d53'
  const drumRed = '#9c2a24'
  const drumFace = '#55585e'
  return (
    <group scale={GUN_SCALE}>
      {/* Skeleton stock with a triangular cut-out, and butt pad */}
      <Part
        shape={{
          profile: [
            [-0.62, -0.15],
            [-0.62, 0.05],
            [-0.32, 0.075],
            [-0.3, 0.0],
            [-0.46, -0.03],
            [-0.53, -0.15],
          ],
          hole: [
            [-0.57, -0.1],
            [-0.5, -0.02],
            [-0.57, 0.02],
          ],
          depth: 0.06,
        }}
        color={body}
      />
      <Part shape={{ box: [0.03, 0.21, 0.066] }} color={BLACK} at={[-0.63, -0.05, 0]} />
      {/* Receiver with a steel side plate and bolt window */}
      <Part shape={{ box: [0.34, 0.13, 0.08] }} color={body} at={[-0.15, 0.035, 0]} />
      <Part shape={{ box: [0.16, 0.06, 0.084] }} color={steel} at={[-0.12, 0.02, 0]} />
      <Part shape={{ box: [0.07, 0.04, 0.086] }} color={BLACK} at={[-0.22, 0.07, 0]} />
      {/* Long square shroud with slanted vents along the top edge and a side rail section */}
      <Part shape={{ box: [0.62, 0.15, 0.1] }} color={body} at={[0.31, 0.055, 0]} />
      {Array.from({ length: 9 }, (_, i) => (
        <Part key={i} shape={{ box: [0.018, 0.05, 0.104] }} color={steel} at={[0.06 + i * 0.058, 0.1, 0]} rot={[0, 0, -0.5]} />
      ))}
      <Part shape={{ box: [0.2, 0.03, 0.106] }} color={steel} at={[0.36, 0.035, 0]} />
      {/* Top rail */}
      <Part shape={{ box: [0.78, 0.02, 0.05] }} color={BLACK} at={[0.16, 0.14, 0]} />
      <RailTeeth x0={-0.2} count={14} pitch={0.055} y={0.155} color={BLACK} />
      {/* Ported muzzle brake */}
      <Part shape={{ rod: [0.052, 0.12] }} color={steel} at={[0.68, 0.06, 0]} />
      {[0.66, 0.7].map((x) => (
        <Part key={x} shape={{ box: [0.022, 0.035, 0.11] }} color={BLACK} at={[x, 0.06, 0]} />
      ))}
      {/* Drum magazine: red band between grey faces, with a raised ring and hub, on a short neck */}
      <Part shape={{ box: [0.08, 0.08, 0.06] }} color={body} at={[0.08, -0.06, 0]} />
      <Part shape={{ disc: [0.14, 0.09] }} color={drumRed} at={[0.1, -0.2, 0]} />
      <Part shape={{ disc: [0.125, 0.1] }} color={drumFace} at={[0.1, -0.2, 0]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Part shape={{ ring: [0.08, 0.008] }} color={steel} at={[0.1, -0.2, s * 0.05]} />
          <Part shape={{ disc: [0.03, 0.012] }} color={steel} at={[0.1, -0.2, s * 0.05]} />
        </group>
      ))}
      {/* Pistol grip and trigger */}
      <Part
        shape={{
          profile: [
            [-0.22, -0.03],
            [-0.15, -0.03],
            [-0.17, -0.21],
            [-0.2, -0.23],
            [-0.26, -0.22],
          ],
          depth: 0.055,
        }}
        color={BLACK}
      />
      <TriggerGroup x={-0.09} y={-0.04} color={body} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Pump shotgun: long black barrel over a magazine tube, a grooved wooden pump, a grey receiver with a
// small rear sight, and a wooden stock with a black recoil pad

export function PumpShotgun() {
  const wood = '#8a5a33'
  const woodDark = '#6e4526'
  const grey = '#6a6e75'
  return (
    <group scale={GUN_SCALE}>
      <Part
        shape={{
          profile: [
            [-0.72, -0.14],
            [-0.72, 0.03],
            [-0.62, 0.05],
            [-0.34, 0.04],
            [-0.3, -0.01],
            [-0.4, -0.05],
            [-0.5, -0.06],
            [-0.6, -0.14],
          ],
          depth: 0.06,
        }}
        color={wood}
      />
      <Part shape={{ box: [0.035, 0.18, 0.066] }} color={BLACK} at={[-0.735, -0.055, 0]} />
      {/* Receiver, ejection port, rear sight, trigger */}
      <Part shape={{ box: [0.3, 0.11, 0.072] }} color={grey} at={[-0.15, 0.015, 0]} />
      <Part shape={{ box: [0.1, 0.03, 0.076] }} color={GUNMETAL} at={[-0.1, 0.03, 0]} />
      <Part shape={{ box: [0.04, 0.04, 0.03] }} color={BLACK} at={[-0.2, 0.09, 0]} />
      <TriggerGroup x={-0.17} y={-0.045} color={GUNMETAL} />
      {/* Barrel, magazine tube with its cap, front sight */}
      <Part shape={{ rod: [0.026, 0.75] }} color={BLACK} at={[0.375, 0.045, 0]} />
      <Part shape={{ rod: [0.022, 0.6] }} color={BLACK} at={[0.3, -0.008, 0]} />
      <Part shape={{ rod: [0.026, 0.03] }} color={GUNMETAL} at={[0.61, -0.008, 0]} />
      <Part shape={{ box: [0.02, 0.035, 0.02] }} color={BLACK} at={[0.73, 0.085, 0]} />
      {/* Wooden pump with grooves */}
      <Part shape={{ rod: [0.044, 0.28] }} color={wood} at={[0.27, -0.004, 0]} />
      {Array.from({ length: 6 }, (_, i) => (
        <Part key={i} shape={{ ring: [0.044, 0.006] }} color={woodDark} at={[0.16 + i * 0.044, -0.004, 0]} rot={[0, HALF_PI, 0]} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Rocket launcher: a long black tube with a flared exhaust cone, wooden heat shields, two grips (black
// with the trigger at the back, wooden at the front), a sight box, and an olive shark-mouthed warhead
// behind an orange band. Longer than the assault rifles. The warhead is the round: it's gone once fired
// (`loaded` false) until the reload puts a new one in.

export function RocketLauncher({ loaded = true }: { loaded?: boolean }) {
  const tube = '#262729'
  const steel = '#5c6068'
  const wood = '#8a5a33'
  return (
    <group scale={GUN_SCALE}>
      {/* Tube, rear exhaust cone and rim */}
      <Part shape={{ rod: [0.055, 1.05] }} color={tube} at={[-0.225, 0, 0]} />
      <Part shape={{ cone: [0.11, 0.055, 0.15] }} color={tube} at={[-0.825, 0, 0]} />
      <Part shape={{ ring: [0.105, 0.012] }} color={steel} at={[-0.9, 0, 0]} rot={[0, HALF_PI, 0]} />
      {/* Wooden heat shields and steel collars */}
      <Part shape={{ rod: [0.064, 0.24] }} color={wood} at={[-0.45, 0, 0]} />
      <Part shape={{ rod: [0.064, 0.16] }} color={wood} at={[0.1, 0, 0]} />
      {[-0.58, -0.32, 0.2, 0.3].map((x) => (
        <Part key={x} shape={{ rod: [0.068, 0.02] }} color={steel} at={[x, 0, 0]} />
      ))}
      {/* Rear grip with trigger, wooden front grip */}
      <Part
        shape={{
          profile: [
            [-0.28, -0.05],
            [-0.21, -0.05],
            [-0.23, -0.21],
            [-0.26, -0.23],
            [-0.32, -0.22],
          ],
          depth: 0.055,
        }}
        color={BLACK}
      />
      <TriggerGroup x={-0.15} y={-0.06} color={BLACK} />
      <Part
        shape={{
          profile: [
            [-0.02, -0.05],
            [0.06, -0.05],
            [0.05, -0.2],
            [0.02, -0.22],
            [-0.03, -0.2],
          ],
          depth: 0.055,
        }}
        color={wood}
      />
      {/* Sight box and front sight post */}
      <Part shape={{ box: [0.12, 0.07, 0.05] }} color={BLACK} at={[-0.2, 0.09, 0]} />
      <Part shape={{ rod: [0.022, 0.08] }} color={BLACK} at={[-0.13, 0.1, 0]} />
      <Part shape={{ box: [0.02, 0.07, 0.02] }} color={BLACK} at={[0.22, 0.085, 0]} />
      {/* Warhead: steel neck, orange band, olive body, shark-mouthed nose cone and tip */}
      {loaded && (
        <group position={[WARHEAD_X, 0, 0]}>
          <Warhead />
        </group>
      )}
    </group>
  )
}

// The rocket's warhead, centred on its middle (nose towards +x): on the launcher, and flying
const WARHEAD_X = 0.6 // where it sits on the launcher (the shot leaves from here)
function Warhead() {
  const steel = '#5c6068'
  return (
    <>
      <Part shape={{ rod: [0.035, 0.1] }} color={steel} at={[0.36 - WARHEAD_X, 0, 0]} />
      <Part shape={{ rod: [0.05, 0.05] }} color="#e0782a" at={[0.435 - WARHEAD_X, 0, 0]} />
      <Part shape={{ cone: [0.06, 0.105, 0.13] }} color="#6b7a2a" at={[0.525 - WARHEAD_X, 0, 0]} />
      <Part shape={{ cone: [0.105, 0.035, 0.32] }} map={shark} at={[0.75 - WARHEAD_X, 0, 0]} />
      <Part shape={{ rod: [0.03, 0.05] }} color={steel} at={[0.935 - WARHEAD_X, 0, 0]} />
    </>
  )
}

// A fired rocket: the warhead on a short motor with four fins. Its exhaust flame is drawn by the effects.
export function Rocket() {
  return (
    <group scale={GUN_SCALE}>
      <Warhead />
      <Part shape={{ rod: [0.032, 0.16] }} color="#262729" at={[-0.34, 0, 0]} />
      {[0, 1, 2, 3].map((i) => (
        <Part key={i} shape={{ box: [0.08, 0.012, 0.09] }} color="#3a3c40" at={[-0.38, 0, 0]} rot={[(i * Math.PI) / 2, 0, 0]} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Tactical assault rifle (SCAR style): a tan body with a long upper receiver and slot windows, a black
// top rail with flip sights, a steel barrel with a flash hider, a curved grey magazine and a tan stock

export function TacticalAssaultRifle() {
  const tan = '#c9b27c'
  const tanDark = '#a8925f'
  const grey = '#8f949b'
  return (
    <group scale={GUN_SCALE}>
      <Part
        shape={{
          profile: [
            [-0.66, -0.14],
            [-0.66, 0.06],
            [-0.6, 0.08],
            [-0.34, 0.075],
            [-0.34, -0.01],
            [-0.5, -0.04],
            [-0.58, -0.14],
          ],
          depth: 0.06,
        }}
        color={tan}
      />
      <Part shape={{ box: [0.035, 0.2, 0.066] }} color={BLACK} at={[-0.675, -0.04, 0]} />
      {/* Long tan upper with slot windows, lower receiver, charging handle */}
      <Part shape={{ box: [0.68, 0.12, 0.08] }} color={tan} at={[0, 0.06, 0]} />
      <Part shape={{ box: [0.3, 0.07, 0.074] }} color={tanDark} at={[-0.13, -0.015, 0]} />
      {[0.05, 0.18].map((x) => (
        <Part key={x} shape={{ box: [0.09, 0.022, 0.084] }} color={BLACK} at={[x, 0.08, 0]} />
      ))}
      <Part shape={{ rod: [0.012, 0.05] }} color={GUNMETAL} at={[-0.02, 0.06, 0.045]} />
      {/* Top rail with flip sights */}
      <Part shape={{ box: [0.64, 0.02, 0.05] }} color={BLACK} at={[0, 0.13, 0]} />
      <RailTeeth x0={-0.3} count={12} pitch={0.052} y={0.145} color={BLACK} />
      <Part shape={{ box: [0.03, 0.05, 0.045] }} color={BLACK} at={[-0.29, 0.165, 0]} />
      <Part shape={{ box: [0.03, 0.05, 0.045] }} color={BLACK} at={[0.31, 0.165, 0]} />
      {/* Barrel, gas block, flash hider */}
      <Part shape={{ rod: [0.02, 0.38] }} color={GUNMETAL} at={[0.53, 0.06, 0]} />
      <Part shape={{ box: [0.04, 0.05, 0.05] }} color={BLACK} at={[0.38, 0.06, 0]} />
      <Part shape={{ rod: [0.03, 0.08] }} color={BLACK} at={[0.76, 0.06, 0]} />
      <Part shape={{ box: [0.045, 0.012, 0.064] }} color={GUNMETAL} at={[0.77, 0.06, 0]} />
      {/* Curved grey magazine with ribs */}
      <Part
        shape={{
          profile: [
            [-0.02, -0.05],
            [0.08, -0.05],
            [0.1, -0.17],
            [0.14, -0.3],
            [0.06, -0.32],
            [0.02, -0.18],
          ],
          depth: 0.056,
        }}
        color={grey}
      />
      {[0, 1, 2].map((i) => (
        <Part key={i} shape={{ box: [0.07, 0.012, 0.06] }} color="#6f747b" at={[0.05 + i * 0.022, -0.12 - i * 0.055, 0]} rot={[0, 0, -0.3]} />
      ))}
      {/* Grip and trigger */}
      <Part
        shape={{
          profile: [
            [-0.22, -0.04],
            [-0.15, -0.04],
            [-0.17, -0.22],
            [-0.2, -0.24],
            [-0.26, -0.23],
          ],
          depth: 0.055,
        }}
        color={BLACK}
      />
      <TriggerGroup x={-0.09} y={-0.05} color={BLACK} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Pistol: a silver slide with rear serrations and a bored muzzle over a dark frame, and a black
// textured grip. Dual pistols are two of these, one in each hand.

export function Pistol() {
  const silver = '#b9bec6'
  const frame = '#3d4046'
  return (
    <group scale={GUN_SCALE}>
      <Part shape={{ box: [0.4, 0.085, 0.07] }} color={silver} at={[0.04, 0.07, 0]} />
      {Array.from({ length: 4 }, (_, i) => (
        <Part key={i} shape={{ box: [0.008, 0.06, 0.074] }} color="#8a9098" at={[-0.13 + i * 0.02, 0.075, 0]} />
      ))}
      <Part shape={{ rod: [0.02, 0.01] }} color="#1b1b1f" at={[0.242, 0.075, 0]} />
      <Part shape={{ box: [0.3, 0.035, 0.064] }} color={frame} at={[0.07, 0.013, 0]} />
      <Part
        shape={{
          profile: [
            [-0.16, 0.0],
            [-0.08, 0.0],
            [-0.1, -0.2],
            [-0.12, -0.22],
            [-0.19, -0.21],
          ],
          depth: 0.06,
        }}
        color="#2a2b2e"
      />
      <TriggerGroup x={-0.03} y={-0.01} color={frame} />
    </group>
  )
}

// On a pedestal: the pair side by side, the second a little behind and further forward
export function DualPistols() {
  return (
    <group>
      <group position={[-0.05, 0, 0.09]}>
        <Pistol />
      </group>
      <group position={[0.05, 0.02, -0.09]}>
        <Pistol />
      </group>
    </group>
  )
}

// In the hands: the right pistol is the held item itself; the left one follows its own pose (set every
// frame by the holding code), given relative to the right one
export function DualPistolsHeld() {
  const left = useRef<THREE.Group>(null)
  useFrame(() => {
    left.current?.position.copy(offhand.position)
    left.current?.quaternion.copy(offhand.quaternion)
  })
  return (
    <group>
      <Pistol />
      <group ref={left}>
        <Pistol />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Sniper parts

// A scope along the top: the tube from x0 to x1 at height y, a flared objective bell with its lens at the
// front, a rubber-cupped eyepiece at the back, turrets on top and the side, and two mounts down to `base`
function Scope({ x0, x1, y, r, bell, base, lens, body }: { x0: number; x1: number; y: number; r: number; bell: number; base: number; lens: string; body: string }) {
  const mid = (x0 + x1) / 2
  return (
    <>
      <Part shape={{ rod: [r, x1 - x0] }} color={body} at={[mid, y, 0]} />
      <Part shape={{ cone: [r, bell, 0.12] }} color={body} at={[x1 + 0.06, y, 0]} />
      <Part shape={{ rod: [bell + 0.004, 0.02] }} color={body} at={[x1 + 0.13, y, 0]} />
      <Part shape={{ rod: [bell - 0.008, 0.006] }} color={lens} at={[x1 + 0.142, y, 0]} />
      <Part shape={{ cone: [r * 1.45, r, 0.08] }} color={body} at={[x0 - 0.04, y, 0]} />
      <Part shape={{ rod: [r * 1.45, 0.03] }} color="#111214" at={[x0 - 0.095, y, 0]} />
      <Part shape={{ post: [0.024, 0.05] }} color={body} at={[mid - 0.03, y + r + 0.015, 0]} />
      <Part shape={{ disc: [0.024, 0.05] }} color={body} at={[mid - 0.03, y, r + 0.01]} />
      {[x0 + 0.08, x1 - 0.08].map((x) => (
        <Part key={x} shape={{ box: [0.05, y - base, 0.05] }} color="#1e2023" at={[x, (y + base) / 2, 0]} />
      ))}
    </>
  )
}

// A bolt handle sticking out of the right side. On the gun in the character's hands it follows the bolt
// being worked after a shot: lifted up and pulled back, then pushed home.
function BoltHandle({ held, x, y, color }: { held: boolean; x: number; y: number; color: string }) {
  const handle = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!held || !handle.current) return
    const pull = inHand.boltPull
    handle.current.position.x = x - pull * 0.09
    handle.current.rotation.x = -pull * 0.9
  })
  return (
    <group ref={handle} position={[x, y, 0]}>
      <Part shape={{ post: [0.012, 0.09] }} color={color} at={[0, 0, 0.075]} rot={[HALF_PI, 0, 0]} />
      <Part shape={{ sphere: 0.022 }} color={color} at={[0, 0, 0.12]} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Semi-auto sniper rifle: a grey-green receiver with a wooden handguard and grip, a long heavy barrel with
// ports near the muzzle, a blue-lensed scope, a box magazine and a folding wire stock

export function SemiAutoSniperRifle() {
  const metal = '#5d6560'
  const metalDark = '#454c48'
  const wood = '#8a5a33'
  const wire = '#aab0b6'
  return (
    <group scale={GUN_SCALE}>
      {/* Folding wire stock: two bars down to a flat butt plate, hinged at the receiver */}
      <Part shape={{ box: [0.386, 0.018, 0.03] }} color={wire} at={[-0.53, 0.005, 0]} rot={[0, 0, 0.182]} />
      <Part shape={{ box: [0.399, 0.018, 0.03] }} color={wire} at={[-0.53, -0.11, 0]} rot={[0, 0, 0.306]} />
      <Part shape={{ box: [0.03, 0.2, 0.07] }} color={wire} at={[-0.735, -0.1, 0]} />
      <Part shape={{ box: [0.03, 0.1, 0.07] }} color={metalDark} at={[-0.34, 0, 0]} />
      {/* Receiver with its top cover and charging handle */}
      <Part shape={{ box: [0.48, 0.13, 0.08] }} color={metal} at={[-0.1, 0.025, 0]} />
      <Part shape={{ box: [0.4, 0.03, 0.084] }} color={metalDark} at={[-0.12, 0.08, 0]} />
      <Part shape={{ box: [0.05, 0.02, 0.03] }} color={metalDark} at={[0.02, 0.07, 0.05]} />
      {/* Wooden handguard, box magazine with ribs, wooden grip, trigger */}
      <Part shape={{ box: [0.38, 0.12, 0.09] }} color={wood} at={[0.21, 0.01, 0]} />
      <Part shape={{ box: [0.1, 0.16, 0.066] }} color="#7a8078" at={[-0.05, -0.12, 0]} />
      {[0, 1, 2].map((i) => (
        <Part key={i} shape={{ box: [0.104, 0.01, 0.07] }} color={metalDark} at={[-0.05, -0.08 - i * 0.045, 0]} />
      ))}
      <Part
        shape={{
          profile: [
            [-0.24, -0.04],
            [-0.17, -0.04],
            [-0.19, -0.22],
            [-0.22, -0.24],
            [-0.28, -0.23],
          ],
          depth: 0.055,
        }}
        color={wood}
      />
      <TriggerGroup x={-0.13} y={-0.05} color={metalDark} />
      {/* Heavy barrel with three ports near the muzzle */}
      <Part shape={{ rod: [0.035, 0.65] }} color="#2a2c30" at={[0.725, 0.02, 0]} />
      {[0.9, 0.96, 1.02].map((x) => (
        <Part key={x} shape={{ disc: [0.013, 0.076] }} color="#0e0f11" at={[x, 0.02, 0]} />
      ))}
      <Part shape={{ rod: [0.02, 0.006] }} color="#0e0f11" at={[1.052, 0.02, 0]} />
      <Scope x0={-0.3} x1={0.08} y={0.18} r={0.036} bell={0.075} base={0.09} lens="#3d7bd6" body="#1f2124" />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Suppressed sniper rifle: a light tan thumbhole stock with a black butt pad and cheek riser, a round
// action with a bolt handle, a long silver barrel ending in a big black suppressor, and a scope

export function SuppressedSniperRifle({ held = false }: { held?: boolean }) {
  const tan = '#c9b27c'
  const black = '#1e2023'
  return (
    <group scale={GUN_SCALE}>
      <Part
        shape={{
          profile: [
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
          hole: [
            [-0.44, -0.02],
            [-0.34, -0.02],
            [-0.32, -0.08],
            [-0.36, -0.09],
            [-0.44, -0.07],
          ],
          depth: 0.07,
        }}
        color={tan}
      />
      <Part shape={{ box: [0.035, 0.24, 0.076] }} color={black} at={[-0.795, -0.055, 0]} />
      <Part shape={{ box: [0.16, 0.03, 0.062] }} color={black} at={[-0.56, 0.085, 0]} />
      {/* Round action with the bolt, magazine and trigger */}
      <Part shape={{ rod: [0.035, 0.44] }} color="#6d7278" at={[-0.12, 0.065, 0]} />
      <BoltHandle held={held} x={-0.2} y={0.07} color="#6d7278" />
      <Part shape={{ box: [0.09, 0.07, 0.056] }} color={black} at={[-0.01, -0.07, 0]} />
      <TriggerGroup x={-0.14} y={-0.06} color={black} />
      {/* Silver barrel into a big suppressor with an end cap */}
      <Part shape={{ rod: [0.02, 0.52] }} color="#a7adb4" at={[0.36, 0.065, 0]} />
      <Part shape={{ rod: [0.05, 0.48] }} color={black} at={[0.86, 0.065, 0]} />
      <Part shape={{ rod: [0.052, 0.02] }} color="#2e3035" at={[1.1, 0.065, 0]} />
      <Part shape={{ rod: [0.018, 0.004] }} color="#0b0b0c" at={[1.112, 0.065, 0]} />
      <Scope x0={-0.3} x1={0.06} y={0.18} r={0.033} bell={0.065} base={0.09} lens="#2f5d9e" body={black} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Bolt-action sniper rifle: a dark chassis with a skeleton stock, a silver handguard cut with rows of oval
// holes, a bolt handle, a short box magazine, a long barrel with a slotted flash hider, and a big scope

export function BoltActionSniperRifle({ held = false }: { held?: boolean }) {
  const chassis = '#3a3d42'
  const guard = '#6f747c'
  const black = '#1e2023'
  return (
    <group scale={GUN_SCALE}>
      {/* Skeleton stock with a cheek rest, butt pad and a small spike underneath */}
      <Part
        shape={{
          profile: [
            [-0.78, -0.17],
            [-0.78, 0.07],
            [-0.66, 0.1],
            [-0.46, 0.1],
            [-0.44, 0.03],
            [-0.34, 0.03],
            [-0.34, -0.02],
            [-0.5, -0.05],
            [-0.62, -0.07],
            [-0.66, -0.17],
          ],
          hole: [
            [-0.62, -0.035],
            [-0.5, -0.015],
            [-0.5, 0.05],
            [-0.62, 0.05],
          ],
          depth: 0.06,
        }}
        color={black}
      />
      <Part shape={{ box: [0.035, 0.25, 0.07] }} color={black} at={[-0.795, -0.05, 0]} />
      <Part shape={{ box: [0.04, 0.05, 0.04] }} color={black} at={[-0.7, -0.19, 0]} />
      {/* Chassis, bolt, magazine, grip, trigger */}
      <Part shape={{ box: [0.38, 0.11, 0.08] }} color={chassis} at={[-0.15, 0.025, 0]} />
      <BoltHandle held={held} x={-0.12} y={0.06} color={guard} />
      <Part shape={{ box: [0.1, 0.13, 0.066] }} color={black} at={[0, -0.095, 0]} />
      <Part
        shape={{
          profile: [
            [-0.26, -0.03],
            [-0.19, -0.03],
            [-0.21, -0.21],
            [-0.24, -0.23],
            [-0.3, -0.22],
          ],
          depth: 0.055,
        }}
        color={black}
      />
      <TriggerGroup x={-0.12} y={-0.03} color={chassis} />
      {/* Silver handguard with two staggered rows of oval holes, and the top rail */}
      <Part shape={{ box: [0.54, 0.12, 0.1] }} color={guard} at={[0.31, 0.04, 0]} />
      {[0.015, 0.065].map((y, row) =>
        [0.1, 0.19, 0.28, 0.37, 0.46].map((x) => (
          <Part key={`${row}${x}`} shape={{ box: [0.055, 0.022, 0.104] }} color={black} at={[x + row * 0.045, y, 0]} />
        )),
      )}
      <Part shape={{ box: [0.88, 0.02, 0.05] }} color={black} at={[0.14, 0.11, 0]} />
      <RailTeeth x0={-0.28} count={16} pitch={0.055} y={0.125} color={black} />
      {/* Barrel and slotted flash hider */}
      <Part shape={{ rod: [0.022, 0.32] }} color="#4a4e55" at={[0.74, 0.05, 0]} />
      <Part shape={{ rod: [0.04, 0.02] }} color={chassis} at={[0.905, 0.05, 0]} />
      <Part shape={{ rod: [0.034, 0.1] }} color="#2a2c30" at={[0.95, 0.05, 0]} />
      <Part shape={{ box: [0.05, 0.012, 0.072] }} color={guard} at={[0.96, 0.05, 0]} />
      <Scope x0={-0.28} x1={0.14} y={0.21} r={0.038} bell={0.07} base={0.12} lens="#1f2d44" body="#26282c" />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Bomb launcher: sand-coloured, with a big revolving drum of capsules under a short dark barrel and a thick
// muzzle, a block round the barrel with a sight on top and a slanted rubber foregrip below, a dark rail on
// top of the receiver, and a skeleton stock with a red stripe

const SAND = '#c9a46a'
const SAND_DARK = '#a4814b'
const UMBER = '#3a3230'
const RUBBER = '#2a2a2c'

export function BombLauncher() {
  const drum = { x: -0.02, y: -0.03, r: 0.15, length: 0.22 }
  return (
    <group scale={GUN_SCALE}>
      {/* Drum: sand with a dark band round its middle, the chambers' mouths on its front face, and a hub */}
      <Part shape={{ rod: [drum.r, drum.length] }} color={SAND} at={[drum.x, drum.y, 0]} />
      <Part shape={{ rod: [drum.r + 0.003, 0.06] }} color={UMBER} at={[drum.x, drum.y, 0]} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.5
        return (
          <Part
            key={i}
            shape={{ rod: [0.026, 0.012] }}
            color={UMBER}
            at={[drum.x + drum.length / 2 + 0.002, drum.y + Math.cos(a) * 0.095, Math.sin(a) * 0.095]}
          />
        )
      })}
      <Part shape={{ rod: [0.05, 0.03] }} color={SAND_DARK} at={[drum.x + drum.length / 2 + 0.01, drum.y, 0]} />
      {/* Barrel out of the top of the drum, and the thick muzzle with its dark bore */}
      <Part shape={{ rod: [0.055, 0.46] }} color={UMBER} at={[0.33, 0.07, 0]} />
      <Part shape={{ rod: [0.072, 0.1] }} color={UMBER} at={[0.6, 0.07, 0]} />
      <Part shape={{ rod: [0.046, 0.012] }} color="#141414" at={[0.651, 0.07, 0]} />
      {/* Block round the barrel with a sight on top; the foregrip hangs from it, slanting forward */}
      <Part shape={{ box: [0.1, 0.13, 0.12] }} color={SAND} at={[0.38, 0.07, 0]} />
      <Part shape={{ box: [0.05, 0.08, 0.06] }} color={SAND_DARK} at={[0.38, 0.165, 0]} />
      <Part shape={{ box: [0.07, 0.05, 0.08] }} color={SAND} at={[0.39, -0.01, 0]} />
      <Part shape={{ box: [0.055, 0.2, 0.06] }} color={RUBBER} at={[0.42, -0.12, 0]} rot={[0, 0, 0.3]} />
      {/* Receiver behind the drum, a dark rail on top with a steel catch, grip and trigger */}
      <Part shape={{ box: [0.22, 0.13, 0.1] }} color={SAND} at={[-0.24, 0.02, 0]} />
      <Part shape={{ box: [0.26, 0.03, 0.05] }} color={UMBER} at={[-0.2, 0.1, 0]} />
      <RailTeeth x0={-0.3} count={8} pitch={0.028} y={0.12} color={UMBER} />
      <Part shape={{ box: [0.05, 0.04, 0.03] }} color="#b8bcc4" at={[-0.1, 0.085, 0]} />
      <Part
        shape={{
          profile: [
            [-0.25, -0.04],
            [-0.18, -0.04],
            [-0.2, -0.2],
            [-0.23, -0.22],
            [-0.29, -0.21],
          ],
          depth: 0.055,
        }}
        color={RUBBER}
      />
      <TriggerGroup x={-0.15} y={-0.05} color={UMBER} />
      {/* Skeleton stock: a tube and a lower strut to the butt, a red stripe round the tube, a hole in the butt */}
      <Part shape={{ rod: [0.028, 0.34] }} color={SAND} at={[-0.52, 0.03, 0]} />
      <Part shape={{ rod: [0.02, 0.3] }} color={SAND_DARK} at={[-0.52, -0.07, 0]} rot={[0, 0, -0.1]} />
      <Part shape={{ rod: [0.031, 0.03] }} color="#b3262a" at={[-0.48, 0.03, 0]} />
      <Part shape={{ box: [0.05, 0.22, 0.08] }} color={SAND} at={[-0.71, -0.02, 0]} />
      <Part shape={{ disc: [0.018, 0.084] }} color="#1b1b1f" at={[-0.71, -0.07, 0]} />
    </group>
  )
}
