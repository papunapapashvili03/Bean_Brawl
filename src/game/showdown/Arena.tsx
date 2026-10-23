import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGrabEdges } from '../grab'
import { TapedRods } from '../GripTape'
import { NEON } from '../neon/course'
import { neon } from '../neon/neonMaterial'
import { NeonArch } from '../neon/scenery'
import { billboardTexture, circuitTexture, circuitTime } from '../neon/sceneryKit'
import { checkerTexture, paint } from '../race/materials'
import { Strip } from '../race/parts'
import { bars, boxGeometry, boxRim, merged } from './bars'
import {
  CAPACITORS,
  CHIPS,
  DECKS,
  EDGES,
  FENCE_HEIGHT,
  HALF_X,
  HALF_Z,
  MID_DASHES,
  PAD,
  RAILS,
  RESISTORS,
  SCREEN,
  SERVERS,
  SPAWNS,
  STAGE,
  STAGE_BOX,
  TEAM,
  TRACES,
  type P3,
} from './layout'

// Neon Showdown's ground and everything fixed on it (see ./layout): the circuit-board floor with its lines of
// light, the glass fence, the start pads and their billboard screens, the decks either side of the Blackout
// Grid, the Sky Stage, and the circuit parts lying about for cover.

// ---------------------------------------------------------------------------------------------------------
// The floor: Neon Circuit's circuit board, lit and walkable, with its rings of light pulsing out from the
// middle of the arena (the traces glow brighter than white as a ring passes, so the bloom picks them up)

const BOARD_TILE = 48 // metres per repeat of the board's pattern
const FLOOR_SIZE = 900

function floorMaterial() {
  const tex = circuitTexture()
  tex.repeat.set(FLOOR_SIZE / BOARD_TILE, FLOOR_SIZE / BOARD_TILE)
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.9, roughness: 0.45, metalness: 0.25 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = circuitTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBoard;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBoard = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vBoard;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat ring = 0.5 + 0.5 * sin(length(vBoard) * 0.1 - uTime * 2.0);\ntotalEmissiveRadiance *= 0.5 + 1.7 * ring * ring;',
      )
  }
  return m
}

function Floor() {
  const material = useMemo(() => floorMaterial(), [])
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[70, 0.5, 50]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
      </mesh>
    </>
  )
}

