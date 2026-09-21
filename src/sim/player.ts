import type { InputState } from "../core/input";
import { heightAt, roadUnder, wrapDistance, type Track } from "./track";

/** All speeds in metres per second, distances in metres. */
export const MAX_SPEED = 293 / 3.6;
export const LOW_GEAR_MAX = 165 / 3.6;
const OFFROAD_MAX = 90 / 3.6;

/**
 * Handling constants. `handling` is live: the development tuning panel changes it while the
 * game runs, and the feel report (src/dev/feel.ts) measures the result against its targets.
 */
export interface HandlingTuning {
  /** LO gear pull at standstill, m/s². */
  accelLow: number;
  /** HI gear pull at standstill, m/s²; low, so starting in HI is sluggish. */
  accelHighStart: number;
  /** HI gear pull at its strongest, m/s². */
  accelHighPeak: number;
  /** Share of top speed where HI gear pulls hardest. */
  highPeakAt: number;
  /** How much of the pull is gone at the top of a gear (0..1), and how late it fades. */
  gearFade: number;
  gearFadePower: number;
  brake: number;
  coast: number;
  /** Slowing when above a gear's limit (LO at more than 165 km/h): engine braking, m/s². */
  overRevDrag: number;
  offroadDrag: number;
  /** Sideways speed at full lock and full authority, m/s. */
  steerSpeed: number;
  /** How quickly the steering reaches what the keys or stick ask for, per second. */
  steerResponse: number;
  steerReturn: number;
  /** How quickly the car's sideways speed follows the wheel, per second; weight in the steering. */
  lateralResponse: number;
  /** How hard a bend pushes the car outwards: sideways speed = curvature * speed² * this. */
  centrifugal: number;
  /** Tyre load (lock x speed²) above which the tyres start to slide. Above 1: never. */
  skidLoad: number;
  /** Share of steering grip lost at full slide. */
  skidGripLoss: number;
  /** Speed scrubbed off at full slide, m/s². */
  skidScrub: number;
  /** Share of steering grip lost when braking while turning hard: the tyres lock. */
  brakeGripLoss: number;
  offroadGrip: number;
}

export const DEFAULT_HANDLING: Readonly<HandlingTuning> = {
  accelLow: 9.5,
  accelHighStart: 3.0,
  accelHighPeak: 8.5,
  highPeakAt: 0.5,
  gearFade: 0.75,
  gearFadePower: 2,
  brake: 18.0,
  coast: 2.5,
  overRevDrag: 9.0,
  offroadDrag: 22.0,
  steerSpeed: 12.5,
  steerResponse: 5.5,
  steerReturn: 12.0,
  lateralResponse: 14,
  centrifugal: 0.833,
  skidLoad: 0.52,
  skidGripLoss: 0,
  skidScrub: 5.0,
  brakeGripLoss: 0.6,
  offroadGrip: 0.6,
};

export const handling: HandlingTuning = { ...DEFAULT_HANDLING };

export interface PlayerState {
  /** Distance of the car's centre along the track. */
  z: number;
  /** Lateral position, metres, positive is right: from the road centre, or in a fork from the centre line both roads part from. */
  x: number;
  /** Sideways speed, m/s; positive is right. */
  vx: number;
  speed: number;
  /** Smoothed steering, -1..1. */
  steer: number;
  gear: 0 | 1;
  offroad: boolean;
  /** How far the tyres are sliding, 0 (gripping) to 1. Drives the squeal and the sliding frames. */
  skid: number;
  laps: number;
  lapTime: number;
  /** Crash under way: 0 none, 1 spin, 2 roll-over (see collision.ts), with its time and direction (-1 or 1). */
  crash: number;
  crashTime: number;
  crashDir: number;
  /** Seconds left of being unhittable after a crash. */
  ghost: number;
}

export function createPlayer(): PlayerState {
  return {
    z: 0, x: 0, vx: 0, speed: 0, steer: 0, gear: 0, offroad: false, skid: 0, laps: 0, lapTime: 0,
    crash: 0, crashTime: 0, crashDir: 1, ghost: 0,
  };
}

