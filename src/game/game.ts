import type { InputState } from "../core/input";
import { collide, stepCrash, type HitEvent } from "../sim/collision";
import { createPlayer, stepPlayer, type PlayerState } from "../sim/player";
import { Random } from "../sim/random";
import type { Route } from "../sim/route";
import { DEFAULT_STAGE_TIME, Run, type Banner, type RunPhase } from "../sim/run";
import { Traffic } from "../sim/traffic";
import { heightAt, roadUnder, wrapDistance, type Track } from "../sim/track";

/** What the renderer needs for one frame, already interpolated between simulation steps. */
export interface RenderState {
  /** Car centre: distance along the track and lateral position. */
  z: number;
  x: number;
  speed: number;
  steer: number;
  gear: 0 | 1;
  offroad: boolean;
  /** The throttle applied in the last step, for the engine sound. */
  throttle: number;
  skid: number;
  lapTime: number;
  crash: number;
  crashTime: number;
  crashDir: number;
  ghost: number;
  /** Traffic, interpolated like the car. */
  vehicles: { id: number; kind: string; road: "a" | "b"; z: number; x: number }[];
  /** The run against the clock; none on a looping test course. */
  run: { phase: RunPhase; timeLeft: number; score: number; stage: number; banner: Banner; bannerTime: number; bonus: number } | null;
  /** Total distance driven, never wrapped; drives the background scroll and wheel effects. */
  odometer: number;
  /** Sideways scroll of the background, in screen heights. */
  backgroundScroll: number;
}

export type GameEvent = HitEvent | "checkpoint" | "goal" | "over";
const MAX_EVENTS = 64;

export class Game {
  readonly player: PlayerState = createPlayer();
  private previous: PlayerState = { ...this.player };
  private odometer = 0;
  private previousOdometer = 0;
  private scroll = 0;
  private previousScroll = 0;

  track: Track;
  /** The run's stages, when driving a route rather than a looping test course. */
  route: Route | null;
  /** The clock, score and how the run ends; a route only. */
  readonly run: Run | null;
  /** Traffic runs on a route only; a looping test course is kept clear for tuning. */
  readonly traffic = new Traffic(1);
  /** Draws for collisions (which way a head-on hit spins). */
  readonly random = new Random(7);
  /** What the car hit in the last step, for sound and effects. */
  lastHit: HitEvent | null = null;
  /** What happened, for the sound: hits and the run's turns. Whoever plays them drains the list. */
  readonly events: GameEvent[] = [];
  private throttle = 0;

  constructor(course: Track | Route) {
    this.route = "placed" in course ? course : null;
    this.track = "placed" in course ? course.track : course;
    this.run = this.route ? new Run() : null;
    if (this.route) {
      this.traffic.reset(this.track, 0);
      this.run!.start(this.stageTime(this.route.first));
    }
  }

  private stageTime(stage: string): number {
    return this.route?.stages[stage]?.time ?? DEFAULT_STAGE_TIME;
  }

  /** Swap in a rebuilt looping course (the tuning panel does this), keeping the car where it is. */
  setTrack(track: Track): void {
    this.route = null;
    this.traffic.vehicles = [];
    this.track = track;
    this.player.z = wrapDistance(track, this.player.z);
    this.previous = { ...this.player };
  }

  /** Start the route over at a stage, with the car `z` metres into it (rebuilt with the current course tuning). */
  restartRoute(stage: string, z = 0, ready = false): void {
    if (!this.route) return;
    this.route.restart(stage);
    this.player.z = z;
    this.player.crash = 0;
    this.previous = { ...this.player };
    this.traffic.reset(this.track, z);
    this.run?.start(this.stageTime(stage), ready);
  }

  /** A new run from the start line: the car at rest on the first stage, the clock held until `run.go()` if `ready`. */
  restartRun(ready = false): void {
    if (!this.route) return;
    Object.assign(this.player, createPlayer());
    this.restartRoute(this.route.first, 0, ready);
  }

  /** Put the car in a given state, with nothing to interpolate from (replays start here). */
  reset(state: PlayerState): void {
    Object.assign(this.player, state);
    this.previous = { ...this.player };
  }

