import { loudness } from '../volume'

// Tiny WebAudio synth for race cues, so there are no audio files to load. Played at the game's volume (../volume).
// Browsers keep audio suspended until the first user gesture, so resume on the first key or click.
let ctx: AudioContext | null = null

function audio() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

for (const event of ['keydown', 'pointerdown']) {
  window.addEventListener(event, () => audio(), { once: true })
}

// Sounds made inside `play` are this much quieter (0: silent), e.g. for something happening to a runner far off
let scale = 1
export function withVolume(volume: number, play: () => void) {
  const before = scale
  scale = volume
  try {
    play()
  } finally {
    scale = before
  }
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', loud = 0.15, delay = 0, slideTo?: number) {
  const volume = loud * scale * loudness()
  if (volume < 0.002) return
  const a = audio()
  const start = a.currentTime + delay
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(a.destination)
  osc.start(start)
  osc.stop(start + duration)
}

export const sfx = {
  count: () => tone(520, 0.2, 'square', 0.08),
  run: () => tone(1040, 0.45, 'square', 0.1),
  checkpoint: () => {
    tone(660, 0.12, 'triangle', 0.15)
    tone(990, 0.2, 'triangle', 0.15, 0.1)
  },
  beltWarning: () => {
    tone(880, 0.07, 'square', 0.06)
    tone(880, 0.07, 'square', 0.06, 0.14)
  },
  doorOpen: () => tone(220, 0.35, 'sawtooth', 0.08, 0, 520),
  doorLocked: () => tone(110, 0.2, 'square', 0.12, 0, 70),
  knock: () => tone(180, 0.15, 'triangle', 0.18, 0, 90),
  bounce: () => tone(260, 0.3, 'sine', 0.16, 0, 780),
  crumble: () => {
    tone(90, 0.5, 'sawtooth', 0.07, 0, 45)
    tone(140, 0.25, 'triangle', 0.08, 0.05, 60)
  },
  rumble: () => {
    tone(55, 1.1, 'sawtooth', 0.1, 0, 38)
    tone(70, 0.9, 'triangle', 0.12, 0.1, 45)
  },
  thunder: () => {
    tone(1400, 0.08, 'square', 0.05, 0, 400)
    tone(60, 1.4, 'sawtooth', 0.12, 0.05, 30)
  },
  gust: () => tone(180, 0.9, 'sine', 0.05, 0, 420),
  // A floor tile lighting up underfoot, and one dropping away
  tile: () => tone(760, 0.07, 'triangle', 0.05, 0, 1150),
  tileDrop: () => tone(300, 0.18, 'sine', 0.05, 0, 120),
  // Ice cracking further underfoot, and ice giving way
  crack: () => tone(1700, 0.05, 'square', 0.03, 0, 900),
  shatter: () => {
    tone(1300, 0.12, 'sawtooth', 0.04, 0, 400)
    tone(520, 0.22, 'triangle', 0.05, 0.03, 140)
  },
  // A colour called, and the floor dropping away
  call: () => [660, 880].forEach((f, i) => tone(f, 0.16, 'square', 0.07, i * 0.09)),
  floorDrop: () => tone(240, 0.4, 'sawtooth', 0.06, 0, 60),
  eliminated: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.15, i * 0.14)),
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, i * 0.12)),
}
