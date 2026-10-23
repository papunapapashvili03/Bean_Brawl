import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { THROW_KINDS, freshLive, type ThrowKind } from './catalog'

// The throwables you carry, in hotbar slot 4: up to CARRY_MAX of each kind, and which kind is in your hand.
// Pressing 4 again switches to the next kind you have.

export const CARRY_MAX = 3

export type Pouch = { counts: Record<ThrowKind, number>; selected: ThrowKind | null }

const EMPTY: Pouch = { counts: { grenade: 0, dynamite: 0, molotov: 0, smoke: 0 }, selected: null }
let state: Pouch = EMPTY
const listeners = new Set<() => void>()

function set(next: Pouch) {
  state = next
  listeners.forEach((l) => l())
}

// The next kind after `from` that you have any of (round the list), or null
function nextCarried(from: ThrowKind | null, counts: Pouch['counts']) {
  const start = from === null ? -1 : THROW_KINDS.indexOf(from)
  for (let i = 1; i <= THROW_KINDS.length; i++) {
    const kind = THROW_KINDS[(start + i) % THROW_KINDS.length]
    if (counts[kind] > 0) return kind
  }
  return null
}

export const pouch = {
  get: () => state,
  reset: () => set(EMPTY),

  // Picked up from its pedestal: a full stack, and it's the one in your hand
  fill(kind: ThrowKind) {
    set({ counts: { ...state.counts, [kind]: CARRY_MAX }, selected: kind })
  },

  // One thrown (or gone off in your hand); when that was the last, the next kind you have comes out
  use(kind: ThrowKind) {
    if (state.counts[kind] <= 0) return false
    const counts = { ...state.counts, [kind]: state.counts[kind] - 1 }
    set({ counts, selected: counts[kind] > 0 ? kind : nextCarried(kind, counts) })
    return true
  },

  // Back on its pedestal
  putBack(kind: ThrowKind) {
    const counts = { ...state.counts, [kind]: 0 }
    set({ counts, selected: state.selected === kind ? nextCarried(kind, counts) : state.selected })
  },

  cycle() {
    const next = nextCarried(state.selected, state.counts)
    if (next && next !== state.selected) set({ ...state, selected: next })
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePouch() {
  return useSyncExternalStore(subscribe, () => state)
}

// The throwable in the character's hand right now: which kind, what it shows, how much of it shows (it
// comes out of the pouch after a throw) and where it is in the world (the held model's world matrix,
// refreshed every frame), so a throw leaves from the hand
export const throwInHand = {
  kind: 'grenade' as ThrowKind,
  live: freshLive(),
  show: 1,
  matrix: new THREE.Matrix4(),
  ready: false, // false until the held model has been drawn once
}
