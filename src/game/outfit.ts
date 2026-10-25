import { useSyncExternalStore } from 'react'
import type { FlagId } from './flags'

// What the character is wearing. One item per slot; saved in the browser so it carries across levels.

export const SHADE_COLORS = {
  black: '#1f1f24',
  pink: '#ff5fb7',
  red: '#e8323c',
  blue: '#2f7be8',
  orange: '#ff8a1f',
} as const

export type Outfit = {
  hat: 'none' | 'cap' | 'topHat' | 'hardHat' | 'combatHelmet'
  face: 'none' | 'medical' | 'fullMask'
  shades: 'none' | keyof typeof SHADE_COLORS
  back: 'none' | 'backpack' | 'military'
  flag: 'none' | FlagId // patch on the military backpack
}

const DEFAULT: Outfit = { hat: 'none', face: 'none', shades: 'none', back: 'none', flag: 'none' }
const STORAGE_KEY = 'fallguy.outfit'

function load(): Outfit {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Outfit>
    return { ...DEFAULT, ...saved }
  } catch {
    return DEFAULT
  }
}

let outfit = load()
const listeners = new Set<() => void>()

export function setOutfit(patch: Partial<Outfit>) {
  outfit = { ...outfit, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(outfit))
  } catch {
    // storage unavailable (private mode, blocked): the choice just won't survive a reload
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// What's worn now (for the moment it's needed, e.g. joining a game)
export const currentOutfit = () => outfit

export function useOutfit() {
  return useSyncExternalStore(subscribe, () => outfit)
}
