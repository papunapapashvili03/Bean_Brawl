import type { ReactNode } from 'react'

// The landing page's drawings: the bean (the games' player) and a scene for each game's card, all SVG.
// Card scenes are 166 x 222, with the space at the bottom left for the card's title.

type BeanProps = { x: number; y: number; h?: number; color?: string; tilt?: number; flip?: boolean; arms?: 'down' | 'out' | 'up' | 'wave'; shadow?: boolean }

// A bean standing at (x, y), h tall
export function Bean({ x, y, h = 40, color = '#ff8a3d', tilt = 0, flip = false, arms = 'down', shadow = true }: BeanProps) {
  const w = h * 0.62
  const s = -h * 0.52 // shoulders
  const limbs: Record<NonNullable<BeanProps['arms']>, number[][]> = {
    down: [
      [-w * 0.46, s, -w * 0.68, s + h * 0.24],
      [w * 0.46, s, w * 0.68, s + h * 0.24],
    ],
    out: [
      [-w * 0.46, s, -w * 1.02, s - h * 0.08],
      [w * 0.46, s, w * 1.02, s - h * 0.08],
    ],
    up: [
      [-w * 0.4, s - h * 0.05, -w * 0.5, s - h * 0.58],
      [w * 0.4, s - h * 0.05, w * 0.5, s - h * 0.58],
    ],
    wave: [
      [-w * 0.46, s, -w * 0.68, s + h * 0.24],
      [w * 0.42, s - h * 0.04, w * 0.9, s - h * 0.42],
    ],
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${flip ? -1 : 1} 1)`}>
      {shadow && <ellipse cx={0} cy={0} rx={w * 0.62} ry={h * 0.06} fill="#000" opacity={0.22} />}
      {limbs[arms].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w * 0.24} strokeLinecap="round" />
      ))}
      <rect x={-w / 2} y={-h} width={w} height={h} rx={w / 2} fill={color} />
      <rect x={w * 0.1} y={-h * 0.95} width={w * 0.38} height={h * 0.9} rx={w * 0.19} fill="#000" opacity={0.1} />
      <rect x={-w * 0.36} y={-h * 0.9} width={w * 0.15} height={h * 0.36} rx={w * 0.075} fill="#fff" opacity={0.38} />
      <ellipse cx={w * 0.02} cy={-h * 0.7} rx={h * 0.042} ry={h * 0.068} fill="#1d1b2e" />
      <ellipse cx={w * 0.27} cy={-h * 0.7} rx={h * 0.042} ry={h * 0.068} fill="#1d1b2e" />
      <circle cx={w * 0.035} cy={-h * 0.725} r={h * 0.016} fill="#fff" />
      <circle cx={w * 0.285} cy={-h * 0.725} r={h * 0.016} fill="#fff" />
      <path d={`M${-w * 0.02} ${-h * 0.57} q${w * 0.165} ${h * 0.075} ${w * 0.33} 0`} stroke="#1d1b2e" strokeWidth={h * 0.032} fill="none" strokeLinecap="round" />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Pieces the scenes share

function Bg({ id, stops }: { id: string; stops: [string, string, string] }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.55" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
      </defs>
      <rect width={166} height={222} fill={`url(#${id}-bg)`} />
    </>
  )
}

const Cloud = ({ x, y, s = 1, o = 0.9 }: { x: number; y: number; s?: number; o?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={o}>
    <circle cx={0} cy={0} r={10} />
    <circle cx={12} cy={-6} r={13} />
    <circle cx={27} cy={-1} r={10} />
    <rect x={-6} y={0} width={40} height={9} rx={4.5} />
  </g>
)

const Platform = ({ x, y, w, top, side }: { x: number; y: number; w: number; top: string; side: string }) => (
  <g>
    <rect x={x} y={y} width={w} height={14} rx={5} fill={side} />
    <rect x={x} y={y - 4} width={w} height={10} rx={5} fill={top} />
  </g>
)

// An isometric box standing on (x, y), s tall
function Box({ x, y, s, top, left, right }: { x: number; y: number; s: number; top: string; left: string; right: string }) {
  const a = s * 0.62
  const b = s * 0.34
  return (
    <g>
      <path d={`M${x - a} ${y - b} L${x} ${y} L${x} ${y - s} L${x - a} ${y - b - s}Z`} fill={left} />
      <path d={`M${x} ${y} L${x + a} ${y - b} L${x + a} ${y - b - s} L${x} ${y - s}Z`} fill={right} />
      <path d={`M${x} ${y - s} L${x + a} ${y - b - s} L${x} ${y - 2 * b - s} L${x - a} ${y - b - s}Z`} fill={top} />
    </g>
  )
}

const House = ({ x, y, w, h, wall, roof }: { x: number; y: number; w: number; h: number; wall: string; roof: string }) => (
  <g>
    <rect x={x} y={y - h} width={w} height={h} fill={wall} />
    <path d={`M${x - 3} ${y - h} L${x + w / 2} ${y - h - w * 0.45} L${x + w + 3} ${y - h}Z`} fill={roof} />
    <rect x={x + w * 0.38} y={y - h * 0.55} width={w * 0.24} height={h * 0.55} fill="#5a2d1a" opacity={0.75} />
  </g>
)

const Crosshair = ({ x, y, r, color = '#fff', w = 2.5 }: { x: number; y: number; r: number; color?: string; w?: number }) => (
  <g stroke={color} strokeWidth={w} fill="none" strokeLinecap="round">
    <circle cx={x} cy={y} r={r} />
    <path d={`M${x} ${y - r - 6}v8M${x} ${y + r - 2}v8M${x - r - 6} ${y}h8M${x + r - 2} ${y}h8`} />
    <circle cx={x} cy={y} r={1.6} fill={color} stroke="none" />
  </g>
)

// A hexagonal floor tile seen from above at a slant: its top (squashed) and its side, centred on (x, y)
function HexTile({ x, y, r, top, side, o = 1 }: { x: number; y: number; r: number; top: string; side: string; o?: number }) {
  const h = r * 0.5
  const pts = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (Math.PI / 3) * k
    return [x + r * Math.cos(a), y + h * Math.sin(a)]
  })
  const face = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const band = [pts[0], pts[1], pts[2], pts[3]]
  const bandPath = `M${band.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L')} l0 ${r * 0.32} L${band
    .slice()
    .reverse()
    .slice(1)
    .map(([px, py]) => `${px.toFixed(1)} ${(py + r * 0.32).toFixed(1)}`)
    .join(' L')} Z`
  return (
    <g opacity={o}>
      <path d={bandPath} fill={side} />
      <polygon points={face} fill={top} />
      <polygon points={face} fill="#fff" opacity={0.18} transform={`translate(${x} ${y}) scale(0.62) translate(${-x} ${-y})`} />
    </g>
  )
}

