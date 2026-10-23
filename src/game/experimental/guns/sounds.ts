import type { AmmoKind } from './catalog'

// EXPERIMENTAL: gun (and throwable) sounds. Placeholders for now, made up on the spot with WebAudio (no sound files): each is a
// few layers of filtered noise (the crack, the blast, the echo) and falling tones (the thump, the knock of
// metal on metal), shaped to the gun. Everything plays through the play* functions at the bottom, so a
// recording can take a placeholder's place there later.

// What a shot sounds like; each gun picks one in the catalog
export type ShotSound =
  | 'pistol'
  | 'smg'
  | 'suppressedSmg'
  | 'rifle'
  | 'heavyRifle'
  | 'shotgun'
  | 'sniper'
  | 'suppressedSniper'
  | 'rocket'
  | 'launcher'

const VOLUME = 0.5 // everything together

// A burst of noise through a filter: sharp attack, exponential fall. `sweep` slides the filter to that
// frequency by the end (a whoosh, an echo darkening).
type Hiss = {
  hiss: BiquadFilterType
  freq: number
  q?: number
  sweep?: number
  attack?: number
  decay: number
  gain: number
  delay?: number
}
// A tone falling in pitch: the thump of a shot, the knock of metal on metal
type Tone = { tone: OscillatorType; from: number; to: number; decay: number; gain: number; delay?: number }
type Layer = Hiss | Tone

// Shots: a high crack, the blast itself, a low thump and an echo trailing off. Bigger guns go lower and
// longer; suppressed ones are a muffled thud and the click of the action.
const crack = (freq: number, decay: number, gain: number): Hiss => ({ hiss: 'highpass', freq, decay, gain })
const blast = (freq: number, decay: number, gain: number, q = 0.8): Hiss => ({ hiss: 'bandpass', freq, q, decay, gain })
const thump = (from: number, to: number, decay: number, gain: number): Tone => ({ tone: 'sine', from, to, decay, gain })
const echo = (freq: number, decay: number, gain: number): Hiss => ({
  hiss: 'lowpass',
  freq,
  sweep: freq / 3,
  attack: 0.02,
  decay,
  gain,
  delay: 0.01,
})
const action = (gain: number): Hiss => ({ hiss: 'bandpass', freq: 3800, q: 3, decay: 0.015, gain, delay: 0.02 })

const SHOTS: Record<ShotSound, { volume: number; layers: Layer[] }> = {
  pistol: {
    volume: 0.75,
    layers: [crack(2500, 0.025, 0.9), blast(1500, 0.08, 0.9), thump(170, 60, 0.07, 0.6), echo(900, 0.3, 0.18)],
  },
  smg: {
    volume: 0.6,
    layers: [crack(3000, 0.018, 0.7), blast(1900, 0.06, 0.8, 0.9), thump(150, 70, 0.05, 0.45), echo(1000, 0.18, 0.12)],
  },
  suppressedSmg: {
    volume: 0.5,
    layers: [{ hiss: 'lowpass', freq: 700, q: 0.7, decay: 0.05, gain: 0.8 }, thump(220, 90, 0.03, 0.35), action(0.3)],
  },
  rifle: {
    volume: 0.8,
    layers: [crack(2200, 0.03, 1), blast(1100, 0.12, 1, 0.7), thump(130, 45, 0.1, 0.8), echo(800, 0.45, 0.22)],
  },
  heavyRifle: {
    volume: 0.85,
    layers: [crack(1800, 0.035, 1), blast(850, 0.16, 1, 0.7), thump(110, 38, 0.13, 0.95), echo(700, 0.6, 0.26)],
  },
  shotgun: {
    volume: 0.95,
    layers: [
      crack(1500, 0.04, 0.9),
      { hiss: 'lowpass', freq: 1400, sweep: 300, decay: 0.22, gain: 1 },
      thump(95, 32, 0.18, 1),
      echo(600, 0.8, 0.3),
    ],
  },
  sniper: {
    volume: 1,
    layers: [crack(2600, 0.04, 1.1), blast(1000, 0.18, 1, 0.6), thump(100, 34, 0.16, 1), echo(700, 1.3, 0.3)],
  },
  suppressedSniper: {
    volume: 0.6,
    layers: [
      { hiss: 'lowpass', freq: 900, decay: 0.08, gain: 0.9 },
      thump(160, 60, 0.06, 0.55),
      action(0.35),
      echo(400, 0.25, 0.1),
    ],
  },
  // A hollow 'thoomp' out of a wide tube
  launcher: {
    volume: 0.85,
    layers: [
      thump(140, 55, 0.14, 1),
      { hiss: 'bandpass', freq: 600, q: 1.5, decay: 0.12, gain: 0.7 },
      { tone: 'triangle', from: 320, to: 200, decay: 0.08, gain: 0.35 },
      echo(500, 0.35, 0.18),
    ],
  },
  // The launch: a rising whoosh over a deep thump
  rocket: {
    volume: 0.9,
    layers: [
      { hiss: 'bandpass', freq: 500, q: 1.2, sweep: 2200, attack: 0.05, decay: 0.6, gain: 0.8 },
      thump(80, 40, 0.25, 0.9),
      crack(1200, 0.05, 0.5),
    ],
  },
}

