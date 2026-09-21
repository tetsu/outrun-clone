import type { PlayerState } from "./player";
import { Random } from "./random";
import { roadCentre, VEHICLES, type Traffic } from "./traffic";
import { roadUnder, SEGMENT_LENGTH, segmentAt, wrapDistance, type Track } from "./track";

/** The player's car, metres. */
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 1.9;

/** Width of the solid part of each roadside object (a trunk, a pole), metres; the rest is overhead. */
export const SOLID_WIDTH: Record<string, number> = { pine: 0.8, palm: 0.6, sign: 0.4, post: 0.25 };
/** Light objects that are knocked aside rather than stopping the car. */
const FLIMSY = new Set(["post"]);
/** Share of the speed lost knocking one aside. */
const KNOCK_LOSS = 0.1;

/** Crash kinds in PlayerState.crash. */
export const CRASH_NONE = 0;
export const CRASH_SPIN = 1;
export const CRASH_ROLL = 2;
export const CRASH_SECONDS = { [CRASH_SPIN]: 2.4, [CRASH_ROLL]: 3.8 } as const;
/** After a crash the car is put back on the road and cannot be hit for this long (it blinks). */
export const GHOST_SECONDS = 2.5;

/**
 * Closing speed (m/s) from which running into a vehicle is a crash rather than a bump, and from
 * which the crash is a roll-over. Scenery is harder: any hit above SCENERY_CRASH crashes, and a
 * fast one rolls the car.
 */
const HARD_HIT = 70 / 3.6;
const ROLL_HIT = 170 / 3.6;
const SCENERY_CRASH = 50 / 3.6;
const SCENERY_ROLL = 160 / 3.6;

export type HitEvent = "bump" | "scrape" | "knock" | "crash";

/**
 * Checks the car against traffic and roadside objects, and applies what happens: a nudge and
 * a loss of speed for a light bump, the start of a spin or a roll-over for a hard hit.
 * Returns what happened this step (for sound and effects), or null.
 */
export function collide(p: PlayerState, track: Track, traffic: Traffic, random: Random, dt: number): HitEvent | null {
  if (p.crash !== CRASH_NONE || p.ghost > 0) return null;
  let event: HitEvent | null = null;

  for (const v of traffic.vehicles) {
    const k = VEHICLES[v.kind];
    const dz = v.z - p.z;
    const dx = v.x - p.x;
    const reachZ = (CAR_LENGTH + k.length) / 2;
    const reachX = (CAR_WIDTH + k.width) / 2;
    if (Math.abs(dz) >= reachZ || Math.abs(dx) >= reachX) continue;
    const overlapZ = reachZ - Math.abs(dz);
    const overlapX = reachX - Math.abs(dx);

    if (overlapX < overlapZ * 0.5) {
      // Side by side: pushed apart, a little speed lost.
      p.x -= Math.sign(dx) * overlapX;
      p.vx = -Math.sign(dx) * 7;
      p.speed *= 0.94;
      event = "scrape";
      continue;
    }
    if (dz > 0) {
      // Into the back of it.
      const closing = p.speed - v.speed;
      if (closing > HARD_HIT) {
        startCrash(p, closing > ROLL_HIT ? CRASH_ROLL : CRASH_SPIN, dx, random);
        v.speed += closing * 0.25;
        return "crash";
      }
      p.z = v.z - reachZ - 0.05;
      p.speed = Math.max(0, v.speed - 4);
      p.vx = (dx > 0 ? -1 : 1) * 4;
      v.speed += Math.max(0, closing) * 0.3;
      event = "bump";
    } else {
      // Hit from behind by something faster: it slows to our speed.
      v.speed = Math.min(v.speed, p.speed);
      v.z = p.z - reachZ - 0.05;
      event = event ?? "bump";
    }
  }

  // Roadside objects stand off the road; only check when the car is off it.
  const road = roadUnder(track, p.z, p.x);
  if (Math.abs(p.x - road.centre) > track.halfWidth) {
    const first = Math.floor((p.z - CAR_LENGTH / 2) / SEGMENT_LENGTH);
    const last = Math.floor((p.z + CAR_LENGTH / 2) / SEGMENT_LENGTH);
    for (let i = first; i <= last; i++) {
      const segment = segmentAt(track, i * SEGMENT_LENGTH);
      const z = i * SEGMENT_LENGTH;
      for (const item of segment.scenery) {
        const solid = SOLID_WIDTH[item.kind];
        if (!solid) continue;
        const x = roadCentre(track, z, item.road ?? "a") + item.offset;
        if (Math.abs(x - p.x) >= (CAR_WIDTH + solid) / 2) continue;
        if (FLIMSY.has(item.kind)) {
          // The car is on it for (length / speed) seconds; spread a 10% loss over that time.
          p.speed *= 1 - ((KNOCK_LOSS * p.speed) / (CAR_LENGTH + solid)) * dt;
          event = event ?? "knock";
          continue;
        }
        if (p.speed > SCENERY_CRASH) {
          startCrash(p, p.speed > SCENERY_ROLL ? CRASH_ROLL : CRASH_SPIN, x - p.x, random);
          return "crash";
        }
        // Slow enough to just stop against it.
        p.speed = 0;
        p.z = z - CAR_LENGTH / 2 - 0.1;
        event = "bump";
      }
    }
  }
  return event;
}

function startCrash(p: PlayerState, kind: number, towards: number, random: Random): void {
  p.crash = kind;
  p.crashTime = 0;
  // Spin away from what was hit; a head-on hit spins either way.
  p.crashDir = Math.abs(towards) > 0.3 ? (towards > 0 ? -1 : 1) : random.next() < 0.5 ? -1 : 1;
  p.skid = 0;
}

/**
 * One step of a crash. The car slides on, slowing hard, and drifts the way it spun; a
 * roll-over also throws it up and over (the height and the roll are drawn from crashTime, see
 * the renderer). At the end the car is put back on the centre of the road at a standstill,
 * briefly unhittable.
 */
export function stepCrash(p: PlayerState, track: Track, dt: number): void {
  const seconds = CRASH_SECONDS[p.crash as 1 | 2];
  p.crashTime += dt;
  const drag = p.crash === CRASH_ROLL ? 22 : 16;
  p.speed = Math.max(0, p.speed - drag * dt);
  p.vx += (p.crashDir * 3 - p.vx) * Math.min(1, 2 * dt);
  p.vx *= p.speed > 0 ? 1 : 0.9;
  p.x += p.vx * dt * Math.min(1, p.speed / 20);
  p.z = wrapDistance(track, p.z + p.speed * dt);
  p.steer = 0;
  if (p.crashTime >= seconds) {
    const road = roadUnder(track, p.z, p.x);
    p.crash = CRASH_NONE;
    p.crashTime = 0;
    p.x = road.centre;
    p.vx = 0;
    p.speed = 0;
    p.gear = 0;
    p.offroad = false;
    p.ghost = GHOST_SECONDS;
  }
}