  step(input: InputState, dt: number): void {
    this.previous = { ...this.player };
    this.previousOdometer = this.odometer;
    this.previousScroll = this.scroll;

    // A fork is committed before the step that first drives past its commit point.
    const shift = this.route?.update(this.player) ?? 0;
    this.previous.x -= shift;
    if (shift) this.traffic.shift(shift);
    if (this.route?.swappedFrom != null) {
      this.traffic.swapRoads(this.route.swappedFrom);
      this.route.swappedFrom = null;
    }

    // Before the start the car waits; once the run has ended it is no longer the player's and brakes to a stop.
    const phase = this.run?.phase ?? "driving";
    const control = phase === "driving" ? input
      : phase === "ready" ? { steer: input.steer, throttle: 0, brake: 0, gearToggle: input.gearToggle }
      : { steer: input.steer, throttle: 0, brake: 0.7, gearToggle: false };
    const curve = roadUnder(this.track, this.player.z, this.player.x).curve;
    if (this.player.crash) stepCrash(this.player, this.track, dt);
    else stepPlayer(this.player, control, this.track, dt);
    this.throttle = control.throttle;
    if (this.route) {
      this.traffic.step(this.track, this.player.z, dt);
      this.lastHit = collide(this.player, this.track, this.traffic, this.random, dt);
      if (this.lastHit) this.emit(this.lastHit);
    }
    if (this.route && this.run) {
      const banner = this.run.banner;
      this.stepRun(this.route, this.run, dt);
      if (this.run.banner && this.run.banner !== banner) this.emit(this.run.banner);
    }
    this.odometer += this.player.speed * dt;
    // the horizon slides against the bend: heading change = curvature * distance
    this.scroll += curve * this.player.speed * dt * 0.9;
  }

  private emit(event: GameEvent): void {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push(event);
  }

  /** The checkpoints and the goal line the car has just passed, then the clock. */
  private stepRun(route: Route, run: Run, dt: number): void {
    const p = this.player;
    const placed = route.placed;
    while (run.stage < placed.length && p.z >= placed[run.stage].checkpoint) run.enter(this.stageTime(placed[run.stage].id));
    const current = placed[Math.min(run.stage, placed.length) - 1];
    if (current.goal !== undefined && p.z >= current.goal) run.finish();
    run.step(dt, p.speed);
  }

  renderState(alpha: number): RenderState {
    const a = this.previous;
    const b = this.player;
    // z wraps at the end of a lap; interpolate across the seam
    let dz = b.z - a.z;
    if (dz < -this.track.length / 2) dz += this.track.length;
    const lerp = (p: number, q: number): number => p + (q - p) * alpha;
    return {
      z: wrapDistance(this.track, a.z + dz * alpha),
      x: lerp(a.x, b.x),
      speed: lerp(a.speed, b.speed),
      steer: lerp(a.steer, b.steer),
      gear: b.gear,
      offroad: b.offroad,
      throttle: this.throttle,
      skid: lerp(a.skid, b.skid),
      crash: b.crash,
      crashTime: b.crash === a.crash ? lerp(a.crashTime, b.crashTime) : b.crashTime,
      crashDir: b.crashDir,
      ghost: b.ghost,
      vehicles: this.traffic.vehicles.map((v) => {
        const p = this.traffic.previous.get(v.id);
        return { id: v.id, kind: v.kind, road: v.road, z: p ? lerp(p.z, v.z) : v.z, x: p ? lerp(p.x, v.x) : v.x };
      }),
      lapTime: b.lapTime < a.lapTime ? b.lapTime : lerp(a.lapTime, b.lapTime),
      run: this.run && {
        phase: this.run.phase, timeLeft: this.run.timeLeft, score: this.run.score, stage: this.run.stage,
        banner: this.run.banner, bannerTime: this.run.bannerTime, bonus: this.run.bonus,
      },
      odometer: lerp(this.previousOdometer, this.odometer),
      backgroundScroll: lerp(this.previousScroll, this.scroll),
    };
  }

  roadHeight(z: number): number {
    return heightAt(this.track, wrapDistance(this.track, z));
  }
}