/** Share of the full sideways speed the steering gives at this speed. Little when crawling. */
export function steerAuthority(speed: number): number {
  return Math.min(1, (speed / MAX_SPEED) * 1.6 + (speed > 0.5 ? 0.12 : 0));
}

/** Engine pull in a gear at a speed, m/s², before the throttle is applied. */
export function gearPull(gear: 0 | 1, speed: number, h: HandlingTuning = handling): number {
  const gearMax = gear === 0 ? LOW_GEAR_MAX : MAX_SPEED;
  const r = speed / gearMax;
  const base = gear === 0
    ? h.accelLow
    : h.accelHighStart + (h.accelHighPeak - h.accelHighStart) * Math.min(1, r / h.highPeakAt);
  // pull fades towards the top of each gear
  return base * (1 - h.gearFade * Math.pow(r, h.gearFadePower));
}

export function stepPlayer(p: PlayerState, input: InputState, track: Track, dt: number): void {
  const h = handling;
  p.ghost = Math.max(0, p.ghost - dt);
  if (input.gearToggle) p.gear = p.gear === 0 ? 1 : 0;

  // steering eases towards the input, and recentres faster than it turns in
  const rate = input.steer === 0 || Math.sign(input.steer) !== Math.sign(p.steer) ? h.steerReturn : h.steerResponse;
  const delta = input.steer - p.steer;
  p.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);

  // longitudinal
  const gearMax = p.gear === 0 ? LOW_GEAR_MAX : MAX_SPEED;
  if (input.brake > 0) {
    p.speed -= h.brake * input.brake * dt;
  } else if (input.throttle > 0 && p.speed <= gearMax) {
    // at the gear's limit the throttle holds the speed; it must not coast every other step
    p.speed = Math.min(gearMax, p.speed + gearPull(p.gear, p.speed) * input.throttle * dt);
  } else {
    p.speed -= h.coast * dt;
  }
  if (p.speed > gearMax) p.speed = Math.max(gearMax, p.speed - h.overRevDrag * dt);

  // hills: gravity along the slope
  const slope = (heightAt(track, p.z + 1) - heightAt(track, p.z)) / 1;
  p.speed -= 9.8 * slope * 0.35 * dt;

  const road = roadUnder(track, p.z, p.x);
  p.offroad = Math.abs(p.x - road.centre) > track.halfWidth + 0.6;
  if (p.offroad && p.speed > OFFROAD_MAX) p.speed -= h.offroadDrag * dt;

  // tyres: hard lock at speed makes them slide, and braking while turning hard locks them
  const speedRatio = Math.max(0, p.speed) / MAX_SPEED;
  const load = Math.abs(p.steer) * speedRatio * speedRatio;
  const locking = input.brake * Math.min(1, load / h.skidLoad);
  const slide = Math.max(locking, Math.min(1, (load - h.skidLoad) / Math.max(0.05, 1 - h.skidLoad)));
  p.skid += (slide - p.skid) * Math.min(1, (slide > p.skid ? 8 : 5) * dt);
  p.speed -= h.skidScrub * p.skid * dt;
  p.speed = Math.max(0, Math.min(MAX_SPEED, p.speed));

  // lateral: steering against the push of the bend
  const grip = (p.offroad ? h.offroadGrip : 1) * (1 - h.skidGripLoss * p.skid) * (1 - h.brakeGripLoss * locking);
  const target = p.steer * h.steerSpeed * steerAuthority(p.speed) * grip - road.curve * p.speed * p.speed * h.centrifugal;
  p.vx += (target - p.vx) * Math.min(1, h.lateralResponse * dt);
  p.x += p.vx * dt;
  const limit = track.halfWidth * 2.2;
  if (Math.abs(p.x - road.centre) > limit) {
    p.x = road.centre + Math.sign(p.x - road.centre) * limit;
    p.vx = 0;
  }

  // progress
  const before = p.z;
  p.z = wrapDistance(track, p.z + p.speed * dt);
  p.lapTime += dt;
  if (p.z < before) {
    p.laps++;
    p.lapTime = 0;
  }
}
