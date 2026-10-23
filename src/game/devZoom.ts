import { useSyncExternalStore } from 'react'

// Dev zoom: switched on (./DevZoom), the mouse wheel over the game pulls the follow camera out as far as you
// like (1 = the usual distance; it never comes in closer than that). The player's camera (./Player) scales
// its distance by devZoomScale(); out past the usual distance, walls stop pulling it in, and the fog and the
// camera's far limit get out of the way.

const MAX_SCALE = 20000 // ~200 km out: no limit in practice, only a guard against running off to Infinity
const WHEEL_RATE = 0.002 // per pixel of wheel travel: one notch (100 px) is about 1.2x

let state = { on: false, scale: 1 }
const listeners = new Set<() => void>()
const publish = (next: typeof state) => {
  state = next
  listeners.forEach((l) => l())
}

function onWheel(e: WheelEvent) {
  // Only over the game itself (not a scrolling panel); overlays that let the pointer through count
  if (!(e.target instanceof HTMLCanvasElement)) return
  const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1)
  const scale = Math.min(MAX_SCALE, Math.max(1, state.scale * Math.exp(px * WHEEL_RATE)))
  if (scale !== state.scale) publish({ ...state, scale })
}

export function setDevZoom(on: boolean) {
  if (on === state.on) return
  if (on) window.addEventListener('wheel', onWheel, { passive: true })
  else window.removeEventListener('wheel', onWheel)
  publish({ on, scale: 1 })
}

export const devZoomScale = () => state.scale

export function useDevZoom() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
  )
}
