// What's left to chance in a round (which doors are real, which colour's called, which walls come, the
// strikes...): in an online show, the same on every player's screen, worked out from the show's seed (see
// ./net/party); otherwise anything. Each thing drawn for gets its own generator, from what it is and which
// one (`n`: the 3rd call, the 7th wave), so one player's screen running a moment behind can't put the rest
// out of step.

let seed: number | null = null

// The round about to be played (null: not online, anything goes)
export function setRoundSeed(next: number | null) {
  seed = next
}

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

// A generator of numbers 0..1, the same sequence for the same seed
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The items in a random order (a copy). Not by sorting with a random comparison: how many times a sort
// compares, and so what order that comes out in, differs from browser to browser.
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Numbers for one thing this round: shared in an online show, Math.random otherwise
export function roundRandom(what: string, n = 0): () => number {
  return seed === null ? Math.random : seeded(hash(`${seed}:${what}:${n}`))
}

// A seed for one thing this round (for what takes a seed rather than numbers): shared online, else any
export function roundSeedFor(what: string) {
  return seed === null ? Math.floor(Math.random() * 1e9) : hash(`${seed}:${what}`)
}
