import { useEffect, type RefObject } from 'react'

const AIM_KEY = 'KeyZ' // or hold the right mouse button

export type AimTrigger = {
  aiming: boolean
  toggled: boolean // aiming with the on-screen Aim button (on a phone or tablet: ./TouchFire), till it's pressed again
  trigger: boolean // left mouse button held (or the on-screen Shoot button)
  fresh: boolean // pressed and not acted on yet (one action per click)
}

// The on-screen buttons (./TouchFire): the trigger pulled or let go, and aiming turned on or off
export function setTrigger(s: AimTrigger, down: boolean) {
  s.trigger = down
  s.fresh = down
}
export function toggleAim(s: AimTrigger) {
  s.toggled = !s.toggled
  s.aiming = s.toggled
  return s.toggled
}

// Right mouse button (or Z) aims; left mouse button pulls the trigger (or throws). Both mouse buttons work at
// once: the browser only sends pointerdown/pointerup for the first button pressed and the last released (a
// second button in between arrives as a pointermove), so read which buttons are down from `buttons` on
// every pointer event. New presses only count on the game view (not on the HUD); releases count anywhere.
// Fingers don't count: on a touch screen, dragging the view turns the camera, and there are buttons to aim
// and shoot with instead (./TouchFire).
export function useAimTrigger(canvas: HTMLCanvasElement, state: RefObject<AimTrigger>) {
  useEffect(() => {
    const s = state.current
    let mouseAim = false
    let keyAim = false
    const read = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const onView = e.target === canvas
      const left = (e.buttons & 1) !== 0
      const right = (e.buttons & 2) !== 0
      if (left && !s.trigger && onView) {
        s.trigger = true
        s.fresh = true
      } else if (!left) {
        s.trigger = false
        s.fresh = false
      }
      if (right && !mouseAim && onView) mouseAim = true
      else if (!right) mouseAim = false
      s.aiming = mouseAim || keyAim || s.toggled
    }
    const keyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== AIM_KEY) return
      keyAim = true
      s.aiming = true
    }
    const keyUp = (e: KeyboardEvent) => {
      if (e.code !== AIM_KEY) return
      keyAim = false
      s.aiming = mouseAim || s.toggled
    }
    const blur = () => {
      mouseAim = keyAim = false
      s.aiming = s.toggled
      s.trigger = false
      s.fresh = false
    }
    canvas.addEventListener('pointerdown', read)
    window.addEventListener('pointermove', read)
    window.addEventListener('pointerup', read)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    return () => {
      canvas.removeEventListener('pointerdown', read)
      window.removeEventListener('pointermove', read)
      window.removeEventListener('pointerup', read)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
    }
  }, [canvas, state])
}
