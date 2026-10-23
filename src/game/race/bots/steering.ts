import type { RapierRigidBody, useRapier } from '@react-three/rapier'
import type { Runner, RunnerInput } from '../../runner'
import type { PilotSkill } from './pilot'
import type { P3 } from './route'

// What steers a race bot, frame by frame: by default a pilot round the course's route (./pilot), but a level
// that isn't a way from A to B (a floor that falls away under you, say) can give its bots a mind of its own.

export type Steering = {
  quit: boolean // it's given up: put it back at its checkpoint
  // Fill in `input` (what the body does this frame)
  update(
    input: RunnerInput,
    rb: RapierRigidBody,
    runner: Runner,
    physics: ReturnType<typeof useRapier>,
    now: number,
    canMove: boolean,
    checkpoint: number,
    finished: boolean,
  ): void
}

// Who a bot is: where it started, how good it is, which side of things it tends to keep to (-1..1)
export type BotTraits = { name: string; colour: string; start: P3; skill: PilotSkill; bias: number }
