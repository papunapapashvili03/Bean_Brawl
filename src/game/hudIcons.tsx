// Icons for the in-game menu and cards, drawn in the current text colour (the crown in gold)

type IconProps = { size?: number; className?: string }

// A cog: eight square-ish teeth round a ring, with a hole through the middle
const COG = (() => {
  const teeth = 8
  const step = (Math.PI * 2) / teeth
  const at = (a: number, r: number) => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`
  const points: string[] = []
  for (let k = 0; k < teeth; k++) {
    const a = k * step
    points.push(at(a - step * 0.3, 7.6), at(a - step * 0.16, 10.4), at(a + step * 0.16, 10.4), at(a + step * 0.3, 7.6))
  }
  return `M${points.join(' L')} Z M15.2 12 A3.2 3.2 0 1 0 8.8 12 A3.2 3.2 0 1 0 15.2 12 Z`
})()

export function GearIcon({ size = 22, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={COG} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

// A door swung open out of its frame
export function DoorOpenIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M10 3h9v18h-9" />
      <path d="M10 3 4 5v16l6 1z" fill="currentColor" fillOpacity={0.25} />
      <path d="M2 21.5h20" />
      <circle cx={7.6} cy={13} r={0.9} fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CrownIcon({ size = 22, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-label="Crown" role="img">
      <path d="M3 17.5 4.6 7l4.7 4.6L12 4.5l2.7 7.1L19.4 7 21 17.5z" fill="#ffd23f" stroke="#b8860b" strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={3} y={18.5} width={18} height={2.6} rx={1} fill="#ffd23f" stroke="#b8860b" strokeWidth={1.2} />
      <circle cx={12} cy={13.2} r={1.3} fill="#ff5c8a" />
    </svg>
  )
}

// A speaker, with sound coming out of it (or crossed out, at no volume)
export function SpeakerIcon({ size = 20, muted = false, className }: IconProps & { muted?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" />
      ) : (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18.2 6.4a7.6 7.6 0 0 1 0 11.2" />
        </>
      )}
    </svg>
  )
}
