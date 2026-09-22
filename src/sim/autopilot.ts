import type { InputState } from "../core/input";
import type { Game } from "../game/game";
import { FORK, roadUnder } from "./track";

/**
 * A competent, unhurried driver for the attract mode and the pacing test: full throttle, HI
 * gear once LO runs out, steering for the centre of the road 25 m ahead, and keeping to `side`
 * (-1 left, 1 right) through a fork's widening so it takes that branch.
 */
export function autopilot(game: Game, side: -1 | 1): InputState {
  const p = game.player;
  const placed = game.route?.placed ?? [];
  const last = placed[placed.length - 1];
  const forkStart = last?.commit === undefined ? Infinity : last.commit - FORK.commit;
  const road = roadUnder(game.track, p.z + 25, p.x);
  const aim = p.z > forkStart && p.z < forkStart + FORK.touch + 60 ? road.centre + side * 4 : road.centre;
  const steer = Math.max(-1, Math.min(1, (aim - p.x) * 0.3 - p.vx * 0.15));
  const gearToggle = p.gear === 0 && p.speed > 160 / 3.6;
  return { steer, throttle: 1, brake: 0, gearToggle };
}
