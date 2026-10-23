import type { useRapier } from '@react-three/rapier'

// The way round a course, for the bots: a string of points to head for, in order. How a bot gets from one to
// the next (round what's swinging at it, over the gaps, up whatever it catches hold of) is up to its pilot
// (./pilot); a point only has to say where, and anything out of the ordinary about getting there.

export type P3 = [number, number, number]

// What a point's `at` can go by, when where to head depends on the moment or on the bot
export type BotView = {
  t: number // the match clock
  x: number // where the bot is (its middle; its feet are 1 lower)
  y: number
  z: number
  bias: number // -1..1: which side of the way this bot tends to keep to
  memo: Record<string, number> // the bot's own notes for this point (cleared when it moves on)
  physics: ReturnType<typeof useRapier>
}

export type Waypoint = {
  // Where to head for: a spot on the ground (the height is the ground's), or a way of working one out
  at: P3 | ((v: BotView) => P3)
  r?: number // how near counts as there (1.3 if not given)
  // Room to either side of the way here: bots fan out across it, up to this far from the line
  spread?: number
  // Once there, jump (heading on for the next point) to catch whatever's overhead or ahead: a bar, a hold
  leap?: boolean
  // The way on from here is through the air (off a bounce pad, say): a bot that finds itself back on the
  // ground with the next point still out of reach above it comes back here for another go
  retry?: boolean
  // The way here squeezes past something by a hair (a boulder's width from a wall): keep to the line, and
  // don't shy at near misses
  tight?: boolean
  // A bot that ends up well below the way here (knocked off a ramp, say) goes back to the last point before
  // this one that's on the level it's landed on
  back?: boolean
  // How far down from where it is (or from here, if that's lower) a bot heading here can come without
  // counting it a fall (1.6 if not given): less where dropping down a little leaves it stuck (into a gap
  // between steps, say)
  drop?: number
  // Somewhere to pass through, not stop: where nowhere's safe to stand (beside a spinning bar's post, say)
  // but the way on goes round something. A bot works out its way through it and on to the next point.
  through?: boolean
  // Somewhere to stay rather than pass: a bot keeps making for it (in a level you last out, not race through)
  hold?: boolean
  // Somewhere to wait while this says so (for a gust to blow over before a narrow bridge, say): a bot that
  // gets here doesn't go on until it doesn't
  wait?: (v: BotView) => boolean
  // A bot put back at checkpoint n (0: the start) carries on from this point
  resume?: number
}

export type Route = Waypoint[]

// Which point a bot put back at `checkpoint` carries on from
export function resumeAt(route: Route, checkpoint: number) {
  let best = 0
  for (let i = 0; i < route.length; i++) {
    const n = route[i].resume
    if (n !== undefined && n <= checkpoint) best = i
  }
  return best
}
