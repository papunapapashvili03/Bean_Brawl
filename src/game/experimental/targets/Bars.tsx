import { useEffect, useRef, type CSSProperties } from 'react'
import { Html } from '@react-three/drei'
import { BAR_HEIGHT, MAX_HEALTH, MAX_SHIELD, POPUP_TIME, type Popup } from './popup'

// EXPERIMENTAL: what hangs over a character that can be shot (training dummies, bots): shield and health bars,
// and damage numbers popping up

// ---------------------------------------------------------------------------------------------------------
// Shield (blue) over health (green), each a slanted bar with its value, game style

const shadow = '0 1px 0 rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.45)'

function Bar({ value, max, colors, height }: { value: number; max: number; colors: [string, string]; height: number }) {
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5 }
  const number: CSSProperties = {
    width: 30,
    textAlign: 'right',
    font: "900 italic 13px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif",
    color: '#fff',
    textShadow: shadow,
  }
  const track: CSSProperties = {
    flex: 1,
    height,
    background: 'rgba(0, 0, 0, 0.55)',
    border: '1.5px solid rgba(0, 0, 0, 0.75)',
    borderRadius: 2,
    transform: 'skewX(-14deg)',
    overflow: 'hidden',
  }
  const fill: CSSProperties = {
    width: `${(100 * Math.max(0, Math.min(value, max))) / max}%`,
    height: '100%',
    background: `linear-gradient(180deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.45)',
  }
  return (
    <div style={row}>
      <span style={number}>{Math.round(value)}</span>
      <div style={track}>
        <div style={fill} />
      </div>
    </div>
  )
}

export function HealthBars({ health, shield, width = 130 }: { health: number; shield: number; width?: number }) {
  return (
    <div style={{ display: 'grid', gap: 3, width, pointerEvents: 'none', userSelect: 'none' }}>
      <Bar value={shield} max={MAX_SHIELD} colors={['#6cc0ff', '#1f73e0']} height={8} />
      <Bar value={health} max={MAX_HEALTH} colors={['#8ef070', '#34b53a']} height={11} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------
// Damage numbers: pop up over the head and drift away. Yellow for a headshot, blue when the shield took
// the hit, white for health.

const POPUP_COLORS: Record<Popup['kind'], string> = { head: '#ffd23f', shield: '#6cc8ff', health: '#ffffff' }

export function DamagePopup({ value, kind, x, height = BAR_HEIGHT + 0.5 }: Omit<Popup, 'id'> & { height?: number }) {
  const text = useRef<HTMLDivElement>(null)
  useEffect(() => {
    text.current?.animate(
      [
        { transform: 'translateY(6px) scale(0.5)', opacity: 0 },
        { transform: 'translateY(-8px) scale(1.2)', opacity: 1, offset: 0.14 },
        { transform: 'translateY(-14px) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translateY(-34px) scale(0.95)', opacity: 0 },
      ],
      { duration: POPUP_TIME, easing: 'ease-out', fill: 'forwards' },
    )
  }, [])
  return (
    <Html center position={[x, height, 0]} distanceFactor={8} zIndexRange={[3, 0]}>
      <div
        ref={text}
        style={{
          font: "900 italic 24px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif",
          color: POPUP_COLORS[kind],
          WebkitTextStroke: '1.5px #111',
          textShadow: '0 2px 0 rgba(0,0,0,0.55)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </Html>
  )
}
