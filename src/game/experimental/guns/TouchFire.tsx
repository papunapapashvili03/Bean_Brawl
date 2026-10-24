import { useEffect, useRef, useState, type RefObject } from 'react'
import { TouchButton } from '../../touch/TouchButton'
import { lookBy, setHolding, useTouchMode } from '../../touch/touch'
import { setTrigger, toggleAim, type AimTrigger } from './input'

// On a phone or tablet, what's in your hands gets its own on-screen buttons, above Jump and Roll
// (../../touch): Shoot (or Throw), held to keep firing, and dragged to turn the camera as you shoot; Aim, on
// till it's pressed again (a throwable's wind-up, which a throw ends); and, for a gun, Reload. Their icons are
// in public/control-icons.

// A tap holds the trigger at least this long (s), so the gun has time to come up and fire
const MIN_HOLD = 0.2

export function TouchFire({ state, throwable = false, onReload }: { state: RefObject<AimTrigger>; throwable?: boolean; onReload?: () => void }) {
  const on = useTouchMode()
  const [aiming, setAiming] = useState(false)
  const press = useRef({ at: 0, count: 0 })
  // (Jump and Roll show what's in your hands)
  useEffect(() => {
    setHolding(throwable ? 'throwable' : 'gun')
    return () => setHolding(null)
  }, [throwable])
  // (Aiming can be ended from elsewhere: a throw)
  useEffect(() => {
    const id = window.setInterval(() => setAiming(state.current.toggled), 100)
    return () => window.clearInterval(id)
  }, [state])
  if (!on) return null

  const pull = () => {
    setTrigger(state.current, true)
    press.current.at = performance.now()
    press.current.count++
  }
  const release = () => {
    const which = press.current.count
    const letGo = () => {
      if (press.current.count !== which) return // pressed again since
      setTrigger(state.current, false)
    }
    const wait = MIN_HOLD * 1000 - (performance.now() - press.current.at)
    if (wait > 0) window.setTimeout(letGo, wait)
    else letGo()
  }
  const aim = () => setAiming(toggleAim(state.current))

  return (
    <>
      {throwable ? (
        <TouchButton className="touch-shoot" label="Throw" onDown={pull} onUp={release} onDrag={lookBy}>
          Throw
        </TouchButton>
      ) : (
        <TouchButton className="touch-shoot touch-face" label="Shoot" onDown={pull} onUp={release} onDrag={lookBy}>
          <span className="touch-icon icon-shoot" />
        </TouchButton>
      )}
      <TouchButton className="touch-aim touch-face" label="Aim" active={aiming} onDown={aim}>
        <span className="touch-icon icon-aim" />
      </TouchButton>
      {onReload && (
        <TouchButton className="touch-reload touch-face" label="Reload" onDown={onReload}>
          <span className="touch-icon icon-reload" />
        </TouchButton>
      )}
    </>
  )
}
