import { useSyncExternalStore } from 'react'
import { GUNS } from './catalog'

// Rounds in each gun (by catalog index): the magazine and the reserve it reloads from, and the reload in
// progress, if any. Each gun keeps its own counts while you swap between them; putting one back on its
// pedestal restocks it. Times are in seconds (performance.now based).

export type Reload = { gun: number; start: number; duration: number }
type AmmoState = { mag: number[]; reserve: number[]; reload: Reload | null }

let state: AmmoState = {
  mag: GUNS.map((g) => g.magazine),
  reserve: GUNS.map((g) => g.reserve),
  reload: null,
}
const listeners = new Set<() => void>()

function set(next: AmmoState) {
  state = next
  listeners.forEach((l) => l())
}

export const now = () => performance.now() / 1000

export const ammo = {
  get: () => state,

  // Use one round from the magazine; false if it's empty
  spend(gun: number) {
    if (state.mag[gun] <= 0) return false
    const mag = [...state.mag]
    mag[gun] -= 1
    set({ ...state, mag })
    return true
  },

  // Start reloading (no-op when full, out of reserve, or already reloading this gun)
  startReload(gun: number) {
    if (state.reload?.gun === gun) return
    if (state.mag[gun] >= GUNS[gun].magazine || state.reserve[gun] <= 0) return
    set({ ...state, reload: { gun, start: now(), duration: GUNS[gun].fire.reload } })
  },

  cancelReload() {
    if (state.reload) set({ ...state, reload: null })
  },

  // Finish a reload whose time is up: move rounds from the reserve into the magazine
  update() {
    const r = state.reload
    if (!r || now() < r.start + r.duration) return
    const moved = Math.min(GUNS[r.gun].magazine - state.mag[r.gun], state.reserve[r.gun])
    const mag = [...state.mag]
    const reserve = [...state.reserve]
    mag[r.gun] += moved
    reserve[r.gun] -= moved
    set({ mag, reserve, reload: null })
  },

  // Back to a full magazine and reserve (a gun returned to its pedestal)
  refill(gun: number) {
    const mag = [...state.mag]
    const reserve = [...state.reserve]
    mag[gun] = GUNS[gun].magazine
    reserve[gun] = GUNS[gun].reserve
    set({ mag, reserve, reload: state.reload?.gun === gun ? null : state.reload })
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAmmo() {
  return useSyncExternalStore(subscribe, () => state)
}
