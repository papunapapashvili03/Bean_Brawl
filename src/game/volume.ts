import { useSyncExternalStore } from 'react'

// The game's volume, from the settings menu (./GameMenu): 0..1 on the slider, kept for next time. Every sound
// (./race/sound, ./experimental/guns/sounds) is played this much quieter: `loudness()`, the slider squared, so
// it sounds even all along the slider.

const KEY = 'fallguy.volume'
const listeners = new Set<() => void>()

let volume = (() => {
  try {
    const saved = Number(localStorage.getItem(KEY))
    return localStorage.getItem(KEY) !== null && saved >= 0 && saved <= 1 ? saved : 0.8
  } catch {
    return 0.8
  }
})()

export const getVolume = () => volume
export const loudness = () => volume * volume

export function setVolume(next: number) {
  volume = Math.min(1, Math.max(0, next))
  try {
    localStorage.setItem(KEY, String(volume))
  } catch {
    // (not kept: it's back to the default next time)
  }
  listeners.forEach((l) => l())
}

export function onVolume(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useVolume() {
  return useSyncExternalStore(onVolume, getVolume)
}