// A floor of hex tiles: rows along x, every other row shifted; `missing` are [row, column] left out
function HexFloor({ x, y, r, rows, cols, top, side, missing = [] }: { x: number; y: number; r: number; rows: number; cols: number; top: string; side: string; missing?: [number, number][] }) {
  const tiles: ReactNode[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (missing.some(([mr, mc]) => mr === row && mc === col)) continue
      tiles.push(<HexTile key={`${row}-${col}`} x={x + col * r * 3 + (row % 2) * r * 1.5} y={y + row * r * 0.5} r={r * 0.94} top={top} side={side} />)
    }
  }
  return <g>{tiles}</g>
}

// A hexagonal pillar: a hex top like a tile's, and its side going a long way down (t), centred on (x, y)
function HexPillar({ x, y, r, t, top, side, glow }: { x: number; y: number; r: number; t: number; top: string; side: string; glow?: string }) {
  const h = r * 0.5
  const pts = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (Math.PI / 3) * k
    return [x + r * Math.cos(a), y + h * Math.sin(a)]
  })
  const face = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const [p0, p1, p2, p3] = pts
  const sideD = `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} L${p3[0].toFixed(1)} ${p3[1].toFixed(1)} L${p3[0].toFixed(1)} ${(p3[1] + t).toFixed(1)} L${p2[0].toFixed(1)} ${(p2[1] + t).toFixed(1)} L${p1[0].toFixed(1)} ${(p1[1] + t).toFixed(1)} L${p0[0].toFixed(1)} ${(p0[1] + t).toFixed(1)} Z`
  return (
    <g>
      <path d={sideD} fill={side} />
      <polygon points={face} fill={top} />
      <polygon points={face} fill={glow ?? '#fff'} opacity={glow ? 0.55 : 0.16} transform={`translate(${x} ${y}) scale(0.66) translate(${-x} ${-y})`} />
    </g>
  )
}

// A square floor tile seen from above at a slant: a diamond (2a across, 2b deep) with its middle at (x, y),
// and its two near sides, t deep
type SlabLook = { top: string; left: string; right: string; o?: number }
function Slab({ x, y, a, b, t, top, left, right, o = 1 }: { x: number; y: number; a: number; b: number; t: number } & SlabLook) {
  return (
    <g opacity={o}>
      <path d={`M${x - a} ${y} L${x} ${y + b} L${x} ${y + b + t} L${x - a} ${y + t}Z`} fill={left} />
      <path d={`M${x} ${y + b} L${x + a} ${y} L${x + a} ${y + t} L${x} ${y + b + t}Z`} fill={right} />
      <path d={`M${x} ${y - b} L${x + a} ${y} L${x} ${y + b} L${x - a} ${y}Z`} fill={top} />
    </g>
  )
}

// An n by n floor of them, its middle at (x, y), drawn back to front; `look` says how each tile looks (null:
// not there), and `drop` how far below the floor it's fallen
function SlabFloor({ x, y, a, b, t, n, look, drop = () => 0 }: { x: number; y: number; a: number; b: number; t: number; n: number; look: (i: number, j: number) => SlabLook | null; drop?: (i: number, j: number) => number }) {
  const tiles: ReactNode[] = []
  for (let s = 0; s <= 2 * (n - 1); s++) {
    for (let i = Math.max(0, s - n + 1); i <= Math.min(n - 1, s); i++) {
      const j = s - i
      const l = look(i, j)
      if (!l) continue
      const c = (n - 1) / 2
      tiles.push(<Slab key={`${i}-${j}`} x={x + (i - j) * a} y={y + (i + j - 2 * c) * b + drop(i, j)} a={a * 0.94} b={b * 0.94} t={t} {...l} />)
    }
  }
  return <g>{tiles}</g>
}

