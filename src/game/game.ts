import type { InputState } from "../core/input";
import { collide, stepCrash, type HitEvent } from "../sim/collision";
import { createPlayer, stepPlayer, type PlayerState } from "../sim/player";
import { Random } from "../sim/random";
import type { Route } from "../sim/route";
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
  skid: number;
  lapTime: number;
  crash: number;
  crashTime: number;
  crashDir: number;
  ghost: number;
  /** Traffic, interpolated like the car. */
  vehicles: { id: number; kind: string; road: "a" | "b"; z: number; x: number }[];
  /** Total distance driven, never wrapped; drives the background scroll and wheel effects. */
  odometer: number;
  /** Sideways scroll of the background, in screen heights. */
  backgroundScroll: number;
}

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
  /** Traffic runs on a route only; a looping test course is kept clear for tuning. */
  readonly traffic = new Traffic(1);
  /** Draws for collisions (which way a head-on hit spins). */
  readonly random = new Random(7);
  /** What the car hit in the last step, for sound and effects. */
  lastHit: HitEvent | null = null;

  constructor(course: Track | Route) {
    this.route = "placed" in course ? course : null;
    this.track = "placed" in course ? course.track : course;
    if (this.route) this.traffic.reset(this.track, 0);
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
  restartRoute(stage: string, z = 0): void {
    if (!this.route) return;
    this.route.restart(stage);
    this.player.z = z;
    this.player.crash = 0;
    this.previous = { ...this.player };
    this.traffic.reset(this.track, z);
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

    const curve = roadUnder(this.track, this.player.z, this.player.x).curve;
    if (this.player.crash) stepCrash(this.player, this.track, dt);
    else stepPlayer(this.player, input, this.track, dt);
    if (this.route) {
      this.traffic.step(this.track, this.player.z, dt);
      this.lastHit = collide(this.player, this.track, this.traffic, this.random, dt);
    }
    this.odometer += this.player.speed * dt;
    // the horizon slides against the bend: heading change = curvature * distance
    this.scroll += curve * this.player.speed * dt * 0.9;
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
      odometer: lerp(this.previousOdometer, this.odometer),
      backgroundScroll: lerp(this.previousScroll, this.scroll),
    };
  }

  roadHeight(z: number): number {
    return heightAt(this.track, wrapDistance(this.track, z));
  }
}
