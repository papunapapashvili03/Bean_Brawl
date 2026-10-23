import { useEffect, useRef, type CSSProperties } from 'react'
import { Bar } from '../bots/MatchHud'
import { MAX_HEALTH, PHASES, TOTAL, useStorm, type StormView } from './stormState'

// The storm's HUD (./stormState): at the top, which zone it is and how long until the storm moves (and until
// it has the whole valley), a warning while you're out in it, and a word when a zone is marked or the storm
// starts closing; your health at the bottom left; a purple edge on the screen in the storm, flashing as it
// hurts; and, once it's got you, how long you lasted and a button to go again.

const font = "900 italic 15px 'Arial Black', 'Segoe UI Black', system-ui, sans-serif"
const shadow = '0 1px 0 rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.45)'
const panel: CSSProperties = { background: 'rgba(22, 16, 30, 0.74)', borderRadius: 10, color: '#fff', pointerEvents: 'none', userSelect: 'none' }
const STORM = '#9b5cf0'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// A few seconds' word as each part of a phase begins
function notice(v: StormView): [string, string] | null {
  if (v.phase >= PHASES.length || v.down) return null
  const p = PHASES[v.phase]
  if ((v.closing ? p.shrink : p.wait) - v.left > 4) return null
  if (v.closing) return ['The storm is closing in', `Get inside the white ring within ${clock(p.shrink)}`]
  if (v.phase === 0) return ['The storm is gathering', 'The first safe zone is on your map']
  if (v.phase === PHASES.length - 1) return ['Final zone', 'Nowhere is safe once it closes']
  return ['Next zone marked', `The storm moves in ${clock(p.wait)}`]
}

// The edge of the screen goes purple out in the storm, and flashes each time it hurts
function StormEdge({ inStorm, hits }: { inStorm: boolean; hits: number }) {
  const flash = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    flash.current?.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' })
  }, [hits])
  const edge = 'radial-gradient(ellipse at center, transparent 45%, rgba(120, 40, 200, 0.55) 100%)'
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: edge, opacity: inStorm ? 1 : 0, transition: 'opacity 0.6s' }} />
      <div ref={flash} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0, background: 'radial-gradient(ellipse at center, transparent 50%, rgba(200, 90, 255, 0.6) 100%)' }} />
    </>
  )
}

function Clock({ v }: { v: StormView }) {
  const over = v.phase >= PHASES.length
  const label = over ? 'The storm has the valley' : v.closing ? 'Storm closing' : 'Storm moves in'
  return (
    <div style={{ ...panel, display: 'flex', alignItems: 'stretch', overflow: 'hidden', font }}>
      <div style={{ display: 'grid', justifyItems: 'center', padding: '5px 12px', background: `linear-gradient(90deg, ${STORM}dd, ${STORM}55)` }}>
        <span style={{ fontSize: 10, letterSpacing: 1, textShadow: shadow }}>ZONE</span>
        <span style={{ fontSize: 20, lineHeight: 1, textShadow: shadow }}>
          {Math.min(v.phase + 1, PHASES.length)}/{PHASES.length}
        </span>
      </div>
      <div style={{ display: 'grid', justifyItems: 'start', padding: '5px 14px 5px 12px', minWidth: 120 }}>
        <span style={{ fontSize: 10, letterSpacing: 1, color: v.closing ? '#d9b8ff' : '#fff', textShadow: shadow }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 20, lineHeight: 1, textShadow: shadow }}>{over ? '—' : clock(v.left)}</span>
      </div>
    </div>
  )
}

export function StormHud({ onRestart }: { onRestart: () => void }) {
  const v = useStorm()
  const word = notice(v)
  const dps = PHASES[Math.min(v.phase, PHASES.length - 1)].dps
  return (
    <>
      <StormEdge inStorm={v.inStorm && !v.down} hits={v.hits} />

      <div style={{ position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)', display: 'grid', justifyItems: 'center', gap: 6, pointerEvents: 'none' }}>
        <Clock v={v} />
        <div style={{ font: '700 11px system-ui, sans-serif', color: '#fff', textShadow: shadow }}>
          {v.survived < TOTAL ? `The storm covers the whole valley in ${clock(TOTAL - v.survived)}` : 'The storm covers the whole valley'}
        </div>
        {v.inStorm && !v.down && (
          <div style={{ ...panel, background: 'rgba(110, 40, 190, 0.85)', padding: '5px 14px', font, fontSize: 13, textShadow: shadow }}>
            IN THE STORM · {v.distance} m to safety · −{dps}/s
          </div>
        )}
        {word && (
          <div key={`${v.phase}-${v.closing}`} style={{ display: 'grid', justifyItems: 'center', marginTop: 8, animation: 'storm-word 4.5s ease forwards' }}>
            <style>{'@keyframes storm-word { 0% { opacity: 0; transform: translateY(-6px) } 10% { opacity: 1; transform: none } 80% { opacity: 1 } 100% { opacity: 0 } }'}</style>
            <div style={{ font, fontSize: 24, color: '#e6d2ff', letterSpacing: 1, textShadow: `${shadow}, 0 0 14px ${STORM}` }}>{word[0].toUpperCase()}</div>
            <div style={{ font: '700 13px system-ui, sans-serif', color: '#fff', textShadow: shadow }}>{word[1]}</div>
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', left: 18, bottom: 18, pointerEvents: 'none' }}>
        <Bar value={v.health} max={MAX_HEALTH} colors={['#8ef070', '#34b53a']} />
      </div>

      {v.down && (
        <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(30, 10, 50, 0.5)' }}>
          <div style={{ ...panel, pointerEvents: 'auto', display: 'grid', justifyItems: 'center', gap: 8, padding: '22px 36px', textShadow: shadow }}>
            <div style={{ font, fontSize: 34, letterSpacing: 1 }}>ELIMINATED</div>
            <div style={{ font: '800 15px system-ui, sans-serif', color: '#d9b8ff' }}>The storm got you</div>
            <div style={{ font: '700 14px system-ui, sans-serif', opacity: 0.9 }}>
              You lasted {clock(v.survived)} · zone {Math.min(v.phase + 1, PHASES.length)} of {PHASES.length}
            </div>
            <button
              onClick={(e) => {
                e.currentTarget.blur()
                onRestart()
              }}
              style={{ marginTop: 8, padding: '9px 26px', border: 0, borderRadius: 8, background: STORM, color: '#fff', font, fontSize: 16, cursor: 'pointer', boxShadow: '0 3px 0 #5a2a96' }}
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </>
  )
}