// A rocket going off: a crack, a deep boom, a long rumble and bits raining down
const EXPLOSION: Layer[] = [
  crack(1000, 0.06, 0.9),
  thump(70, 24, 0.7, 1.2),
  { hiss: 'lowpass', freq: 500, sweep: 90, attack: 0.01, decay: 1.6, gain: 1.1 },
  { hiss: 'bandpass', freq: 2500, q: 0.8, decay: 0.5, gain: 0.2, delay: 0.08 },
]

// Gun handling: the small noises of magazines, bolts and shells
const HANDLING = {
  click: [
    { hiss: 'bandpass', freq: 3500, q: 3, decay: 0.02, gain: 0.6 },
    { tone: 'triangle', from: 1800, to: 1500, decay: 0.03, gain: 0.15 },
  ],
  clack: [
    { hiss: 'bandpass', freq: 1600, q: 2, decay: 0.04, gain: 0.8 },
    { tone: 'triangle', from: 320, to: 180, decay: 0.05, gain: 0.5 },
  ],
  slide: [{ hiss: 'bandpass', freq: 2000, q: 1.5, sweep: 3200, attack: 0.03, decay: 0.12, gain: 0.35 }],
  longSlide: [{ hiss: 'bandpass', freq: 900, q: 1.2, sweep: 1600, attack: 0.08, decay: 0.3, gain: 0.35 }],
  shell: [
    { hiss: 'bandpass', freq: 2400, q: 2, decay: 0.03, gain: 0.5 },
    { tone: 'triangle', from: 500, to: 350, decay: 0.04, gain: 0.3 },
  ],
  knock: [
    { tone: 'sine', from: 140, to: 70, decay: 0.12, gain: 0.8 },
    { hiss: 'lowpass', freq: 600, decay: 0.1, gain: 0.5 },
  ],
} satisfies Record<string, Layer[]>
type Handling = keyof typeof HANDLING

// Reloads, by the kind of ammo: when each noise comes, as a share of the reload's length
const RELOADS: Record<'magazine' | 'shells' | 'rocket' | 'drum', [number, Handling][]> = {
  // Magazine out, the new one in, then the charging handle racked
  magazine: [
    [0.12, 'click'],
    [0.14, 'slide'],
    [0.5, 'clack'],
    [0.75, 'slide'],
    [0.8, 'clack'],
  ],
  // Shells pushed in one by one, then the pump worked
  shells: [
    [0.15, 'shell'],
    [0.3, 'shell'],
    [0.45, 'shell'],
    [0.6, 'shell'],
    [0.8, 'slide'],
    [0.85, 'clack'],
  ],
  // The drum swung out, six capsules pushed in, the drum snapped shut
  drum: [
    [0.08, 'clack'],
    [0.2, 'shell'],
    [0.3, 'shell'],
    [0.4, 'shell'],
    [0.5, 'shell'],
    [0.6, 'shell'],
    [0.7, 'shell'],
    [0.84, 'clack'],
    [0.88, 'click'],
  ],
  // The tube opened, the rocket slid in, locked
  rocket: [
    [0.12, 'knock'],
    [0.45, 'longSlide'],
    [0.75, 'clack'],
    [0.78, 'knock'],
  ],
}
const RELOAD_KINDS: Record<AmmoKind, keyof typeof RELOADS> = {
  light: 'magazine',
  medium: 'magazine',
  heavy: 'magazine',
  shells: 'shells',
  rockets: 'rocket',
  capsules: 'drum',
}
const reloadKind = (ammo: AmmoKind) => RELOAD_KINDS[ammo]

