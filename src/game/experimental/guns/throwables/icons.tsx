import type { JSX } from 'react'
import type { ThrowKind } from './catalog'

// Hotbar icons for the throwables: flat drawings in a 24 x 24 box, outlined in ink like the gun icons

const INK = '#1b1b1f'
const STEEL = '#c3c7cf'

function GrenadeIcon() {
  return (
    <g stroke={INK} strokeWidth={0.8} strokeLinejoin="round">
      <rect x={10.2} y={3.2} width={3.6} height={4} rx={0.6} fill="#8d939c" />
      <path d="M11 4 L17.5 4.6 L18.6 13.5 L17.4 13.6 L16.6 5.8 L11 5.4 Z" fill={STEEL} />
      <circle cx={7.4} cy={5.6} r={2.2} fill="none" stroke={STEEL} strokeWidth={1.1} />
      <ellipse cx={12} cy={14.6} rx={6.6} ry={7.4} fill="#56652f" />
      <g stroke="#3b4620" strokeWidth={0.9} fill="none">
        <path d="M5.6 12 Q12 13.2 18.4 12" />
        <path d="M5.6 17 Q12 18.2 18.4 17" />
        <path d="M9.4 7.8 Q8.4 14.6 9.4 21.6" />
        <path d="M14.6 7.8 Q15.6 14.6 14.6 21.6" />
      </g>
    </g>
  )
}

function DynamiteIcon() {
  return (
    <g stroke={INK} strokeWidth={0.8} strokeLinejoin="round">
      <path d="M12 6 Q12.5 3 15.6 2.6 Q17.6 2.4 18.4 1.4" fill="none" stroke="#4a3b2c" strokeWidth={1.2} />
      {[5.4, 9.6, 13.8].map((x) => (
        <rect key={x} x={x} y={x === 9.6 ? 5.4 : 6.6} width={4.6} height={16} rx={1.2} fill="#c9362f" />
      ))}
      <rect x={4.6} y={9.2} width={14.8} height={2.4} fill="#26272b" />
      <rect x={4.6} y={16.4} width={14.8} height={2.4} fill="#26272b" />
      <circle cx={18.6} cy={1.6} r={1.2} fill="#ffe066" stroke="#ff8a2a" strokeWidth={0.6} />
    </g>
  )
}

function MolotovIcon() {
  return (
    <g stroke={INK} strokeWidth={0.8} strokeLinejoin="round">
      <path d="M12 0.6 Q14.4 3 12.6 5.4 Q11 4.6 11.4 3 Q10.2 4 10.6 5.4 Q9.2 3.6 12 0.6 Z" fill="#ff8a2a" />
      <path d="M10.6 5.2 L13.4 5.2 L13.2 7.8 L10.8 7.8 Z" fill="#e6dcc3" />
      <path d="M10.6 7.8 L13.4 7.8 L13.4 10.4 Q17.2 11.6 17.2 14.8 L17.2 21.4 Q17.2 22.8 15.8 22.8 L8.2 22.8 Q6.8 22.8 6.8 21.4 L6.8 14.8 Q6.8 11.6 10.6 10.4 Z" fill="rgba(90,143,78,0.75)" />
      <path d="M7.4 15.8 L16.6 15.8 L16.6 21.4 Q16.6 22.2 15.8 22.2 L8.2 22.2 Q7.4 22.2 7.4 21.4 Z" fill="#d98a2b" stroke="none" />
    </g>
  )
}

function SmokeIcon() {
  return (
    <g stroke={INK} strokeWidth={0.8} strokeLinejoin="round">
      <rect x={10} y={2.6} width={4} height={4} fill="#4b5b2e" />
      <path d="M11 3 L17 3.6 L17.8 16 L16.6 16 L15.9 4.8 L11 4.6 Z" fill={STEEL} />
      <circle cx={9} cy={8} r={1.8} fill="none" stroke={STEEL} strokeWidth={1} />
      <rect x={6.4} y={6.4} width={11.2} height={16.2} rx={1.4} fill="#4b5b2e" />
      <rect x={6.4} y={17.2} width={11.2} height={2} fill="#e9ebe4" />
    </g>
  )
}

const ICONS: Record<ThrowKind, () => JSX.Element> = {
  grenade: GrenadeIcon,
  dynamite: DynamiteIcon,
  molotov: MolotovIcon,
  smoke: SmokeIcon,
}

export function ThrowIcon({ kind, size }: { kind: ThrowKind; size?: number }) {
  const Icon = ICONS[kind]
  return (
    <svg width={size ?? '100%'} height={size ?? '100%'} viewBox="0 0 24 24" aria-hidden="true">
      <Icon />
    </svg>
  )
}
