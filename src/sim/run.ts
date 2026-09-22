import { MAX_SPEED } from "./player";

/**
 * One run against the clock: the countdown, the checkpoints that extend it, the score, and
 * how the run ends (the time running out, or the goal). Distances and stages are the route's
 * business (route.ts); the game feeds this the events.
 *
 * The values here set the pacing. They are placeholders until M9, when they are matched
 * against the original's: a stage's time is in its stage file (`time`), and the score is
 * distance driven, weighted by speed, plus a bonus for the time left at the goal.
 */

/** Seconds a stage grants when its file gives no `time`. */
export const DEFAULT_STAGE_TIME = 65;
/** Points per metre at top speed; slower driving earns proportionally less. */
const SCORE_PER_METRE = 10;
/** Points per whole second left on the clock at the goal. */
const BONUS_PER_SECOND = 20000;
/** How long a banner stays up (the goal's and game over's stay). */
const BANNER_SECONDS = 2.5;
/** Seconds the car stands still after the run ends before the run counts as finished. */
const STOPPED_FOR = 3;

/** "ready": at the start line, clock held, until go(). */
export type RunPhase = "ready" | "driving" | "over" | "goal";
export type Banner = "checkpoint" | "goal" | "over" | null;

export class Run {
  phase: RunPhase = "driving";
  /** Seconds left on the clock. */
  timeLeft = 0;
  score = 0;
  /** Stages entered in this run, counted from 1 (a run started mid-route counts from there). */
  stage = 0;
  /** What the HUD shows across the screen, and for how long it has been up. */
  banner: Banner = null;
  bannerTime = 0;
  /** The time bonus awarded at the goal. */
  bonus = 0;
  private stopped = 0;

  /** A fresh run on a stage that grants `time` seconds, driving at once unless held `ready` for a start-line countdown. */
  start(time: number, ready = false): void {
    this.phase = ready ? "ready" : "driving";
    this.timeLeft = time;
    this.score = 0;
    this.stage = 1;
    this.banner = null;
    this.bannerTime = 0;
    this.bonus = 0;
    this.stopped = 0;
  }

  /** The start line: the clock runs. */
  go(): void {
    if (this.phase === "ready") this.phase = "driving";
  }

  /** The checkpoint into the next stage: its time is added to what is left. */
  enter(time: number): void {
    if (this.phase !== "driving") return;
    this.stage++;
    this.timeLeft += time;
    this.show("checkpoint");
  }

  /** The goal line. */
  finish(): void {
    if (this.phase !== "driving") return;
    this.phase = "goal";
    this.bonus = Math.ceil(this.timeLeft) * BONUS_PER_SECOND;
    this.score += this.bonus;
    this.show("goal");
  }

  step(dt: number, speed: number): void {
    this.bannerTime += dt;
    if (this.banner === "checkpoint" && this.bannerTime >= BANNER_SECONDS) this.banner = null;
    if (this.phase === "driving") {
      this.timeLeft -= dt;
      this.score += speed * dt * SCORE_PER_METRE * (speed / MAX_SPEED);
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.phase = "over";
        this.show("over");
      }
    } else if (this.phase !== "ready" && speed <= 0) {
      this.stopped += dt;
    }
  }

  /** The run has ended and the car has stood still for a moment. */
  get finished(): boolean {
    return (this.phase === "over" || this.phase === "goal") && this.stopped >= STOPPED_FOR;
  }

  private show(banner: Banner): void {
    this.banner = banner;
    this.bannerTime = 0;
  }
}