// Throwables: the pin coming out, the swing of the arm, landing (a metal clink, or the dull thud of the
// dynamite's paper), glass breaking, fire catching and crackling, and a smoke grenade's pop
const PIN = [...HANDLING.click, { tone: 'triangle', from: 2600, to: 2400, decay: 0.15, gain: 0.08 }] satisfies Layer[]
const THROW: Layer[] = [{ hiss: 'bandpass', freq: 400, q: 1.2, sweep: 1400, attack: 0.05, decay: 0.18, gain: 0.5 }]
export type Landing = 'metal' | 'thud' | 'glass'
const LANDING: Record<Landing, Layer[]> = {
  metal: [
    { hiss: 'bandpass', freq: 3000, q: 4, decay: 0.05, gain: 0.6 },
    { tone: 'triangle', from: 1400, to: 1200, decay: 0.08, gain: 0.15 },
  ],
  thud: [
    { tone: 'sine', from: 180, to: 90, decay: 0.06, gain: 0.6 },
    { hiss: 'lowpass', freq: 800, decay: 0.04, gain: 0.4 },
  ],
  glass: [{ hiss: 'bandpass', freq: 5000, q: 5, decay: 0.03, gain: 0.5 }],
}
const SHARD: Layer[] = [
  { hiss: 'bandpass', freq: 6500, q: 5, decay: 0.04, gain: 0.7 },
  { tone: 'triangle', from: 4200, to: 3900, decay: 0.05, gain: 0.08 },
]
const IGNITE: Layer[] = [{ hiss: 'lowpass', freq: 300, sweep: 1500, attack: 0.1, decay: 0.6, gain: 0.8, delay: 0.05 }]
const CRACKLE: Layer[] = [
  { hiss: 'bandpass', freq: 2500, q: 2, decay: 0.012, gain: 0.5 },
  { hiss: 'highpass', freq: 4000, decay: 0.006, gain: 0.3 },
]
const SMOKE_POP: Layer[] = [crack(2000, 0.02, 0.5), thump(160, 80, 0.06, 0.5)]

// ---------------------------------------------------------------------------------------------------------
// WebAudio plumbing. The context starts on the first sound (after the player has clicked or pressed a key,
// so the browser lets it play). Everything goes through a limiter so a burst of shots can't clip.

type Audio = { ctx: AudioContext; out: GainNode; noise: AudioBuffer }
let audio: Audio | null = null

function getAudio(): Audio {
  if (!audio) {
    const ctx = new AudioContext()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 6
    limiter.ratio.value = 8
    limiter.attack.value = 0.002
    limiter.release.value = 0.15
    const out = ctx.createGain()
    out.gain.value = VOLUME
    out.connect(limiter).connect(ctx.destination)
    // Three seconds of white noise, played from a random point each time so no two shots are the same
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    audio = { ctx, out, noise }
  }
  if (audio.ctx.state === 'suspended') void audio.ctx.resume()
  return audio
}