// Lines of light on the floor: circuit traces ending in round pads, the border, the dashed middle line
const LINE_Y = 0.012
function FloorLines() {
  const lines = useMemo(() => {
    const byColor = new Map<string, THREE.BufferGeometry[]>()
    const add = (color: string, g: THREE.BufferGeometry) => byColor.set(color, [...(byColor.get(color) ?? []), g])
    for (const t of TRACES) {
      const segments: [P3, P3][] = t.points.slice(1).map((p, i) => [
        [t.points[i][0], LINE_Y, t.points[i][1]],
        [p[0], LINE_Y, p[1]],
      ])
      add(t.color, bars(segments, 0.16, 0.024))
      if (t.pad) {
        const [x, z] = t.points[t.points.length - 1]
        add(t.color, new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20).translate(x, LINE_Y, z))
      }
    }
    add(
      NEON.yellow,
      bars(
        MID_DASHES.map(([a, b]) => [
          [a[0], LINE_Y, a[1]],
          [b[0], LINE_Y, b[1]],
        ]),
        0.22,
        0.024,
      ),
    )
    return [...byColor].map(([color, parts]) => ({ color, geometry: merged(parts) }))
  }, [])
  return (
    <>
      {lines.map((l) => (
        <mesh key={l.color} geometry={l.geometry} material={neon(l.color, 2)} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The fence: dark glass panels between posts, a line of light along the top in each team's colour (and an
// unseen wall well above it, so nobody jumps out from a balloon or the stage)

const glass = new THREE.MeshStandardMaterial({
  color: '#1b1442',
  roughness: 0.15,
  metalness: 0.4,
  transparent: true,
  opacity: 0.55,
  emissive: '#2b1f5c',
  emissiveIntensity: 0.35,
  depthWrite: false,
})
const FENCE_WALL = 14

function Fence() {
  const parts = useMemo(() => {
    const t = 0.15
    const panels: THREE.BufferGeometry[] = []
    const posts: THREE.BufferGeometry[] = []
    const tops = { west: [] as [P3, P3][], east: [] as [P3, P3][] }
    const bottoms: [P3, P3][] = []
    const side = (a: [number, number], b: [number, number]) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.round(length / 4)
      for (let i = 0; i < n; i++) {
        const p = (k: number): [number, number] => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
        const [x0, z0] = p(i)
        const [x1, z1] = p(i + 1)
        panels.push(boxGeometry([Math.min(x0, x1) - t / 2, 0, Math.min(z0, z1) - t / 2], [Math.max(x0, x1) + t / 2, FENCE_HEIGHT, Math.max(z0, z1) + t / 2]))
        posts.push(boxGeometry([x0 - 0.15, 0, z0 - 0.15], [x0 + 0.15, FENCE_HEIGHT + 0.15, z0 + 0.15]))
        const top: [P3, P3] = [
          [x0, FENCE_HEIGHT + 0.08, z0],
          [x1, FENCE_HEIGHT + 0.08, z1],
        ]
        tops[(x0 + x1) / 2 < 0 ? 'west' : 'east'].push(top)
        bottoms.push([
          [x0, 0.1, z0],
          [x1, 0.1, z1],
        ])
      }
    }
    const [X, Z] = [HALF_X + t, HALF_Z + t]
    side([-X, -Z], [X, -Z])
    side([X, -Z], [X, Z])
    side([X, Z], [-X, Z])
    side([-X, Z], [-X, -Z])
    for (const [x, z] of [
      [-X, -Z],
      [X, -Z],
      [X, Z],
      [-X, Z],
    ])
      posts.push(boxGeometry([x - 0.2, 0, z - 0.2], [x + 0.2, FENCE_HEIGHT + 0.2, z + 0.2]))
    return {
      panels: merged(panels),
      posts: merged(posts),
      west: bars(tops.west, 0.16, 0.12),
      east: bars(tops.east, 0.16, 0.12),
      bottom: bars(bottoms, 0.1, 0.06),
    }
  }, [])
  const X = HALF_X + 0.15
  const Z = HALF_Z + 0.15
  const h = FENCE_WALL / 2
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[X + 0.5, h, 0.25]} position={[0, h, -Z - 0.15]} />
      <CuboidCollider args={[X + 0.5, h, 0.25]} position={[0, h, Z + 0.15]} />
      <CuboidCollider args={[0.25, h, Z + 0.5]} position={[-X - 0.15, h, 0]} />
      <CuboidCollider args={[0.25, h, Z + 0.5]} position={[X + 0.15, h, 0]} />
      <mesh geometry={parts.panels} material={glass} renderOrder={1} />
      <mesh geometry={parts.posts} material={paint(NEON.roadSide)} castShadow />
      <mesh geometry={parts.west} material={neon(TEAM.west, 2.2)} />
      <mesh geometry={parts.east} material={neon(TEAM.east, 2.2)} />
      <mesh geometry={parts.bottom} material={neon(NEON.purple, 1.4)} />
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Start pads (Neon Circuit's start: dark road, glowing edges, a chequered line and an arch over the way out)
// and the billboard screen in front of each

function StartPad({ side }: { side: 1 | -1 }) {
  const color = side < 0 ? TEAM.west : TEAM.east
  const line = useMemo(() => checkerTexture(2, 24), [])
  const x0 = side * PAD.x0
  const x1 = side * PAD.x1
  const mid = (x0 + x1) / 2
  const depth = PAD.x1 - PAD.x0
  const spawns = side < 0 ? SPAWNS.west : SPAWNS.east
  const road = useMemo(() => [paint(NEON.roadSide), paint(NEON.roadSide), paint(NEON.road), paint(NEON.roadSide), paint(NEON.roadSide), paint(NEON.roadSide)], [])
  return (
    <group>
      <mesh material={road} position={[mid, -0.47, 0]} receiveShadow>
        <boxGeometry args={[depth, 1, PAD.half * 2]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[mid, 0.06, s * (PAD.half - 0.1)]} material={neon(s < 0 ? NEON.yellow : color)}>
          <boxGeometry args={[depth, 0.12, 0.18]} />
        </mesh>
      ))}
      <Strip x={x0 + side * 0.6} y={0.03} z={0} width={1} depth={PAD.half * 2} map={line} />
      <NeonArch position={[x0 + side * 0.2, 0, 0]} radii={[4.6]} colors={[color]} tube={0.25} rotationY={Math.PI / 2} />
      {spawns.map(([x, , z], i) => (
        <mesh key={i} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]} material={neon(color, 1.6)}>
          <ringGeometry args={[0.42, 0.55, 28]} />
        </mesh>
      ))}
    </group>
  )
}

