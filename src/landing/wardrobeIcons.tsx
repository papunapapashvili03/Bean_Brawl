import type { ReactNode } from 'react'
import { SHADE_COLORS, type Outfit } from '../game/outfit'

// Pictures of what's in the wardrobe, for its buttons: each thing worn on the head shown on the top of a
// bean (in the player's orange), each thing worn on the back on its own. 64 x 64, in the same colours as the
// 3D models (../game/Accessories).

const BEAN = '#ff6b35'
const INK = '#1d1b2e'

// The top of a bean, looking out
function Head({ children, eyes = true, under }: { children?: ReactNode; eyes?: boolean; under?: ReactNode }) {
  return (
    <>
      {under}
      <path d="M15 64V36a17 17 0 0 1 34 0v28z" fill={BEAN} />
      <path d="M38 22a17 17 0 0 1 11 14v28h-8V38a17 17 0 0 0-3-16z" fill="#000" opacity={0.1} />
      {eyes && (
        <g fill={INK}>
          <ellipse cx={28} cy={40} rx={2.2} ry={3.4} />
          <ellipse cx={37} cy={40} rx={2.2} ry={3.4} />
        </g>
      )}
      {eyes && <path d="M28 48q4.5 3 9 0" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />}
      {children}
    </>
  )
}

function None() {
  return (
    <g stroke="#7d84b8" strokeWidth={3.5} fill="none" strokeLinecap="round">
      <circle cx={32} cy={32} r={15} />
      <path d="M21.5 42.5l21-21" />
    </g>
  )
}

function SquareShades({ color }: { color: string }) {
  return (
    <g>
      <rect x={19} y={34} width={12} height={9} rx={2.5} fill="#16141f" stroke={color} strokeWidth={2.2} />
      <rect x={34} y={34} width={12} height={9} rx={2.5} fill="#16141f" stroke={color} strokeWidth={2.2} />
      <path d="M31 36h3" stroke={color} strokeWidth={2.2} />
      <path d="M21.5 36.5l3-1.6" stroke="#fff" strokeWidth={1.2} opacity={0.5} strokeLinecap="round" />
      <path d="M36.5 36.5l3-1.6" stroke="#fff" strokeWidth={1.2} opacity={0.5} strokeLinecap="round" />
    </g>
  )
}

function RoundShades({ color }: { color: string }) {
  return (
    <g>
      <circle cx={25.5} cy={38.5} r={6} fill="#1a2a44" stroke={color} strokeWidth={2.2} />
      <circle cx={39.5} cy={38.5} r={6} fill="#1a2a44" stroke={color} strokeWidth={2.2} />
      <path d="M31.5 37q1.5-1.4 2 0" stroke={color} strokeWidth={2} fill="none" />
      <path d="M22.5 36.5l2.5-2" stroke="#fff" strokeWidth={1.2} opacity={0.5} strokeLinecap="round" />
    </g>
  )
}

const HATS: Record<Outfit['hat'], () => ReactNode> = {
  none: None,
  cap: () => (
    <Head>
      <path d="M14 30a18 15 0 0 1 36 0z" fill="#1e2c55" />
      <path d="M14 30h36v3.5H14z" fill="#2d4178" />
      <path d="M24 32q8 5 26 1l-1 4q-15 3-25-1z" fill="#1e2c55" />
      <circle cx={32} cy={16} r={1.8} fill="#2d4178" />
    </Head>
  ),
  topHat: () => (
    <Head>
      <ellipse cx={32} cy={28} rx={20} ry={4.5} fill="#232328" />
      <path d="M21 28V7h22v21z" fill="#232328" />
      <path d="M21 22h22v4H21z" fill="#0b0b0e" />
      <path d="M24 9h4v12h-4z" fill="#fff" opacity={0.08} />
    </Head>
  ),
  hardHat: () => (
    <Head>
      <path d="M14 30a18 17 0 0 1 36 0z" fill="#ffc61a" />
      <path d="M30 13h4v17h-4z" fill="#e5ad0a" />
      <ellipse cx={32} cy={30.5} rx={21} ry={3.6} fill="#f2b70f" />
      <path d="M17 32q15 4 30 0" stroke="#8a8d93" strokeWidth={1.6} fill="none" />
    </Head>
  ),
  combatHelmet: () => (
    <Head>
      <path d="M12 36a20 22 0 0 1 40 0v2H12z" fill="#5b6b3a" />
      <path d="M12 36h40v3H12z" fill="#3b4527" />
      <path d="M14 39q2 10 6 14M50 39q-2 10-6 14" stroke="#3b4527" strokeWidth={2} fill="none" />
      <circle cx={24} cy={24} r={1.4} fill="#3b4527" />
      <circle cx={36} cy={20} r={1.4} fill="#3b4527" />
      <circle cx={44} cy={28} r={1.4} fill="#3b4527" />
    </Head>
  ),
}

