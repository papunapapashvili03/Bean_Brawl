import type { SVGProps } from 'react'

// The landing page's icons: 24-unit squares drawn in the current text colour

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Stroke({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

function Solid({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

// A cog: eight teeth round a ring
const COG = (() => {
  const pts: string[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    for (const [da, r] of [
      [-0.2, 8.2],
      [-0.13, 10.6],
      [0.13, 10.6],
      [0.2, 8.2],
    ]) {
      pts.push(`${(12 + Math.cos(a + da) * r).toFixed(2)},${(12 + Math.sin(a + da) * r).toFixed(2)}`)
    }
  }
  return `M${pts.join('L')}ZM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z`
})()

export const SparkIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="m5 19 9.5-9.5" />
    <path d="m13 6 1.4-3 1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4z" />
    <path d="M5 5.5h3M6.5 4v3" />
  </Stroke>
)

export const FlagIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h13l-2.5 4.5L18 13H5" />
  </Stroke>
)

export const CrosshairIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
  </Stroke>
)

export const CubeIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="m12 2.8 8 4.4v9.6l-8 4.4-8-4.4V7.2z" />
    <path d="m4.3 7.4 7.7 4.4 7.7-4.4M12 11.8v9.2" />
  </Stroke>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="m6 9 6 6 6-6" />
  </Stroke>
)

export const LogoutIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="m15 8 4 4-4 4M19 12H9" />
  </Stroke>
)

export const WalletIcon = (p: IconProps) => (
  <Solid {...p}>
    <path
      fillRule="evenodd"
      d="M4 6.5A2.5 2.5 0 0 1 6.5 4H17v3H6.6a.9.9 0 0 0 0 1.8H20a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5zm12.5 6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"
    />
  </Solid>
)

export const CogIcon = (p: IconProps) => (
  <Solid {...p}>
    <path fillRule="evenodd" d={COG} />
  </Solid>
)

export const ShieldIcon = (p: IconProps) => (
  <Solid {...p}>
    <path fillRule="evenodd" d="M12 2 4 5v6c0 5.1 3.4 9.5 8 11 4.6-1.5 8-5.9 8-11V5zm0 6.2a2 2 0 0 0-1 3.73V15h2v-3.07a2 2 0 0 0-1-3.73z" />
  </Solid>
)

export const MailIcon = (p: IconProps) => (
  <Solid {...p}>
    <path d="M2 7.2 12 13.6l10-6.4V18a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18z" />
    <path d="M3.3 4.5h17.4L12 10.1z" />
  </Solid>
)

export const InfoIcon = (p: IconProps) => (
  <Solid {...p}>
    <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 8h2.4v7h-2.4zm1.2-4.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
  </Solid>
)

export const HeadsetIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <path d="M4 14h3v6H5.5A1.5 1.5 0 0 1 4 18.5zM20 14h-3v6h1.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </Stroke>
)

// Solana's mark (three slanted bars, green to purple) on a dark disc, for the balance in SOL
export const SolanaIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <defs>
      <linearGradient id="sol-bars" x1="0.1" y1="0.9" x2="0.9" y2="0.1">
        <stop offset="0" stopColor="#00ffa3" />
        <stop offset="1" stopColor="#dc1fff" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="11" fill="#10121f" />
    <g fill="url(#sol-bars)">
      <path d="M8.1 7.2h10.3l-2 2H6.1z" />
      <path d="M6.1 11h10.3l2 2H8.1z" />
      <path d="M8.1 14.8h10.3l-2 2H6.1z" />
    </g>
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
)
