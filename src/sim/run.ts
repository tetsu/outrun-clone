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
/** Seconds the car stands still after the run ends before it starts over (until M7's screens). */
const RESTART_AFTER = 3;

export type RunPhase = "driving" | "over" | "goal";
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

  /** A fresh run on a stage that grants `time` seconds. */
  start(time: number): void {
    this.phase = "driving";
    this.timeLeft = time;
    this.score = 0;
    this.stage = 1;
    this.banner = null;
    this.bannerTime = 0;
    this.bonus = 0;
    this.stopped = 0;
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
    } else if (speed <= 0) {
      this.stopped += dt;
    }
  }

  /** The run has ended and the car has stood still long enough to start over. */
  get finished(): boolean {
    return this.phase !== "driving" && this.stopped >= RESTART_AFTER;
  }

  private show(banner: Banner): void {
    this.banner = banner;
    this.bannerTime = 0;
  }
}
