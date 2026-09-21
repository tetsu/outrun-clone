import type { InputState } from "../core/input";
import type { PlayerState } from "./player";

/**
 * A recorded drive: the car's state at the start and every simulation step's input. The
 * simulation is deterministic, so playing the inputs back from the same start reproduces the
 * drive exactly — until the handling changes, which is what makes replays useful for tuning:
 * record once, then see how the same driving plays out after each change.
 */
export interface Replay {
  version: 1;
  /** Name of the stage it was driven on. */
  stage: string;
  start: PlayerState;
  /** Runs of identical steps: [count, steer, throttle, brake, gearToggle]. */
  runs: Array<[number, number, number, number, 0 | 1]>;
}

export class ReplayRecorder {
  private readonly replay: Replay;

  constructor(stage: string, start: PlayerState) {
    this.replay = { version: 1, stage, start: { ...start }, runs: [] };
  }

  /** Call with the input of every simulation step, in order. */
  record(input: InputState): void {
    const runs = this.replay.runs;
    const gear = input.gearToggle ? 1 : 0;
    const last = runs[runs.length - 1];
    if (last && last[1] === input.steer && last[2] === input.throttle && last[3] === input.brake && last[4] === gear && gear === 0) {
      last[0]++;
    } else {
      runs.push([1, input.steer, input.throttle, input.brake, gear]);
    }
  }

  get steps(): number {
    return this.replay.runs.reduce((n, run) => n + run[0], 0);
  }

  finish(): Replay {
    return structuredClone(this.replay);
  }
}

/** Hands out a replay's inputs one step at a time; null once it has run out. */
export class ReplayPlayer {
  private run = 0;
  private used = 0;

  constructor(readonly replay: Replay) {}

  next(): InputState | null {
    const runs = this.replay.runs;
    while (this.run < runs.length && this.used >= runs[this.run][0]) {
      this.run++;
      this.used = 0;
    }
    if (this.run >= runs.length) return null;
    this.used++;
    const [, steer, throttle, brake, gear] = runs[this.run];
    return { steer, throttle, brake, gearToggle: gear === 1 };
  }
}
