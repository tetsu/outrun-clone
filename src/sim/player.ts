import type { InputState } from "../core/input";
import { heightAt, segmentAt, wrapDistance, type Track } from "./track";

/** All speeds in metres per second, distances in metres. */
export const MAX_SPEED = 293 / 3.6;
const LOW_GEAR_MAX = 165 / 3.6;
const OFFROAD_MAX = 90 / 3.6;

const ACCEL_LOW = 11.0;
const ACCEL_HIGH = 6.5;
const BRAKE = 18.0;
const COAST = 2.5;
const OFFROAD_DRAG = 14.0;
const OVER_REV_DRAG = 9.0;

/** Sideways speed at full lock and top speed; the road is crossed in about a second. */
const STEER_SPEED = 12.5;
/** How hard a bend pushes the car outwards: sideways speed = curvature * speed^2 * this. */
const CENTRIFUGAL = 0.62;
/** How quickly the steering input reaches what the keys or stick ask for, per second. */
const STEER_RESPONSE = 5.5;
const STEER_RETURN = 8.0;

export interface PlayerState {
  /** Distance of the car's centre along the track. */
  z: number;
  /** Lateral position from the road centre; positive is right. */
  x: number;
  speed: number;
  /** Smoothed steering, -1..1. */
  steer: number;
  gear: 0 | 1;
  offroad: boolean;
  laps: number;
  lapTime: number;
}

export function createPlayer(): PlayerState {
  return { z: 0, x: 0, speed: 0, steer: 0, gear: 0, offroad: false, laps: 0, lapTime: 0 };
}

export function stepPlayer(p: PlayerState, input: InputState, track: Track, dt: number): void {
  if (input.gearToggle) p.gear = p.gear === 0 ? 1 : 0;

  // steering eases towards the input, and recentres faster than it turns in
  const rate = input.steer === 0 || Math.sign(input.steer) !== Math.sign(p.steer) ? STEER_RETURN : STEER_RESPONSE;
  const delta = input.steer - p.steer;
  p.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);

  // longitudinal
  const gearMax = p.gear === 0 ? LOW_GEAR_MAX : MAX_SPEED;
  const accel = p.gear === 0 ? ACCEL_LOW : ACCEL_HIGH;
  if (input.brake > 0) {
    p.speed -= BRAKE * input.brake * dt;
  } else if (input.throttle > 0 && p.speed < gearMax) {
    // pull fades towards the top of each gear
    const fade = 1 - 0.75 * Math.pow(p.speed / gearMax, 2);
    p.speed = Math.min(gearMax, p.speed + accel * fade * input.throttle * dt);
  } else {
    p.speed -= COAST * dt;
  }
  if (p.speed > gearMax) p.speed = Math.max(gearMax, p.speed - OVER_REV_DRAG * dt);

  // hills: gravity along the slope
  const slope = (heightAt(track, p.z + 1) - heightAt(track, p.z)) / 1;
  p.speed -= 9.8 * slope * 0.35 * dt;

  p.offroad = Math.abs(p.x) > track.halfWidth + 0.6;
  if (p.offroad && p.speed > OFFROAD_MAX) p.speed -= OFFROAD_DRAG * dt;
  p.speed = Math.max(0, Math.min(MAX_SPEED, p.speed));

  // lateral: steering against the push of the bend
  const speedRatio = p.speed / MAX_SPEED;
  const grip = p.offroad ? 0.6 : 1;
  const curve = segmentAt(track, p.z).curve;
  p.x += p.steer * STEER_SPEED * Math.min(1, speedRatio * 1.6 + (p.speed > 0.5 ? 0.12 : 0)) * grip * dt;
  p.x -= curve * p.speed * p.speed * CENTRIFUGAL * dt;
  const limit = track.halfWidth * 2.2;
  p.x = Math.max(-limit, Math.min(limit, p.x));

  // progress
  const before = p.z;
  p.z = wrapDistance(track, p.z + p.speed * dt);
  p.lapTime += dt;
  if (p.z < before) {
    p.laps++;
    p.lapTime = 0;
  }
}
