// Camera shake, in radians of jitter: short kicks (a piece breaking off nearby, a quake) on top of a steady
// tremor the level sets (the crown shaking as the tower comes down). Timed off the match clock.

type Kick = { amount: number; from: number; until: number }
const kicks: Kick[] = []
let tremor = 0

export function shakeCamera(amount: number, seconds: number, now: number) {
  kicks.push({ amount, from: now, until: now + seconds })
}

export function setTremor(amount: number) {
  tremor = amount
}

export function resetShake() {
  kicks.length = 0
  tremor = 0
}

// How hard the camera shakes at `now`: kicks die away over their time
export function shakeAt(now: number) {
  let total = tremor
  for (let i = kicks.length - 1; i >= 0; i--) {
    const k = kicks[i]
    if (now >= k.until || now < k.from - 1) {
      kicks.splice(i, 1)
      continue
    }
    total += k.amount * (1 - (now - k.from) / (k.until - k.from))
  }
  return total
}