// Shape a gain from silence up to `peak` and back down, exponentially
function envelope(g: GainNode, t: number, attack: number, decay: number, peak: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

// Play the layers from time `t` into `into`, every frequency scaled by `pitch`. Returns when they're all done.
function layers(a: Audio, into: AudioNode, t: number, list: Layer[], pitch = 1) {
  let end = t
  for (const layer of list) {
    const at = t + (layer.delay ?? 0)
    const g = a.ctx.createGain()
    g.connect(into)
    if ('hiss' in layer) {
      const attack = layer.attack ?? 0.001
      const src = a.ctx.createBufferSource()
      src.buffer = a.noise
      const filter = a.ctx.createBiquadFilter()
      filter.type = layer.hiss
      filter.Q.value = layer.q ?? 1
      filter.frequency.setValueAtTime(layer.freq * pitch, at)
      if (layer.sweep) filter.frequency.exponentialRampToValueAtTime(layer.sweep * pitch, at + attack + layer.decay)
      envelope(g, at, attack, layer.decay, layer.gain)
      src.connect(filter).connect(g)
      src.start(at, Math.random())
      src.stop(at + attack + layer.decay + 0.05)
      end = Math.max(end, at + attack + layer.decay + 0.05)
    } else {
      const osc = a.ctx.createOscillator()
      osc.type = layer.tone
      osc.frequency.setValueAtTime(layer.from * pitch, at)
      osc.frequency.exponentialRampToValueAtTime(layer.to * pitch, at + layer.decay)
      envelope(g, at, 0.002, layer.decay, layer.gain)
      osc.connect(g)
      osc.start(at)
      osc.stop(at + layer.decay + 0.05)
      end = Math.max(end, at + layer.decay + 0.05)
    }
  }
  return end
}

// A group of sounds with its own volume. It lets go of its nodes once what's in it has finished (`until`), or
// sooner if it's cut short (`stop`: a quick fade).
function bus(a: Audio, volume: number) {
  const g = a.ctx.createGain()
  g.gain.value = volume
  g.connect(a.out)
  let done = false
  const release = (delay: number) =>
    setTimeout(() => {
      done = true
      g.disconnect()
    }, delay * 1000)
  const stop = () => {
    if (done) return
    g.gain.setTargetAtTime(0, a.ctx.currentTime, 0.015)
    release(0.2)
  }
  const until = (end: number) => release(Math.max(0, end - a.ctx.currentTime) + 0.2)
  return { node: g, stop, until }
}

const vary = (amount: number) => 1 + (Math.random() - 0.5) * amount

// Quieter further from the player (distance in metres)
const near = (distance: number) => 1 / (1 + distance / 12)

// Noise played round and round through a filter, until stopped: a fizzing fuse, fire, a smoke grenade's hiss
function noiseLoop(a: Audio, into: AudioNode, filter: BiquadFilterType, freq: number, q: number, gain: number) {
  const src = a.ctx.createBufferSource()
  src.buffer = a.noise
  src.loop = true
  const f = a.ctx.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  f.Q.value = q
  const g = a.ctx.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(into)
  src.start(a.ctx.currentTime, Math.random())
  return { src, filter: f, gain: g }
}

// ---------------------------------------------------------------------------------------------------------
// What the game plays

// A shot from the player's gun, or one this far (m) away (someone else's): quieter further off
export function playShot(sound: ShotSound, distance = 0) {
  const a = getAudio()
  const { volume, layers: list } = SHOTS[sound]
  const b = bus(a, volume * near(distance))
  b.until(layers(a, b.node, a.ctx.currentTime + 0.005, list, vary(0.08)))
}

// Something going off this far (m) from the player: quieter further away. `size` 1 is a rocket; bigger is
// deeper and louder.
export function playExplosion(distance: number, size = 1) {
  const a = getAudio()
  const b = bus(a, near(distance) * Math.min(1.3, size))
  b.until(layers(a, b.node, a.ctx.currentTime + 0.005, EXPLOSION, vary(0.1) / size))
}

// A reload of `duration` seconds, `elapsed` seconds in already. Returns a function that cuts it short.
export function playReload(ammo: AmmoKind, duration: number, elapsed = 0) {
  const a = getAudio()
  const b = bus(a, 0.7)
  const t = a.ctx.currentTime + 0.005
  let end = t
  for (const [share, noise] of RELOADS[reloadKind(ammo)]) {
    const at = share * duration - elapsed
    if (at >= 0) end = Math.max(end, layers(a, b.node, t + at, HANDLING[noise], vary(0.06)))
  }
  b.until(end)
  return b.stop
}

// Working a bolt after a shot: lifted and pulled back `open` seconds from now, pushed home and locked by
// `close`. Returns a function that cuts it short.
export function playBolt(open: number, close: number) {
  const a = getAudio()
  const b = bus(a, 0.7)
  const t = a.ctx.currentTime + 0.005
  layers(a, b.node, t + open, HANDLING.click)
  layers(a, b.node, t + open + 0.03, HANDLING.slide)
  layers(a, b.node, t + close - 0.16, HANDLING.slide, 0.85)
  b.until(layers(a, b.node, t + close - 0.03, HANDLING.clack))
  return b.stop
}

// A grenade's pin pulled
export function playPin() {
  const a = getAudio()
  const b = bus(a, 0.7)
  b.until(layers(a, b.node, a.ctx.currentTime + 0.005, PIN))
}

// A throw: the arm's swing
export function playThrow() {
  const a = getAudio()
  const b = bus(a, 0.6)
  b.until(layers(a, b.node, a.ctx.currentTime + 0.005, THROW, vary(0.15)))
}

// Something thrown landing (or bouncing) at `speed` m/s, `distance` from the player
export function playLanding(kind: Landing, speed: number, distance: number) {
  const a = getAudio()
  const b = bus(a, Math.min(1, Math.max(0.15, speed / 8)) * near(distance))
  b.until(layers(a, b.node, a.ctx.currentTime + 0.005, LANDING[kind], vary(0.2)))
}

// A lit fuse fizzing, until stopped (returns the stop)
export function playFuse() {
  const a = getAudio()
  const b = bus(a, 0.5)
  const hiss = noiseLoop(a, b.node, 'bandpass', 5500, 0.9, 0.35)
  // A flutter on the hiss makes it spit
  const flutter = a.ctx.createOscillator()
  flutter.type = 'square'
  flutter.frequency.value = 17
  const depth = a.ctx.createGain()
  depth.gain.value = 0.15
  flutter.connect(depth).connect(hiss.gain.gain)
  flutter.start()
  return () => {
    b.stop()
    hiss.src.stop(a.ctx.currentTime + 0.3)
    flutter.stop(a.ctx.currentTime + 0.3)
  }
}

// A bottle smashing and its contents catching fire, `distance` from the player
export function playShatter(distance: number) {
  const a = getAudio()
  const b = bus(a, near(distance))
  const t = a.ctx.currentTime + 0.005
  let end = t
  for (let i = 0; i < 6; i++) end = Math.max(end, layers(a, b.node, t + Math.random() * 0.15, SHARD, vary(0.5)))
  b.until(Math.max(end, layers(a, b.node, t, IGNITE)))
}

// Fire burning for `duration` seconds, `distance` from the player: a low roar and crackles, dying away at
// the end. Returns a function that cuts it short.
export function playFire(duration: number, distance: number) {
  const a = getAudio()
  const b = bus(a, near(distance) * 0.6)
  const t = a.ctx.currentTime
  const roar = noiseLoop(a, b.node, 'lowpass', 700, 0.7, 0.5)
  for (let at = 0.05; at < duration - 0.5; at += 0.08 + Math.random() * 0.25) layers(a, b.node, t + at, CRACKLE, vary(0.4))
  b.node.gain.setValueAtTime(b.node.gain.value, t + duration - 1.2)
  b.node.gain.linearRampToValueAtTime(0.0001, t + duration)
  roar.src.stop(t + duration + 0.1)
  b.until(t + duration + 0.1)
  return b.stop
}

// A smoke grenade popping and hissing out its smoke for `duration` seconds, strongest at first.
// Returns a function that cuts it short.
export function playSmoke(duration: number, distance: number) {
  const a = getAudio()
  const b = bus(a, near(distance))
  const t = a.ctx.currentTime + 0.005
  layers(a, b.node, t, SMOKE_POP)
  const hiss = noiseLoop(a, b.node, 'highpass', 1800, 0.7, 0.55)
  hiss.filter.frequency.setValueAtTime(1800, t)
  hiss.filter.frequency.exponentialRampToValueAtTime(900, t + duration)
  hiss.gain.gain.setValueAtTime(0.55, t)
  hiss.gain.gain.exponentialRampToValueAtTime(0.12, t + duration * 0.4)
  hiss.gain.gain.linearRampToValueAtTime(0.0001, t + duration)
  hiss.src.stop(t + duration + 0.1)
  b.until(t + duration + 0.1)
  return b.stop
}