function Screen({ side }: { side: 1 | -1 }) {
  const color = side < 0 ? TEAM.west : TEAM.east
  const front = useMemo(() => new THREE.MeshBasicMaterial({ map: billboardTexture(['NEON', 'SHOWDOWN']), toneMapped: false }), [])
  const back = useMemo(() => new THREE.MeshBasicMaterial({ map: billboardTexture([side < 0 ? 'CYAN' : 'PINK', 'TEAM']), toneMapped: false }), [side])
  const x = side * SCREEN.x
  const t = SCREEN.thick / 2
  const height = SCREEN.top - SCREEN.base
  const frame = useMemo(() => {
    const segments: [P3, P3][] = []
    for (const face of [-1, 1]) {
      const fx = x + face * (t + 0.04)
      const corners: P3[] = [
        [fx, SCREEN.base, -SCREEN.half],
        [fx, SCREEN.top, -SCREEN.half],
        [fx, SCREEN.top, SCREEN.half],
        [fx, SCREEN.base, SCREEN.half],
      ]
      // The two horizontal edges (vertical ones go in as plain boxes: a bar can't point straight up)
      segments.push([corners[1], corners[2]], [corners[0], corners[3]])
    }
    const uprights = [-1, 1].flatMap((face) => [-1, 1].map((s) => boxGeometry([x + face * (t + 0.04) - 0.08, SCREEN.base, s * SCREEN.half - 0.08], [x + face * (t + 0.04) + 0.08, SCREEN.top, s * SCREEN.half + 0.08])))
    return merged([bars(segments, 0.16, 0.16), ...uprights])
  }, [x, t])
  // The screen faces the middle; its back faces the team's start
  const inward = side < 0 ? Math.PI / 2 : -Math.PI / 2
  return (
    <group>
      <mesh material={paint(NEON.roadSide)} position={[x, SCREEN.base / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[SCREEN.thick + 0.3, SCREEN.base, SCREEN.half * 2 + 0.3]} />
      </mesh>
      <mesh material={paint('#120d2e')} position={[x, SCREEN.base + height / 2, 0]} castShadow>
        <boxGeometry args={[SCREEN.thick, height, SCREEN.half * 2]} />
      </mesh>
      <mesh material={front} position={[x - side * (t + 0.02), SCREEN.base + height / 2, 0]} rotation={[0, inward, 0]}>
        <planeGeometry args={[SCREEN.half * 2, height]} />
      </mesh>
      <mesh material={back} position={[x + side * (t + 0.02), SCREEN.base + height / 2, 0]} rotation={[0, -inward, 0]}>
        <planeGeometry args={[SCREEN.half * 2, height]} />
      </mesh>
      <mesh geometry={frame} material={neon(color, 2)} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The decks either side of the Blackout Grid (Neon Circuit's top deck), on pillars, with the narrow rails
// between them along the grid's north and south edges

function Decks() {
  const parts = useMemo(() => {
    const slabs: THREE.BufferGeometry[] = []
    const tops: THREE.BufferGeometry[] = []
    const posts: THREE.BufferGeometry[] = []
    const pink: [P3, P3][] = []
    const yellow: [P3, P3][] = []
    for (const d of DECKS) {
      slabs.push(boxGeometry(d.min, [d.max[0], d.max[1] - 0.01, d.max[2]]))
      tops.push(boxGeometry([d.min[0], d.max[1] - 0.01, d.min[2]], d.max))
      for (const x of [d.min[0] + 0.4, d.max[0] - 0.4]) for (const z of [d.min[2] + 0.4, d.max[2] - 0.4]) posts.push(boxGeometry([x - 0.3, 0, z - 0.3], [x + 0.3, d.min[1], z + 0.3]))
      const [n, e, s, w] = boxRim(d.min, d.max, d.max[1] + 0.05)
      pink.push(n, s)
      yellow.push(Math.abs(d.min[0]) > Math.abs(d.max[0]) ? w : e)
    }
    for (const r of RAILS) {
      slabs.push(boxGeometry(r.min, r.max))
      const [n, , s] = boxRim(r.min, r.max, r.max[1] + 0.04)
      yellow.push(n, s)
    }
    return { slabs: merged(slabs), tops: merged(tops), posts: merged(posts), pink: bars(pink, 0.18, 0.1), yellow: bars(yellow, 0.14, 0.08) }
  }, [])
  // Grip tape along the decks' open edges and the rails (falling through the grid, you can catch these)
  const tape = useMemo(
    () => [
      ...DECKS.flatMap((d) => {
        const y = d.max[1]
        return [
          { a: [d.min[0], y, d.min[2]] as P3, b: [d.max[0], y, d.min[2]] as P3 },
          { a: [d.min[0], y, d.max[2]] as P3, b: [d.max[0], y, d.max[2]] as P3 },
        ]
      }),
      ...RAILS.flatMap((r) => [
        { a: [r.min[0], r.max[1], r.min[2]] as P3, b: [r.max[0], r.max[1], r.min[2]] as P3 },
        { a: [r.min[0], r.max[1], r.max[2]] as P3, b: [r.max[0], r.max[1], r.max[2]] as P3 },
      ]),
    ],
    [],
  )
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {[...DECKS, ...RAILS].map((d, i) => (
        <CuboidCollider
          key={i}
          args={[(d.max[0] - d.min[0]) / 2, (d.max[1] - d.min[1]) / 2, (d.max[2] - d.min[2]) / 2]}
          position={[(d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2]}
        />
      ))}
      {DECKS.flatMap((d, k) =>
        [d.min[0] + 0.4, d.max[0] - 0.4].flatMap((x) =>
          [d.min[2] + 0.4, d.max[2] - 0.4].map((z) => <CuboidCollider key={`${k}${x}${z}`} args={[0.3, d.min[1] / 2, 0.3]} position={[x, d.min[1] / 2, z]} />),
        ),
      )}
      <mesh geometry={parts.slabs} material={paint(NEON.roadSide)} castShadow receiveShadow />
      <mesh geometry={parts.tops} material={paint(NEON.road)} receiveShadow />
      <mesh geometry={parts.posts} material={paint(NEON.roadSide)} castShadow />
      <mesh geometry={parts.pink} material={neon(NEON.pink)} />
      <mesh geometry={parts.yellow} material={neon(NEON.yellow, 2)} />
      <TapedRods rods={tape} tape="neon" />
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The Sky Stage: Neon Circuit's finish deck, standing on the ground, with its three arches and chequered line

function Stage() {
  const line = useMemo(() => checkerTexture(12, 1), [])
  const [min, max] = STAGE_BOX
  const look = useMemo(() => [paint(NEON.roadSide), paint(NEON.roadSide), paint(NEON.road), paint(NEON.roadSide), paint(NEON.roadSide), paint(NEON.roadSide)], [])
  const glow = useMemo(() => {
    const y = STAGE.top + 0.06
    const sides: [P3, P3][] = [-1, 1].map((s) => [
      [s * (STAGE.half - 0.1), y, STAGE.z0 + 0.2],
      [s * (STAGE.half - 0.1), y, STAGE.z1 - 0.2],
    ])
    // Bands of light across its north face, towards the middle of the arena
    const bands: [P3, P3][] = [1.2, 2.6, 4, 5.4].map((h) => [
      [-STAGE.half + 0.4, h, STAGE.z0 - 0.04],
      [STAGE.half - 0.4, h, STAGE.z0 - 0.04],
    ])
    return { sides: bars(sides, 0.18, 0.12), bands: bars(bands, 0.12, 0.12) }
  }, [])
  const tape = useMemo(() => boxRim(min, max).map(([a, b]) => ({ a, b })), [min, max])
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      <CuboidCollider args={[STAGE.half, STAGE.top / 2, (STAGE.z1 - STAGE.z0) / 2]} position={[0, STAGE.top / 2, (STAGE.z0 + STAGE.z1) / 2]} />
      <mesh material={look} position={[0, STAGE.top / 2, (STAGE.z0 + STAGE.z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[STAGE.half * 2, STAGE.top, STAGE.z1 - STAGE.z0]} />
      </mesh>
      <mesh geometry={glow.sides} material={neon(NEON.pink)} />
      <mesh geometry={glow.bands} material={neon(NEON.purple, 2)} />
      <Strip y={STAGE.top} z={STAGE.z0 + 1.2} width={STAGE.half * 2 - 0.6} depth={1.2} map={line} />
      <NeonArch position={[0, STAGE.top, (STAGE.z0 + STAGE.z1) / 2]} radii={[5.2, 5.9, 6.6]} colors={[NEON.pink, NEON.cyan, NEON.yellow]} tube={0.26} />
      <TapedRods rods={tape} tape="neon" />
    </RigidBody>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Cover: circuit parts. Chips (black, with pins down their sides, a glowing die and edges), capacitors (cans
// with a ring of light round the top), resistors lying on their sides (glowing colour bands), server stacks
// (tall, with rows of lit slits).

const chipBody = paint('#16123a')
const pinLook = new THREE.MeshStandardMaterial({ color: '#a9a9c8', roughness: 0.35, metalness: 0.8 })
const canLook = paint('#1d1b4f')
const capLook = new THREE.MeshStandardMaterial({ color: '#b8b8d0', roughness: 0.3, metalness: 0.7 })
const resistorLook = paint('#2a2350')
const serverLook = paint('#120d2e')

function Cover() {
  const parts = useMemo(() => {
    const bodies: THREE.BufferGeometry[] = []
    const pins: THREE.BufferGeometry[] = []
    const cans: THREE.BufferGeometry[] = []
    const caps: THREE.BufferGeometry[] = []
    const resistors: THREE.BufferGeometry[] = []
    const servers: THREE.BufferGeometry[] = []
    const glow = new Map<string, THREE.BufferGeometry[]>()
    const light = (color: string, g: THREE.BufferGeometry) => glow.set(color, [...(glow.get(color) ?? []), g])
    for (const c of CHIPS) {
      const y = c.y ?? 0
      const min: P3 = [c.at[0] - c.size[0] / 2, y, c.at[1] - c.size[2] / 2]
      const max: P3 = [c.at[0] + c.size[0] / 2, y + c.size[1], c.at[1] + c.size[2] / 2]
      bodies.push(boxGeometry(min, max))
      // Pins down the long sides
      const alongX = c.size[0] >= c.size[2]
      const length = alongX ? c.size[0] : c.size[2]
      const n = Math.max(2, Math.floor((length - 0.4) / 0.5))
      for (let i = 0; i < n; i++) {
        const u = -length / 2 + 0.2 + ((length - 0.4) * (i + 0.5)) / n
        for (const s of [-1, 1]) {
          const out = (alongX ? c.size[2] : c.size[0]) / 2
          const px = alongX ? c.at[0] + u : c.at[0] + s * (out + 0.08)
          const pz = alongX ? c.at[1] + s * (out + 0.08) : c.at[1] + u
          pins.push(boxGeometry([px - (alongX ? 0.1 : 0.12), y, pz - (alongX ? 0.12 : 0.1)], [px + (alongX ? 0.1 : 0.12), y + c.size[1] * 0.45, pz + (alongX ? 0.12 : 0.1)]))
        }
      }
      // The die: a glowing square on top; and glowing edges round the top
      const dx = c.size[0] * 0.3
      const dz = c.size[2] * 0.3
      light(c.color, boxGeometry([c.at[0] - dx, max[1], c.at[1] - dz], [c.at[0] + dx, max[1] + 0.02, c.at[1] + dz]))
      light(c.color, bars(boxRim(min, max, max[1] + 0.02), 0.07, 0.05))
    }
    for (const c of CAPACITORS) {
      cans.push(new THREE.CylinderGeometry(c.r, c.r, c.h, 24).translate(c.at[0], c.h / 2, c.at[1]))
      caps.push(new THREE.CylinderGeometry(c.r * 0.82, c.r * 0.82, 0.06, 24).translate(c.at[0], c.h + 0.03, c.at[1]))
      light(c.color, new THREE.TorusGeometry(c.r * 0.92, 0.05, 8, 32).rotateX(Math.PI / 2).translate(c.at[0], c.h + 0.02, c.at[1]))
      light(c.color, new THREE.CylinderGeometry(c.r + 0.01, c.r + 0.01, 0.08, 24, 1, true).translate(c.at[0], c.h * 0.25, c.at[1]))
    }
    const BANDS = [NEON.cyan, NEON.pink, NEON.yellow]
    for (const r of RESISTORS) {
      const turn = (g: THREE.BufferGeometry) => (r.along === 'x' ? g.rotateZ(Math.PI / 2) : g.rotateX(Math.PI / 2)).translate(r.at[0], 0.5, r.at[1])
      resistors.push(turn(new THREE.CylinderGeometry(0.42, 0.42, 1.6, 20)))
      for (const s of [-1, 1]) resistors.push(turn(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 20).translate(0, s * 0.95, 0)))
      BANDS.forEach((color, i) => light(color, turn(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 20).translate(0, (i - 1) * 0.4, 0))))
    }
    for (const s of SERVERS) {
      const min: P3 = [s.at[0] - s.size[0] / 2, 0, s.at[1] - s.size[2] / 2]
      const max: P3 = [s.at[0] + s.size[0] / 2, s.size[1], s.at[1] + s.size[2] / 2]
      servers.push(boxGeometry(min, max))
      // Rows of lit slits on all four faces
      const slits: [P3, P3][] = []
      for (let y = 0.45; y < s.size[1] - 0.25; y += 0.35) {
        const ix = s.size[0] * 0.3
        const iz = s.size[2] * 0.3
        slits.push([[s.at[0] - ix, y, min[2] - 0.02], [s.at[0] + ix, y, min[2] - 0.02]])
        slits.push([[s.at[0] - ix, y, max[2] + 0.02], [s.at[0] + ix, y, max[2] + 0.02]])
        slits.push([[min[0] - 0.02, y, s.at[1] - iz], [min[0] - 0.02, y, s.at[1] + iz]])
        slits.push([[max[0] + 0.02, y, s.at[1] - iz], [max[0] + 0.02, y, s.at[1] + iz]])
      }
      light(s.color, bars(slits, 0.05, 0.06))
      light(s.color, bars(boxRim(min, max, max[1] + 0.02), 0.07, 0.05))
    }
    return {
      bodies: merged(bodies),
      pins: merged(pins),
      cans: merged(cans),
      caps: merged(caps),
      resistors: merged(resistors),
      servers: merged(servers),
      glow: [...glow].map(([color, list]) => ({ color, geometry: merged(list) })),
    }
  }, [])
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {CHIPS.map((c, i) => (
        <CuboidCollider key={`chip${i}`} args={[c.size[0] / 2, c.size[1] / 2, c.size[2] / 2]} position={[c.at[0], (c.y ?? 0) + c.size[1] / 2, c.at[1]]} />
      ))}
      {SERVERS.map((s, i) => (
        <CuboidCollider key={`server${i}`} args={[s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]} position={[s.at[0], s.size[1] / 2, s.at[1]]} />
      ))}
      {CAPACITORS.map((c, i) => (
        <CylinderCollider key={`can${i}`} args={[c.h / 2, c.r]} position={[c.at[0], c.h / 2, c.at[1]]} />
      ))}
      {RESISTORS.map((r, i) => (
        <CylinderCollider key={`res${i}`} args={[1.2, 0.5]} position={[r.at[0], 0.5, r.at[1]]} rotation={r.along === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]} />
      ))}
      <mesh geometry={parts.bodies} material={chipBody} castShadow receiveShadow />
      <mesh geometry={parts.pins} material={pinLook} castShadow />
      <mesh geometry={parts.cans} material={canLook} castShadow receiveShadow />
      <mesh geometry={parts.caps} material={capLook} />
      <mesh geometry={parts.resistors} material={resistorLook} castShadow receiveShadow />
      <mesh geometry={parts.servers} material={serverLook} castShadow receiveShadow />
      {parts.glow.map((g) => (
        <mesh key={g.color} geometry={g.geometry} material={neon(g.color, 2)} />
      ))}
    </RigidBody>
  )
}

export function Arena() {
  useGrabEdges(EDGES)
  return (
    <group>
      <Floor />
      <FloorLines />
      <Fence />
      <StartPad side={-1} />
      <StartPad side={1} />
      <RigidBody type="fixed" colliders={false}>
        {[-1, 1].map((s) => (
          <CuboidCollider key={s} args={[SCREEN.thick / 2 + 0.15, SCREEN.top / 2, SCREEN.half + 0.15]} position={[s * SCREEN.x, SCREEN.top / 2, 0]} />
        ))}
        <Screen side={-1} />
        <Screen side={1} />
      </RigidBody>
      <Decks />
      <Stage />
      <Cover />
    </group>
  )
}