const FACES: Record<Outfit['face'], () => ReactNode> = {
  none: None,
  medical: () => (
    <Head>
      <path d="M15 44q-3-2-1 6M49 44q3-2 1 6" stroke="#ffffff" strokeWidth={1.6} fill="none" />
      <rect x={18} y={43} width={28} height={14} rx={6} fill="#bfe2f0" />
      <path d="M21 47.5h22M21 51h22M22 54.5h20" stroke="#8fbdd2" strokeWidth={1.1} />
    </Head>
  ),
  fullMask: () => (
    <Head eyes={false}>
      <path d="M15 64V36a17 17 0 0 1 34 0v28z" fill="#18181c" />
      <path d="M19 34q13-4 26 0v9q-13 4-26 0z" fill={BEAN} />
      <g fill={INK}>
        <ellipse cx={28} cy={38.5} rx={2.2} ry={3.2} />
        <ellipse cx={37} cy={38.5} rx={2.2} ry={3.2} />
      </g>
      <path d="M17 50q15 4 30 0M17 56q15 4 30 0" stroke="#2a2a30" strokeWidth={1.2} fill="none" />
    </Head>
  ),
}

const BACKS: Record<Outfit['back'], () => ReactNode> = {
  none: None,
  backpack: () => (
    <g>
      <path d="M22 14q0-6 10-6t10 6" stroke="#24508f" strokeWidth={3} fill="none" />
      <rect x={14} y={14} width={36} height={42} rx={10} fill="#2f63ad" />
      <rect x={19} y={34} width={26} height={17} rx={5} fill="#1d4585" />
      <path d="M19 38h26" stroke="#8fc6e8" strokeWidth={2} />
      <rect x={26} y={19} width={12} height={4} rx={2} fill="#8fc6e8" />
    </g>
  ),
  military: () => (
    <g>
      <path d="M22 13q0-5 10-5t10 5" stroke="#5f5c34" strokeWidth={3} fill="none" />
      <rect x={12} y={13} width={40} height={44} rx={6} fill="#6e6a3c" />
      <path d="M12 26h40M12 46h40" stroke="#5b5831" strokeWidth={3} />
      <path d="M22 13v44M42 13v44" stroke="#5b5831" strokeWidth={2.4} />
      <rect x={25} y={30} width={14} height={10} rx={1.5} fill="#3a3a35" />
    </g>
  ),
}

// What a slot is, as a line drawing (24 x 24), for a slot with nothing in it
const GLYPHS: Record<'hat' | 'face' | 'shades' | 'back' | 'flag', ReactNode> = {
  hat: <path d="M5 15a7 6 0 0 1 14 0M3 15h18v2.5H3z" />,
  face: <path d="M5 9q7-4 14 0v4.5q0 5.5-7 6.5-7-1-7-6.5zM9 13h6" />,
  shades: <path d="M3 10h18M4 10l1 4a3 3 0 0 0 5 0l1-3h2l1 3a3 3 0 0 0 5 0l1-4" />,
  back: <path d="M8 6a4 3 0 0 1 8 0M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM9 13h6v4H9z" />,
  flag: <path d="M6 21V4M6 5h11l-2.5 4L17 13H6" />,
}
export function SlotGlyph({ slot }: { slot: keyof typeof GLYPHS }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {GLYPHS[slot]}
    </svg>
  )
}

// The picture for one option of a slot (a flag's is its own image, see ./ModePage)
export function OptionIcon({ slot, value }: { slot: 'hat' | 'face' | 'shades' | 'back'; value: string }) {
  let art: ReactNode
  if (slot === 'hat') art = HATS[value as Outfit['hat']]()
  else if (slot === 'face') art = FACES[value as Outfit['face']]()
  else if (slot === 'back') art = BACKS[value as Outfit['back']]()
  else if (value === 'none') art = <None />
  else {
    const color = SHADE_COLORS[value as keyof typeof SHADE_COLORS]
    art = <Head>{value === 'blue' ? <RoundShades color={color} /> : <SquareShades color={color} />}</Head>
  }
  // (Something worn on the head: framed on the head, cut off at the shoulders)
  const onHead = slot !== 'back' && value !== 'none'
  return (
    <svg className="item-art" viewBox={onHead ? '4 4 56 56' : '0 0 64 64'} aria-hidden>
      {art}
    </svg>
  )
}