// ---------------------------------------------------------------------------------------------------------
// The scenes
const SCENES: Record<string, () => ReactNode> = {
  sky: () => (
    <>
      <Bg id="sky" stops={['#5ab8ff', '#8a84ff', '#5b40cc']} />
      <circle cx={130} cy={40} r={34} fill="#fff6c9" opacity={0.22} />
      <circle cx={130} cy={40} r={20} fill="#fff6c9" opacity={0.9} />
      <Cloud x={18} y={44} />
      <Cloud x={112} y={96} s={0.7} o={0.75} />
      <Cloud x={6} y={162} s={0.9} o={0.6} />
      <Platform x={50} y={66} w={46} top="#7ef0c4" side="#2fa880" />
      <path d="M56 62V44a17 17 0 0 1 34 0v18" fill="none" stroke="#fff" strokeWidth={4} />
      <path d="M58 36h30" stroke="#ff5c8a" strokeWidth={5} strokeDasharray="5 5" />
      <Platform x={96} y={110} w={56} top="#ff8fc0" side="#cf4f88" />
      <Platform x={12} y={134} w={62} top="#ffd25c" side="#de9420" />
      <Bean x={84} y={104} h={28} tilt={16} arms="up" shadow={false} />
    </>
  ),
  tower: () => (
    <>
      <Bg id="tower" stops={['#ffc25a', '#f08a1c', '#a8520b']} />
      <rect x={56} y={30} width={54} height={200} fill="#ffe8bd" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M56 ${52 + i * 34}L110 ${38 + i * 34}V${48 + i * 34}L56 ${62 + i * 34}Z`} fill="#f39a3d" />
      ))}
      <rect x={90} y={30} width={20} height={200} fill="#000" opacity={0.09} />
      <path d="M50 30h66v-10h-8v5h-8v-5h-8v5h-8v-5h-8v5h-8v-5h-8v5h-10z" fill="#fff1d6" />
      <path d="M83 20V2" stroke="#7a3b0c" strokeWidth={2.5} />
      <path d="M83 3l20 6-20 6z" fill="#ff4d6d" />
      <rect x={34} y={96} width={26} height={7} rx={2} fill="#8a4a1a" />
      <rect x={106} y={128} width={26} height={7} rx={2} fill="#8a4a1a" />
      <rect x={34} y={160} width={26} height={7} rx={2} fill="#8a4a1a" />
      <Bean x={46} y={160} h={26} arms="up" />
      <Bean x={119} y={128} h={22} color="#4f8bff" arms="wave" flip />
    </>
  ),
  neon: () => {
    const rays = [-6, -4, -2, -1, 0, 1, 2, 4, 6]
    const rows = [0, 1, 2, 3, 4, 5, 6].map((i) => 112 + i * i * 2.4 + i * 3)
    const grid = (
      <>
        {rays.map((k) => (
          <line key={k} x1={83 + k * 3} y1={112} x2={83 + k * 34} y2={222} />
        ))}
        {rows.map((y) => (
          <line key={y} x1={0} y1={y} x2={166} y2={y} />
        ))}
      </>
    )
    return (
      <>
        <Bg id="neon" stops={['#3a0f6e', '#200847', '#0e0326']} />
        <defs>
          <linearGradient id="neon-sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd84d" />
            <stop offset="1" stopColor="#ff3fb4" />
          </linearGradient>
        </defs>
        <circle cx={83} cy={86} r={30} fill="url(#neon-sun)" />
        {[92, 100, 107].map((y, i) => (
          <rect key={y} x={50} y={y} width={66} height={2 + i} fill="#200847" />
        ))}
        <rect x={0} y={112} width={166} height={110} fill="#14042e" />
        <g stroke="#ff3fd0" strokeWidth={4} opacity={0.25}>
          {grid}
        </g>
        <g stroke="#ff6be0" strokeWidth={1.2}>
          {grid}
        </g>
        <path d="M36 150V112a47 47 0 0 1 94 0v38" fill="none" stroke="#33e6ff" strokeWidth={9} opacity={0.25} />
        <path d="M36 150V112a47 47 0 0 1 94 0v38" fill="none" stroke="#7af3ff" strokeWidth={3} />
        <ellipse cx={83} cy={152} rx={22} ry={5} fill="#33e6ff" opacity={0.35} />
        <Bean x={83} y={152} h={30} arms="out" />
      </>
    )
  },
  gym: () => (
    <>
      <Bg id="gym" stops={['#4fe08a', '#1f9a5a', '#0e5c36']} />
      <ellipse cx={-6} cy={20} rx={40} ry={26} fill="#0f6b3d" opacity={0.6} />
      <ellipse cx={170} cy={196} rx={44} ry={30} fill="#0f6b3d" opacity={0.5} />
      <rect x={16} y={30} width={8} height={200} rx={3} fill="#ffcf4a" />
      <rect x={142} y={30} width={8} height={200} rx={3} fill="#ffcf4a" />
      <rect x={10} y={38} width={146} height={7} rx={3.5} fill="#ff6b4a" />
      {[34, 52, 70, 88, 106, 124].map((x) => (
        <circle key={x} cx={x} cy={52} r={3.2} fill="#fff1c9" />
      ))}
      <rect x={10} y={50} width={146} height={4} rx={2} fill="#e04f31" opacity={0.6} />
      <path d="M40 54c-4 30 6 50-2 82" stroke="#e8c48a" strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M126 54c4 26-6 46 2 70" stroke="#e8c48a" strokeWidth={4} fill="none" strokeLinecap="round" />
      <Bean x={82} y={90} h={34} arms="up" shadow={false} tilt={-6} />
      <Bean x={39} y={152} h={22} color="#ff5c8a" arms="up" shadow={false} />
    </>
  ),
  crumble: () => (
    <>
      <Bg id="crumble" stops={['#e6c58a', '#b5884f', '#6f4a27']} />
      <path d="M44 40l8-6 6 5 7-8 9 6 6-4 10 7 8-5 8 6 6-3 10 4v160H44z" fill="#dcbd88" />
      {[54, 68, 82, 96, 110, 124, 138, 152].map((y, i) => (
        <g key={y} stroke="#b08a54" strokeWidth={1.4}>
          <line x1={44} y1={y} x2={122} y2={y} />
          {[0, 1, 2, 3].map((j) => (
            <line key={j} x1={54 + j * 20 + (i % 2) * 10} y1={y} x2={54 + j * 20 + (i % 2) * 10} y2={y + 14} />
          ))}
        </g>
      ))}
      <rect x={98} y={36} width={24} height={150} fill="#000" opacity={0.1} />
      <path d="M70 60l8 14-6 10 10 16-4 12" stroke="#5a3d1d" strokeWidth={2} fill="none" />
      <g fill="#cfae76" stroke="#8a6638" strokeWidth={1.2}>
        <rect x={128} y={52} width={14} height={10} transform="rotate(24 135 57)" />
        <rect x={20} y={84} width={12} height={9} transform="rotate(-18 26 88)" />
        <rect x={134} y={112} width={10} height={8} transform="rotate(40 139 116)" />
        <rect x={16} y={140} width={9} height={7} transform="rotate(12 20 143)" />
      </g>
      <ellipse cx={83} cy={196} rx={80} ry={18} fill="#9c7646" />
      <ellipse cx={83} cy={192} rx={76} ry={15} fill="#c19a63" />
      <Bean x={40} y={196} h={26} arms="out" tilt={-8} />
      <Bean x={128} y={190} h={22} color="#6c63ff" arms="up" />
    </>
  ),
  tilt: () => (
    <>
      <Bg id="tilt" stops={['#ffe066', '#f6a91c', '#c9690c']} />
      <Cloud x={20} y={38} s={0.8} o={0.7} />
      <path d="M70 200l13-44 13 44z" fill="#b85f0a" />
      <g transform="rotate(-12 83 150)">
        <rect x={4} y={148} width={158} height={10} rx={4} fill="#d68a1c" />
        <rect x={4} y={140} width={158} height={12} rx={4} fill="#fff4cf" />
        <House x={16} y={140} w={26} h={20} wall="#ff7a59" roof="#7a3cff" />
        <House x={118} y={140} w={30} h={24} wall="#6fd3ff" roof="#ff4d6d" />
        <Bean x={80} y={140} h={30} arms="out" />
      </g>
      <g transform="rotate(28 150 190)">
        <House x={138} y={196} w={20} h={16} wall="#8bf08b" roof="#2f6bff" />
      </g>
    </>
  ),
  hex: () => (
    <>
      <Bg id="hex" stops={['#7fd4ff', '#9b8bff', '#5b3fc9']} />
      <Cloud x={112} y={30} s={0.7} o={0.75} />
      <HexFloor x={-6} y={186} r={12} rows={3} cols={6} top="#9a6bff" side="#5d3bb8" />
      <HexFloor x={-6} y={146} r={12} rows={3} cols={6} top="#ffd23f" side="#c99a15" missing={[[0, 2], [1, 3], [2, 1]]} />
      <HexFloor x={-6} y={102} r={12} rows={3} cols={6} top="#ff5c8a" side="#c23461" missing={[[0, 1], [0, 4], [1, 2], [1, 3], [2, 0], [2, 4]]} />
      <g transform="rotate(18 70 132)">
        <HexTile x={70} y={132} r={10} top="#ffb3c8" side="#c23461" o={0.85} />
      </g>
      <Bean x={100} y={98} h={26} arms="up" />
      <Bean x={46} y={150} h={24} color="#4f8bff" arms="out" />
    </>
  ),
  ice: () => {
    const ice = (light: string, mid: string, dark: string, gone: string[] = []) => (i: number, j: number) => (gone.includes(`${i}${j}`) ? null : { top: light, left: mid, right: dark })
    const crack = 'M0 0l5 -2l4 3M0 0l-4 -3l-5 1M0 0l1 5l-3 3'
    return (
      <>
        <Bg id="ice" stops={['#e6f7ff', '#93d2ff', '#3d79d1']} />
        <Cloud x={112} y={26} s={0.7} o={0.8} />
        <SlabFloor x={83} y={184} a={15} b={8} t={6} n={4} look={ice('#9fd2ff', '#5f9fe0', '#4a88cc', ['12', '30'])} />
        <SlabFloor x={83} y={128} a={15} b={8} t={6} n={4} look={ice('#c6e8ff', '#7fb8ea', '#679fd6', ['11', '21', '23', '02'])} />
        <SlabFloor x={83} y={72} a={15} b={8} t={6} n={4} look={ice('#eefaff', '#a6d6f5', '#8cc1e8', ['10', '22', '13', '31', '32'])} />
        <g stroke="#2f6fa8" strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.8}>
          <path d={crack} transform="translate(83 48)" />
          <path d={crack} transform="translate(113 64) scale(-1 1)" />
          <path d={crack} transform="translate(83 96) rotate(40)" />
          <path d={crack} transform="translate(53 64) rotate(-30)" />
        </g>
        <Bean x={98} y={73} h={24} arms="up" />
        <Bean x={53} y={137} h={22} color="#4f8bff" arms="out" />
        <g fill="#fff">
          {[
            [18, 52, 1.8],
            [140, 60, 1.5],
            [30, 112, 1.4],
            [150, 120, 2],
            [126, 160, 1.4],
            [14, 168, 1.7],
            [58, 30, 1.3],
            [100, 112, 1.2],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      </>
    )
  },
  color: () => {
    const shades: Record<string, [string, string, string]> = {
      p: ['#ff8fd0', '#d65ba8', '#c04a94'],
      y: ['#ffe23f', '#d1b420', '#bba117'],
      c: ['#4fd8f0', '#2aaac2', '#2096ab'],
      g: ['#22a85a', '#17803f', '#127036'],
      v: ['#9a5cff', '#7339d6', '#6430bd'],
    }
    const pattern = ['ycgpv', 'pvycg', 'gcpvy', 'vgypc', 'cpgvy']
    const called = (i: number, j: number) => pattern[j][i] === 'p'
    const look = (i: number, j: number) => {
      const [top, left, right] = shades[pattern[j][i]]
      return { top, left, right, o: called(i, j) ? 1 : 0.22 }
    }
    return (
      <>
        <Bg id="color" stops={['#b8f1ff', '#7fa6ff', '#6447d6']} />
        <Cloud x={14} y={70} s={0.7} o={0.7} />
        <rect x={43} y={22} width={80} height={30} rx={11} fill="#ff8fd0" stroke="#fff" strokeWidth={3} />
        <rect x={53} y={41} width={60} height={4} rx={2} fill="#3a0026" opacity={0.25} />
        <rect x={53} y={41} width={34} height={4} rx={2} fill="#3a0026" opacity={0.7} />
        <rect x={56} y={29} width={54} height={6} rx={3} fill="#3a0026" opacity={0.75} />
        <SlabFloor x={83} y={130} a={16} b={8.5} t={7} n={5} look={look} drop={(i, j) => (called(i, j) ? 0 : 26 + ((i * 7 + j * 3) % 5) * 4)} />
        <Bean x={83} y={131} h={24} arms="up" />
        <Bean x={35} y={139} h={22} color="#4f8bff" />
        <Bean x={131} y={122} h={22} color="#ffd23f" arms="out" flip />
      </>
    )
  },
  whirly: () => {
    const blade = (cx: number, cy: number, r: number, a: number) =>
      [0, 1, 2, 3].map((k) => {
        const t = a + (k * Math.PI) / 2
        return <line key={k} x1={cx} y1={cy} x2={cx + r * Math.cos(t)} y2={cy + r * Math.sin(t)} stroke="#ff3d9a" strokeWidth={r * 0.28} strokeLinecap="round" />
      })
    return (
      <>
        <Bg id="whirly" stops={['#9fd4ff', '#f7c6e6', '#c48bff']} />
        <Cloud x={14} y={40} s={0.7} o={0.8} />
        <Cloud x={120} y={150} s={0.6} o={0.6} />
        {/* the hot air balloon */}
        <ellipse cx={138} cy={44} rx={13} ry={15} fill="#ffd27a" />
        <rect x={134} y={62} width={8} height={6} rx={1} fill="#8a5a35" />
        {/* the deck, its nets and the fan gantry */}
        <path d="M10 214 L36 128 L130 128 L156 214Z" fill="#4fc3ff" />
        <path d="M10 214 L36 128 L36 120 L8 206Z" fill="#8a5cf6" />
        <path d="M156 214 L130 128 L130 120 L158 206Z" fill="#8a5cf6" />
        <path d="M60 214 L72 128M106 214 L94 128" stroke="#fff" strokeWidth={2} opacity={0.8} />
        <rect x={22} y={72} width={122} height={7} fill="#ffd23f" />
        <rect x={22} y={72} width={6} height={60} fill="#ffd23f" />
        <rect x={138} y={72} width={6} height={60} fill="#ffd23f" />
        <g opacity={0.9}>{blade(83, 92, 34, 0.5)}</g>
        <circle cx={83} cy={92} r={6} fill="#ffffff" />
        <path d="M44 178 l10 -14 l10 14z M102 178 l10 -14 l10 14z" fill="#ffd23f" />
        <Bean x={70} y={200} h={24} arms="out" />
        <Bean x={112} y={150} h={18} color="#4f8bff" arms="up" />
      </>
    )
  },
  jump: () => {
    const cx = 83
    const cy = 146
    const rx = 74
    const ry = 34
    const at = (a: number, lift = 0): [number, number] => [cx + rx * Math.cos(a), cy + ry * Math.sin(a) - lift]
    const colours = ['#ff6fb1', '#ffd23f', '#4fc3ff', '#9be15d', '#ff9a3c', '#b388ff', '#36d6b0', '#ff5c6c']
    const wedge = (k: number) => {
      const a0 = (k * Math.PI) / 4
      const [x0, y0] = at(a0)
      const [x1, y1] = at(a0 + Math.PI / 4)
      return `M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${rx} ${ry} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`
    }
    const beam = (a: number, lift: number) => {
      const [x0, y0] = at(a, lift)
      const [x1, y1] = at(a + Math.PI, lift)
      return `M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`
    }
    return (
      <>
        <Bg id="jump" stops={['#ffe1f0', '#ff9fd0', '#8a5cff']} />
        <Cloud x={18} y={40} s={0.8} o={0.75} />
        <Cloud x={118} y={70} s={0.6} o={0.6} />
        <ellipse cx={cx} cy={cy + 9} rx={rx} ry={ry} fill="#5a3f8a" />
        {colours.map((c, k) => (k === 6 ? null : <path key={k} d={wedge(k)} fill={c} />))}
        <path d={beam(0.35, 3)} stroke="#ff4d5e" strokeWidth={6} strokeLinecap="round" />
        <rect x={cx - 10} y={cy - 40} width={20} height={40} fill="#f4f1ff" />
        <ellipse cx={cx} cy={cy - 40} rx={10} ry={4.5} fill="#7a4dff" />
        <ellipse cx={cx} cy={cy} rx={10} ry={4.5} fill="#e2ddff" />
        <path d={beam(2.1, 30)} stroke="#4f6bff" strokeWidth={6} strokeLinecap="round" />
        <Bean x={128} y={136} h={24} arms="up" />
        <Bean x={44} y={152} h={17} color="#4f8bff" />
        <Bean x={70} y={178} h={18} color="#ffd23f" arms="out" />
      </>
    )
  },
  panic: () => {
    const look = (i: number, j: number) => {
      const gap = i === 2 || i === 3
      if (j === 4 && !gap) return null
      const tones: Record<number, [string, string, string]> = {
        3: ['#ff3b4e', '#c42a3a', '#b02434'],
        2: ['#ff7a3c', '#cf5a26', '#ba4f20'],
        1: ['#ffc23f', '#d19d20', '#bb8c18'],
      }
      const [top, left, right] = !gap && tones[j] ? tones[j] : (i + j) % 2 ? ['#e6e9ff', '#b6bce6', '#a4abd9'] : ['#d3d8f7', '#a7aedd', '#959ccf']
      return { top, left, right }
    }
    return (
      <>
        <Bg id="panic" stops={['#d6e0ff', '#9fb2ff', '#5a4fd6']} />
        <Cloud x={112} y={32} s={0.7} o={0.75} />
        <rect x={43} y={22} width={80} height={30} rx={11} fill="#ff5a3c" stroke="#fff" strokeWidth={3} />
        <rect x={56} y={29} width={54} height={6} rx={3} fill="#fff" opacity={0.95} />
        <rect x={53} y={41} width={60} height={4} rx={2} fill="#fff" opacity={0.3} />
        <rect x={53} y={41} width={26} height={4} rx={2} fill="#fff" opacity={0.9} />
        <SlabFloor x={83} y={132} a={13} b={7} t={6} n={6} look={(i, j) => (j === 4 && !(i === 2 || i === 3) ? { top: '#d3d8f7', left: '#a7aedd', right: '#959ccf', o: 0.35 } : null)} drop={() => 26} />
        <SlabFloor x={83} y={132} a={13} b={7} t={6} n={6} look={look} />
        <Bean x={70} y={147} h={21} arms="up" />
        <Bean x={57} y={140} h={19} color="#4f8bff" />
        <Bean x={83} y={126} h={19} color="#36c2a0" arms="out" flip />
      </>
    )
  },
  lava: () => {
    // Pillars at their heights over the lava, back to front; one glowing, about to sink
    const pillars: [number, number, number, string?][] = [
      [40, 92, 58],
      [83, 82, 66],
      [126, 96, 54],
      [18, 128, 50],
      [61, 122, 56, '#ff5a2a'],
      [104, 118, 60],
      [148, 132, 46],
      [40, 160, 44],
      [83, 152, 50],
      [126, 166, 40],
    ]
    return (
      <>
        <Bg id="lava" stops={['#3d2466', '#b2456e', '#ff8a4a']} />
        <circle cx={128} cy={34} r={14} fill="#ffd27a" opacity={0.85} />
        <path d="M0 150 Q40 140 83 146 T166 140 L166 222 L0 222Z" fill="#ff6a1f" />
        <path d="M0 150 Q40 140 83 146 T166 140" stroke="#ffe066" strokeWidth={3} fill="none" opacity={0.8} />
        <g stroke="#ffd04a" strokeWidth={2} fill="none" opacity={0.75} strokeLinecap="round">
          <path d="M8 180 l14 -6 l10 8 l16 -4M60 200 l12 -8 l14 6 l10 -10M112 186 l14 4 l10 -8 l20 6M20 212 l18 -6 l12 4" />
        </g>
        {pillars.map(([x, y, t, glow], i) => (
          <HexPillar key={i} x={x} y={y} r={17} t={t} top={glow ? '#ff9a6c' : '#78aaf0'} side={glow ? '#c2452a' : '#4a7bd0'} glow={glow} />
        ))}
        <g fill="#ffb347">
          {[
            [24, 70, 1.6],
            [140, 64, 1.3],
            [70, 52, 1.2],
            [110, 140, 1.5],
            [150, 104, 1.2],
            [30, 110, 1.3],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
        <Bean x={83} y={84} h={24} arms="up" />
        <Bean x={104} y={118} h={20} color="#4f8bff" arms="out" flip />
        <Bean x={40} y={94} h={19} color="#ffd23f" />
      </>
    )
  },
  over: () => (
    <>
      <Bg id="over" stops={['#8fd3ff', '#bfe6ff', '#e7f6ff']} />
      <Cloud x={14} y={46} s={0.8} o={0.85} />
      <Cloud x={118} y={84} s={0.6} o={0.7} />
      {/* The track, going away up the card between its yellow rails */}
      <path d="M8 222 L64 70 L102 70 L158 222Z" fill="#ff5d7e" />
      <path d="M8 222 L64 70 L68 70 L18 222Z" fill="#ffd23f" />
      <path d="M158 222 L102 70 L98 70 L148 222Z" fill="#ffd23f" />
      <path d="M8 222 L64 70 L64 78 L4 222Z" fill="#7a4fd8" opacity={0.85} />
      {/* Bars on teal posts: a gate far off, hurdles nearer */}
      {[
        [84, 0.92, 22],
        [118, 0.72, 0],
        [166, 0.44, 0],
      ].map(([y, s, up], i) => {
        const half = 17 + (y - 70) * 0.48
        return (
          <g key={i}>
            <rect x={83 - half - 6} y={y - 12 - up} width={4} height={14 + up} fill="#1fb5a8" />
            <rect x={83 + half + 2} y={y - 12 - up} width={4} height={14 + up} fill="#1fb5a8" />
            <rect x={83 - half - 6} y={y - 12 - up} width={half * 2 + 12} height={Math.max(3, 6 * (1 - s) + 2)} rx={2} fill="#3ddc62" />
          </g>
        )
      })}
      <Bean x={83} y={150} h={26} arms="up" />
      <Bean x={58} y={198} h={22} color="#4f8bff" arms="out" />
      <Bean x={110} y={104} h={16} color="#ffd23f" tilt={-70} />
    </>
  ),
  rush: () => {
    const cell = (x: number, kind: string) => {
      const fill = kind === 'c' ? '#ff5a4e' : kind === 't' ? '#e5382f' : '#a3a7b5'
      const edge = kind === 'c' ? '#c4302a' : kind === 't' ? '#8c1b16' : '#7d8291'
      return (
        <g key={x}>
          <rect x={x} y={70} width={15} height={34} fill={fill} stroke={edge} strokeWidth={2} />
          {kind === 'c' && <path d={`M${x + 3} ${74} l5 9 l-2 7 l6 9`} stroke="#7a1410" strokeWidth={1.6} fill="none" />}
          {kind === 't' && <rect x={x + 1} y={84} width={13} height={6} fill="#f5ead7" />}
        </g>
      )
    }
    const wall = 'ss_cssts_s'
    return (
      <>
        <Bg id="rush" stops={['#9fd8ff', '#c9ebff', '#7ee03c']} />
        <Cloud x={112} y={30} s={0.7} o={0.85} />
        {/* The stage, coming towards us, slime either side */}
        <path d="M0 160 L166 160 L166 222 L0 222Z" fill="#7ee03c" />
        <path d="M30 104 L136 104 L160 222 L6 222Z" fill="#6c7cf0" />
        <path d="M30 104 L136 104 L138 112 L28 112Z" fill="#7f8ef7" />
        <path d="M30 104 L6 222 M136 104 L160 222" stroke="#ff2a3d" strokeWidth={3} />
        <path d="M30 104 L6 222 M136 104 L160 222" stroke="#ff4a5a" strokeWidth={8} opacity={0.3} />
        {/* The wall of blocks */}
        {wall.split('').map((k, i) => (k === '_' ? null : cell(8 + i * 15, k)))}
        <Bean x={53} y={112} h={20} color="#4f8bff" arms="out" />
        <Bean x={83} y={176} h={28} arms="up" />
        <Bean x={124} y={150} h={22} color="#ffd23f" flip />
      </>
    )
  },
  random: () => (
    <>
      <Bg id="random" stops={['#3fe0c5', '#3a8cff', '#5b2fd0']} />
      <g fill="#fff" opacity={0.55}>
        <circle cx={28} cy={36} r={2.5} />
        <circle cx={140} cy={28} r={2} />
        <circle cx={128} cy={70} r={1.6} />
        <circle cx={22} cy={96} r={1.8} />
      </g>
      <Box x={83} y={150} s={58} top="#ffffff" left="#d6dcff" right="#b3bcf5" />
      <g fill="#3b3f8f">
        <ellipse cx={83} cy={82} rx={6} ry={3.4} />
        <ellipse cx={68} cy={88} rx={5} ry={3} />
        <ellipse cx={98} cy={76} rx={5} ry={3} />
        <ellipse cx={58} cy={118} rx={3.6} ry={5.4} />
        <ellipse cx={72} cy={134} rx={3.6} ry={5.4} />
        <ellipse cx={100} cy={118} rx={3.6} ry={5.4} />
        <ellipse cx={108} cy={124} rx={3.6} ry={5.4} />
        <ellipse cx={100} cy={134} rx={3.6} ry={5.4} />
        <ellipse cx={108} cy={140} rx={3.6} ry={5.4} />
      </g>
      <Bean x={34} y={190} h={30} arms="up" />
      <Bean x={134} y={192} h={28} color="#ff5c8a" flip arms="wave" />
    </>
  ),
  arena: () => (
    <>
      <Bg id="arena" stops={['#ff5c7c', '#cf2352', '#7a0f33']} />
      <g fill="#fff" opacity={0.8}>
        <rect x={24} y={30} width={6} height={3} transform="rotate(30 27 31)" />
        <rect x={130} y={44} width={6} height={3} transform="rotate(-20 133 45)" />
        <rect x={84} y={20} width={5} height={3} transform="rotate(60 86 21)" />
      </g>
      <Box x={44} y={178} s={30} top="#7ff0e0" left="#2fb6a6" right="#239485" />
      <Box x={80} y={178} s={30} top="#ffe27a" left="#e5b52a" right="#c99a15" />
      <Box x={62} y={148} s={30} top="#c7a2ff" left="#8b5cf6" right="#6d3fe0" />
      <Bean x={128} y={186} h={34} flip arms="out" color="#4f8bff" />
      <Crosshair x={124} y={150} r={15} />
    </>
  ),
  villa: () => (
    <>
      <Bg id="villa" stops={['#8ae8dc', '#33a896', '#145f55']} />
      <circle cx={40} cy={44} r={18} fill="#fff6d0" opacity={0.85} />
      <path d="M0 116Q60 88 120 104T166 96V222H0z" fill="#2c8a6e" />
      <rect x={72} y={86} width={52} height={30} fill="#fff4e6" />
      <rect x={100} y={70} width={30} height={22} fill="#fff4e6" />
      <path d="M68 88l28-14 32 14z" fill="#e26d3d" />
      <path d="M97 72l18-10 18 10z" fill="#e26d3d" />
      <g fill="#4a88c7">
        <rect x={78} y={96} width={8} height={10} />
        <rect x={92} y={96} width={8} height={10} />
        <rect x={108} y={78} width={8} height={9} />
      </g>
      <ellipse cx={58} cy={96} rx={6} ry={22} fill="#1d6b4a" />
      <ellipse cx={142} cy={96} rx={6} ry={20} fill="#1d6b4a" />
      <path d="M0 150Q70 114 166 140V222H0z" fill="#3fb07d" />
      <Bean x={46} y={172} h={30} arms="wave" />
      <Crosshair x={124} y={150} r={11} w={2} color="#ffffffcc" />
    </>
  ),
  suburb: () => (
    <>
      <Bg id="suburb" stops={['#7ad6ff', '#3f95e6', '#24579e']} />
      <g transform="translate(0 -24)">
        <Cloud x={112} y={30} s={0.8} o={0.8} />
        <rect x={104} y={84} width={60} height={56} fill="#5fd1c4" />
        <path d="M100 84l34-22 34 22z" fill="#2e7f9a" />
        <rect x={16} y={70} width={92} height={70} fill="#ffd463" />
        <path d="M10 72l52-34 52 34z" fill="#c4553b" />
        <g fill="#5b8fd1" stroke="#fff" strokeWidth={2}>
          <rect x={26} y={80} width={16} height={14} />
          <rect x={52} y={80} width={16} height={14} />
          <rect x={80} y={80} width={16} height={14} />
          <rect x={26} y={106} width={16} height={14} />
        </g>
        <rect x={54} y={110} width={14} height={30} fill="#8a4b2a" />
        <rect x={74} y={110} width={28} height={30} fill="#e9eef5" />
        <rect x={0} y={140} width={166} height={12} fill="#5cc96b" />
        <rect x={0} y={152} width={166} height={100} fill="#3b3f55" />
        <path d="M8 196h22M48 196h22M88 196h22M128 196h22" stroke="#f3f3f3" strokeWidth={3} />
        <path d="M40 182v-12q4-10 18-12l12-12h34l14 12q14 2 16 12v12z" fill="#ff4d5e" />
        <path d="M74 158l6-9h20l8 9z" fill="#bfe6ff" />
        <circle cx={60} cy={183} r={8} fill="#1d1b2e" />
        <circle cx={114} cy={183} r={8} fill="#1d1b2e" />
        <circle cx={60} cy={183} r={3} fill="#c9ccd2" />
        <circle cx={114} cy={183} r={3} fill="#c9ccd2" />
      </g>
    </>
  ),
  showdown: () => (
    <>
      <Bg id="showdown" stops={['#4a1ad0', '#1d0b66', '#0b0530']} />
      {[
        [0, 70, 26],
        [24, 46, 24],
        [46, 84, 22],
        [66, 36, 30],
        [94, 64, 22],
        [114, 30, 26],
        [138, 76, 28],
      ].map(([x, y, w], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={150 - y} fill="#170a4a" />
          <rect x={x} y={y} width={w} height={2} fill={i % 2 ? '#3ff0ff' : '#ff4fd8'} />
          {Array.from({ length: Math.floor((140 - y) / 10) }, (_, r) =>
            [0, 1].map((c) => <rect key={`${r}-${c}`} x={x + 5 + c * (w / 2)} y={y + 8 + r * 10} width={4} height={4} fill={(r + c + i) % 3 ? '#2a1a70' : i % 2 ? '#3ff0ff' : '#ff4fd8'} />),
          )}
        </g>
      ))}
      <rect x={0} y={150} width={166} height={72} fill="#0d0533" />
      <g strokeWidth={2}>
        <line x1={70} y1={150} x2={10} y2={222} stroke="#ff4fd8" />
        <line x1={96} y1={150} x2={156} y2={222} stroke="#ff4fd8" />
        <line x1={83} y1={150} x2={83} y2={222} stroke="#3ff0ff" strokeDasharray="8 7" />
      </g>
      <Crosshair x={83} y={106} r={17} color="#ff6be0" />
      <Bean x={83} y={176} h={26} arms="out" />
    </>
  ),
  valley: () => (
    <>
      <Bg id="valley" stops={['#ffbf73', '#ee7a3e', '#9a3423']} />
      <defs>
        <linearGradient id="valley-storm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a1fb8" stopOpacity={0.95} />
          <stop offset="1" stopColor="#a35cff" stopOpacity={0.55} />
        </linearGradient>
      </defs>
      <circle cx={116} cy={54} r={20} fill="#fff0c2" />
      <path d="M0 112l18-16h30l12 16zM110 114l14-12h24l18 12z" fill="#c45b33" opacity={0.7} />
      <path d="M38 124l12-46h64l12 46z" fill="#b5532c" />
      <path d="M50 78h64l2 8H48z" fill="#e0844a" />
      <rect x={0} y={122} width={166} height={100} fill="#d98a4f" />
      <path d="M0 150q40-10 80 0t86-4V222H0z" fill="#e69b5c" />
      <path d="M0 0h34q-14 60 4 120t-6 102H0z" fill="url(#valley-storm)" />
      <path d="M8 30q16 12 6 30M14 90q14 14 2 34M6 150q16 10 6 32" stroke="#e2c6ff" strokeWidth={1.6} fill="none" opacity={0.7} />
      <g fill="#2f8a4f">
        <rect x={128} y={136} width={9} height={44} rx={4.5} />
        <path d="M128 160h-8v-14a4 4 0 0 1 8 0zM137 152h8v-12a4 4 0 0 0-8 0z" />
      </g>
      <Bean x={78} y={184} h={30} arms="wave" />
    </>
  ),
  playground: () => (
    <>
      <Bg id="playground" stops={['#a77bff', '#7044e8', '#3e1f9e']} />
      <path d="M8 182l70-58v58z" fill="#ffd25c" />
      <path d="M78 124v58h10v-50z" fill="#e09a22" />
      <circle cx={124} cy={86} r={24} fill="#ff6b6b" />
      <path d="M102 80q22 14 44 0M106 100q18 8 36-2" stroke="#fff" strokeWidth={4} fill="none" opacity={0.85} />
      <Box x={128} y={186} s={26} top="#7ff0e0" left="#2fb6a6" right="#239485" />
      <Box x={22} y={110} s={18} top="#ff9ad5" left="#e5559f" right="#c43f84" />
      <Bean x={58} y={190} h={32} arms="wave" />
    </>
  ),
  island: () => (
    <>
      <Bg id="island" stops={['#5ff0ff', '#1fb2d4', '#0b6f96']} />
      <circle cx={34} cy={40} r={16} fill="#fff6c9" />
      <Cloud x={104} y={40} s={0.7} o={0.85} />
      <rect x={0} y={132} width={166} height={90} fill="#0f8fbf" />
      <path d="M0 150q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0M0 176q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0" stroke="#d9f6ff" strokeWidth={2} fill="none" opacity={0.6} />
      <ellipse cx={83} cy={150} rx={62} ry={20} fill="#ffdc8f" />
      <ellipse cx={83} cy={145} rx={56} ry={15} fill="#ffe7ae" />
      <path d="M100 146q4-40 14-74" stroke="#8a5a2b" strokeWidth={6} fill="none" strokeLinecap="round" />
      <g fill="#2fbf6a">
        <path d="M114 72q-26-8-38 8 18-6 38-4z" />
        <path d="M114 72q24-12 38 4-18-4-38 0z" />
        <path d="M114 72q-10-22-30-22 18 8 28 24z" />
        <path d="M114 72q14-22 34-18-20 4-32 20z" />
      </g>
      <circle cx={111} cy={76} r={3.5} fill="#6b3f1a" />
      <circle cx={117} cy={77} r={3.5} fill="#6b3f1a" />
      <Bean x={66} y={150} h={28} arms="wave" />
    </>
  ),
}

// The home page's two modes, wide: 400 x 240
export function ModeArt({ id }: { id: 'party-games' | 'shoot-out' }) {
  if (id === 'shoot-out') {
    return (
      <svg className="mode-art" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="shoot-bg" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#ff5c7c" />
            <stop offset="0.55" stopColor="#b31f63" />
            <stop offset="1" stopColor="#3b0f4f" />
          </linearGradient>
        </defs>
        <rect width={400} height={240} fill="url(#shoot-bg)" />
        <path d="M0 196 L400 170 L400 240 L0 240Z" fill="#2a0b3d" opacity={0.55} />
        <Box x={110} y={206} s={44} top="#7ff0e0" left="#2fb6a6" right="#239485" />
        <Box x={150} y={186} s={34} top="#ffe27a" left="#e5b52a" right="#c99a15" />
        <Box x={286} y={204} s={46} top="#c7a2ff" left="#8b5cf6" right="#6d3fe0" />
        <Bean x={62} y={214} h={52} color="#4f8bff" arms="out" />
        <Bean x={196} y={196} h={40} color="#4f8bff" arms="out" />
        <Bean x={338} y={214} h={52} color="#ff5c8a" flip arms="out" />
        <Bean x={246} y={190} h={36} color="#ff5c8a" flip arms="out" />
        <Crosshair x={300} y={118} r={24} w={3} />
        <g fill="#fff" opacity={0.85}>
          <rect x={40} y={46} width={10} height={4} transform="rotate(30 45 48)" />
          <rect x={348} y={60} width={10} height={4} transform="rotate(-20 353 62)" />
          <rect x={196} y={36} width={8} height={4} transform="rotate(60 200 38)" />
        </g>
      </svg>
    )
  }
  return (
    <svg className="mode-art" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="party-bg" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#5ab8ff" />
          <stop offset="0.55" stopColor="#8a84ff" />
          <stop offset="1" stopColor="#4b2fb8" />
        </linearGradient>
      </defs>
      <rect width={400} height={240} fill="url(#party-bg)" />
      <circle cx={334} cy={52} r={40} fill="#fff6c9" opacity={0.22} />
      <circle cx={334} cy={52} r={24} fill="#fff6c9" opacity={0.9} />
      <Cloud x={40} y={50} />
      <Cloud x={190} y={34} s={0.7} o={0.7} />
      <HexFloor x={196} y={196} r={14} rows={3} cols={6} top="#ff5c8a" side="#c23461" missing={[[0, 2], [1, 4], [2, 1]]} />
      <Platform x={20} y={176} w={110} top="#ffd23f" side="#c99a15" />
      <Platform x={92} y={126} w={70} top="#7ff0e0" side="#2fb6a6" />
      <rect x={130} y={58} width={6} height={70} fill="#fff" />
      <path d="M136 60h34l-8 10 8 10h-34z" fill="#ff4d6d" />
      <Bean x={56} y={174} h={40} arms="up" />
      <Bean x={114} y={124} h={34} color="#4f8bff" arms="out" />
      <Bean x={252} y={190} h={36} color="#36c2a0" arms="wave" />
      <Bean x={316} y={204} h={40} color="#ffd23f" flip arms="up" />
    </svg>
  )
}

export function CardArt({ id }: { id: string }) {
  return (
    <svg className="card-art" viewBox="0 0 166 222" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {SCENES[id]?.()}
    </svg>
  )
}
