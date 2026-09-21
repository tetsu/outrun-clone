import type { InputState } from "../core/input";
import { createPlayer, stepPlayer, type PlayerState } from "../sim/player";
import { heightAt, segmentAt, wrapDistance, type Track } from "../sim/track";

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

  constructor(public track: Track) {}

  /** Swap in a rebuilt course (the tuning panel does this), keeping the car where it is. */
  setTrack(track: Track): void {
    this.track = track;
    this.player.z = wrapDistance(track, this.player.z);
    this.previous = { ...this.player };
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

    const curve = segmentAt(this.track, this.player.z).curve;
    stepPlayer(this.player, input, this.track, dt);
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
      lapTime: b.lapTime < a.lapTime ? b.lapTime : lerp(a.lapTime, b.lapTime),
      odometer: lerp(this.previousOdometer, this.odometer),
      backgroundScroll: lerp(this.previousScroll, this.scroll),
    };
  }

  roadHeight(z: number): number {
    return heightAt(this.track, wrapDistance(this.track, z));
  }
}
