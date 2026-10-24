import { raceClock } from '../race/race'
import { WAVE } from './course'

// The tidal wave's two beams (./TidalWave): each one's whole run up and down the deck, worked out when the race
// starts (different every race), its speed changing every second or so; and the guess the bots go by (going
// on as it's going now).

const RATE = 60 // steps a second in a beam's run
const SECONDS = 600
const ACCEL = 18 // m/s² it changes speed at

type Run = { z: Float32Array; v: Float32Array }
const runs: Run[] = [0, 1].map(() => ({ z: new Float32Array(SECONDS * RATE), v: new Float32Array(SECONDS * RATE) }))

function seeded(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// A beam's run: from one end, at a speed that changes every so often (mostly middling, now and then a surge
// or a crawl), turning back at the ends
function plan(run: Run, seed: number, from: number, dir: number) {
  const random = seeded(seed)
  let z = from
  let v = dir * 4
  let want = 4
  let until = 0
  const dt = 1 / RATE
  for (let i = 0; i < run.z.length; i++) {
    const t = i * dt
    if (t >= until) {
      until = t + 0.45 + random() * 1.05
      const r = random()
      want = r < 0.2 ? WAVE.slowest : r > 0.82 ? WAVE.fastest : WAVE.slowest + (WAVE.fastest - WAVE.slowest) * (0.25 + random() * 0.5)
    }
    const speed = Math.abs(v)
    const next = speed + Math.max(-ACCEL * dt, Math.min(ACCEL * dt, want - speed))
    v = Math.sign(v || dir) * next
    z += v * dt
    if (z < WAVE.far) {
      z = WAVE.far + (WAVE.far - z)
      v = Math.abs(v)
    } else if (z > WAVE.near) {
      z = WAVE.near - (z - WAVE.near)
      v = -Math.abs(v)
    }
    run.z[i] = z
    run.v[i] = v
  }
}

export function resetWave(seed = Math.floor(Math.random() * 1e9)) {
  plan(runs[0], seed, WAVE.near, -1)
  plan(runs[1], seed * 7 + 3, WAVE.far, 1)
}
resetWave(1)

const at = (run: Run, t: number) => Math.max(0, Math.min(run.z.length - 1, Math.round(t * RATE)))
export const beamZ = (k: number, t: number) => runs[k].z[at(runs[k], t)]
export const beamV = (k: number, t: number) => runs[k].v[at(runs[k], t)]

// Where a bot reckons a beam will be at t: going on from where it is now as it's going now (turning back at
// the ends)
export function guess(k: number, t: number) {
  const now = raceClock()
  if (t <= now + 0.02) return beamZ(k, t)
  let z = beamZ(k, now) + beamV(k, now) * (t - now)
  for (let i = 0; i < 3; i++) {
    if (z < WAVE.far) z = 2 * WAVE.far - z
    else if (z > WAVE.near) z = 2 * WAVE.near - z
  }
  return z
}

