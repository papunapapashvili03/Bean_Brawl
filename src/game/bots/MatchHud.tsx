import { useEffect, useRef, type CSSProperties } from 'react'
import { MAX_HEALTH, MAX_SHIELD, PLAYER_NAME, SCORE_TO_WIN, useMatch, type MatchView } from './match'

// The gunfight's HUD, over the canvas: the score at the top, the kill feed down the right, your shield and
// health at the bottom left, a red flash when you're hit, and a notice while you're out or when a side wins.

const font = "900 italic 15px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif"
const shadow = '0 1px 0 rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.45)'
const panel: CSSProperties = { background: 'rgba(16, 18, 26, 0.72)', borderRadius: 10, color: '#fff', pointerEvents: 'none', userSelect: 'none' }

function Score({ m }: { m: MatchView }) {
  return (
    <div style={{ position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)', display: 'grid', justifyItems: 'center', gap: 4, pointerEvents: 'none' }}>
      <div style={{ ...panel, display: 'flex', alignItems: 'stretch', overflow: 'hidden', font }}>
        {m.teams.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', flexDirection: i ? 'row-reverse' : 'row', background: `linear-gradient(${i ? '270deg' : '90deg'}, ${t.colour}cc, transparent)` }}>
            <span style={{ fontSize: 13, textShadow: shadow }}>
              {t.name}
              {t.id === m.playerTeam ? ' (you)' : ''}
            </span>
            <span style={{ fontSize: 24, textShadow: shadow, minWidth: 30, textAlign: 'center' }}>{m.score[t.id] ?? 0}</span>
          </div>
        ))}
      </div>
      <div style={{ font: '700 11px system-ui, sans-serif', color: '#fff', textShadow: shadow }}>
        {m.ready ? `First to ${SCORE_TO_WIN}` : 'Bots are finding their way round…'}
      </div>
    </div>
  )
}

function Feed({ m }: { m: MatchView }) {
  const colour = (team: string | null) => m.teams.find((t) => t.id === team)?.colour ?? '#ddd'
  return (
    <div style={{ position: 'fixed', top: 62, right: 14, display: 'grid', justifyItems: 'end', gap: 4, pointerEvents: 'none' }}>
      {m.feed.map((f) => (
        <div key={f.id} style={{ ...panel, padding: '4px 10px', font: '800 12px system-ui, sans-serif', display: 'flex', gap: 6, alignItems: 'center' }}>
          {f.killer && <span style={{ color: colour(f.killerTeam), fontWeight: f.killer === PLAYER_NAME ? 900 : 800 }}>{f.killer}</span>}
          <span style={{ opacity: 0.8 }}>{f.killer ? (f.headshot ? '⌖' : '›') : '✕'}</span>
          <span style={{ color: colour(f.victimTeam), fontWeight: f.victim === PLAYER_NAME ? 900 : 800 }}>{f.victim}</span>
        </div>
      ))}
    </div>
  )
}

export function Bar({ value, max, colors }: { value: number; max: number; colors: [string, string] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 34, textAlign: 'right', font, fontSize: 16, color: '#fff', textShadow: shadow }}>{Math.round(value)}</span>
      <div style={{ width: 220, height: 14, background: 'rgba(0,0,0,0.55)', border: '2px solid rgba(0,0,0,0.75)', borderRadius: 3, transform: 'skewX(-14deg)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${(100 * Math.max(0, Math.min(value, max))) / max}%`,
            height: '100%',
            background: `linear-gradient(180deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.45)',
            transition: 'width 0.15s',
          }}
        />
      </div>
    </div>
  )
}

// A red edge round the screen, flashing up each time you're hit
function HitFlash({ hits }: { hits: number }) {
  const el = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    el.current?.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' })
  }, [hits])
  return (
    <div
      ref={el}
      style={{ position: 'fixed', inset: 0, opacity: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 55%, rgba(220, 30, 30, 0.6) 100%)' }}
    />
  )
}

export function MatchHud() {
  const m = useMatch()
  if (!m.teams.length) return null
  const winner = m.teams.find((t) => t.id === m.winner)
  const killerTeam = [...m.feed].reverse().find((f) => f.victim === PLAYER_NAME)?.killerTeam ?? null
  const killerColour = m.teams.find((t) => t.id === killerTeam)?.colour ?? '#fff'
  return (
    <>
      <HitFlash hits={m.hits} />
      <Score m={m} />
      <Feed m={m} />
      <div className="match-bars">
        <Bar value={m.shield} max={MAX_SHIELD} colors={['#6cc0ff', '#1f73e0']} />
        <Bar value={m.health} max={MAX_HEALTH} colors={['#8ef070', '#34b53a']} />
      </div>
      {m.down && (
        <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(10, 10, 20, 0.45)', pointerEvents: 'none' }}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: '#fff', textShadow: shadow }}>
            <div style={{ font, fontSize: 34, letterSpacing: 1 }}>ELIMINATED</div>
            {m.killer && m.killer !== PLAYER_NAME && (
              <div style={{ font: '800 16px system-ui, sans-serif' }}>
                by <span style={{ color: killerColour }}>{m.killer}</span>
              </div>
            )}
            <div style={{ font: '700 14px system-ui, sans-serif', opacity: 0.9 }}>Back in {m.respawnIn}…</div>
          </div>
        </div>
      )}
      {winner && (
        <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', ...panel, padding: '14px 28px', font, fontSize: 30, color: winner.colour, textShadow: shadow }}>
          {winner.name.toUpperCase()} WINS{winner.id === m.playerTeam ? '!' : ''}
        </div>
      )}
    </>
  )
}
