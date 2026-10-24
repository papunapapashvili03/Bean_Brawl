import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { getRaceView, raceCourse, subscribeRace, type RaceView } from './race'
import { sfx } from './sound'
import { CrownIcon } from '../hudIcons'
import { useTouchMode } from '../touch/touch'

const formatTime = (s: number) => {
  const m = Math.floor(s / 60)
  const rest = (s - m * 60).toFixed(1).padStart(4, '0')
  return `${m}:${rest}`
}
function ordinal(n: number) {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}

// The start's hint, for a touch screen: its keys swapped for the on-screen controls (../touch)
const forTouch = (hint: string) =>
  hint
    .replace('WASD to run', 'Stick to run')
    .replace('Drag or Q/E to turn the camera', 'Drag to turn the camera')
    .replace('C to crouch', 'Roll, standing still, to crouch')
    .replace('(C, standing still)', '(Roll, standing still)')
    .split(' · ')
    .filter((part) => part !== 'Space to jump')
    .join(' · ')

// Sound cues for countdown ticks, RUN and checkpoints (the finish fanfare plays with the confetti)
function useRaceSounds(view: RaceView) {
  const prev = useRef(view)
  useEffect(() => {
    const before = prev.current
    if (view.count !== null && view.count !== before.count) sfx.count()
    if (view.showRun && !before.showRun) sfx.run()
    if (view.checkpoint > before.checkpoint) sfx.checkpoint()
    if (view.phase === 'eliminated' && before.phase !== 'eliminated') sfx.eliminated()
    prev.current = view
  }, [view])
}

// In a party show (../ShowDirector): which round this is, and what the cards say and offer instead
export type ShowHud = {
  label: string // e.g. "Round 1 of 3 · 7/16 through"
  finishTitle?: string // in place of the course's own
  finishNote?: string
  outNote?: string
  actions?: { label: string; onClick: () => void; primary?: boolean }[] // in place of Race again / Try again
  crown?: boolean // the show won: the winner's crown on the finish card
}

function Actions({ show, onRestart, again }: { show?: ShowHud; onRestart: () => void; again: string }) {
  const buttons = show ? (show.actions ?? []) : [{ label: again, onClick: onRestart, primary: true }]
  if (!buttons.length) return null
  return (
    <div className="hud-actions">
      {buttons.map((b) => (
        <button
          key={b.label}
          className={b.primary ? '' : 'hud-secondary'}
          onClick={(e) => {
            e.currentTarget.blur()
            b.onClick()
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

// Race HUD for any race level: countdown, section, timer, where you are in the field (or, in a level you
// last out rather than race through, how many are still in), checkpoint toasts and the finish card
export function RaceHud({ onRestart, show }: { onRestart: () => void; show?: ShowHud }) {
  const view = useSyncExternalStore(subscribeRace, getRaceView)
  useRaceSounds(view)
  const { sections, checkpoints, finishTitle, hint, survival } = raceCourse()
  const touch = useTouchMode()
  const startHint = hint ?? `WASD to run · Space to jump · Drag or Q/E to turn the camera · ${checkpoints.length} checkpoints`
  const racing = view.phase === 'running' || view.phase === 'countdown'
  return (
    <div className="sky-hud">
      <div className="hud-bar">
        <div className="hud-chip">
          <span className="hud-label">
            Section {Math.min(view.checkpoint + 1, sections.length)}/{sections.length}
          </span>
          {sections[view.checkpoint]}
        </div>
        <div className="hud-right">
          <div className="hud-chip hud-time">{formatTime(view.elapsed)}</div>
          {view.field > 1 && racing && (
            <div className="hud-chip hud-position">
              <span className="hud-label">{survival ? 'Still in' : 'Position'}</span>
              <span>
                {survival ? view.left : ordinal(view.position)}
                <small> / {view.field}</small>
              </span>
            </div>
          )}
        </div>
      </div>

      {show && <div className="hud-show">{show.label}</div>}

      {view.count !== null && (
        <div key={view.count} className="hud-countdown">
          {view.count}
        </div>
      )}
      {view.showRun && <div className="hud-countdown hud-run">RUN!</div>}
      {view.status && view.phase !== 'finished' && <div className="hud-status">{view.status}</div>}
      {view.callout && view.phase !== 'finished' && (
        <div key={view.callout.id} className="hud-callout" style={{ '--call': view.callout.colour, '--ink': view.callout.ink } as CSSProperties}>
          {view.callout.label}
          <span className="hud-callout-bar">
            <i style={{ animationDuration: `${view.callout.seconds}s` }} />
          </span>
        </div>
      )}
      {view.toast && (
        <div key={view.toast} className="hud-toast">
          {view.toast}
        </div>
      )}

      {view.phase === 'finished' && view.place !== null && (
        <div className="hud-finish">
          {/* 1st place (in a show, only for winning it) wears the crown */}
          {(show ? show.crown : view.place === 1) && <CrownIcon size={54} className="hud-crown" />}
          <div className="hud-finish-title">{show?.finishTitle ?? (typeof finishTitle === 'function' ? finishTitle() : finishTitle) ?? 'Finished'}</div>
          <div className="hud-finish-place">{ordinal(view.place)}</div>
          {view.field > 1 && !survival && <div className="hud-finish-of">of {view.field}</div>}
          <div className="hud-finish-time">{formatTime(view.elapsed)}</div>
          {show?.finishNote && <div className="hud-finish-note">{show.finishNote}</div>}
          <Actions show={show} onRestart={onRestart} again="Race again" />
        </div>
      )}

      {/* Out of the race: at the bottom, so you can still watch */}
      {view.phase === 'eliminated' && (
        <div className="hud-finish hud-eliminated">
          <div className="hud-finish-title">Eliminated</div>
          <div className="hud-finish-time">{formatTime(view.elapsed)}</div>
          {!show && view.field > 1 && view.place !== null && (
            <div className="hud-finish-time">
              {ordinal(view.place)} of {view.field}
            </div>
          )}
          {show?.outNote && <div className="hud-finish-note">{show.outNote}</div>}
          <Actions show={show} onRestart={onRestart} again="Try again" />
        </div>
      )}

      {view.phase === 'countdown' && (
        <div className="hud-hint">
          {touch ? forTouch(startHint) : startHint}
        </div>
      )}
    </div>
  )
}
