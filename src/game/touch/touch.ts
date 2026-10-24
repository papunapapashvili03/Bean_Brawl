import { useSyncExternalStore } from 'react'

// Phones and tablets: on-screen controls (./TouchControls) in place of keys and a mouse. Touch mode comes on
// with a touch screen as the main pointer, or as soon as the screen's touched (or with ?touch=1 on the
// address, to try it with a mouse; ?touch=0 keeps it off). It puts a `touch` class on <html>, so the HUD can
// shrink to make room for the controls. What the controls are saying is kept here, and the player reads it
// each frame alongside the keys.

export const touch = {
  // The stick: which way to run, from the camera's point of view (x right, y forward), each -1..1; a short push
  // is a walk
  x: 0,
  y: 0,
  jump: false, // Space
  crouchHeld: false, // C: roll on the move, crouch standing still
  crouchPressed: false, // ... pressed since the player last looked
  drop: false, // Shift: let go of a ledge
  // Dragging to turn the camera from a button (shooting while turning): pixels moved since the player last
  // looked
  lookX: 0,
  lookY: 0,
}

export function lookBy(dx: number, dy: number) {
  touch.lookX += dx
  touch.lookY += dy
}

// ---------------------------------------------------------------------------------------------------------
// Touch mode

let on = false
const listeners = new Set<() => void>()

function setTouchMode(next: boolean) {
  if (on === next) return
  on = next
  document.documentElement.classList.toggle('touch', on)
  listeners.forEach((l) => l())
}

const forced = new URLSearchParams(window.location.search).get('touch')
if (forced === '1') setTouchMode(true)
else if (forced !== '0') {
  if (window.matchMedia('(pointer: coarse)').matches) setTouchMode(true)
  window.addEventListener('touchstart', () => setTouchMode(true), { once: true, passive: true })
}

export const touchMode = () => on

export function useTouchMode() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => on,
  )
}
