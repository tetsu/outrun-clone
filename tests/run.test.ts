import { describe, expect, it } from "vitest";
import { SIM_DT } from "../src/core/loop";
import type { InputState } from "../src/core/input";
import tree from "../src/data/stages.json";
import { Game } from "../src/game/game";
import { Route, type Stages } from "../src/sim/route";
import { FORK, roadUnder, type StageData } from "../src/sim/track";

const files = import.meta.glob<StageData>("../src/data/stages/*.json", { eager: true, import: "default" });
const STAGES: Stages = Object.fromEntries(Object.entries(files).map(([path, data]) => [path.replace(/^.*\/|\.json$/g, ""), data]));
const FIRST = tree.tiers[0][0];

const idle: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false };

/**
 * A competent, unhurried driver: full throttle, HI gear once LO runs out, steering for the
 * centre of the road 25 m ahead, keeping to one side through a fork's widening. Traffic is
 * cleared: this is about the road and the clock.
 */
function drive(game: Game, side: -1 | 1, until: () => boolean, limit = 400): number {
  const p = game.player;
  let seconds = 0;
  while (!until() && seconds < limit) {
    const placed = game.route!.placed;
    const first = placed[placed.length - 1];
    const forkStart = first.commit === undefined ? Infinity : first.commit - FORK.commit;
    const road = roadUnder(game.track, p.z + 25, p.x);
    const aim = p.z > forkStart && p.z < forkStart + FORK.touch + 60 ? road.centre + side * 4 : road.centre;
    const steer = Math.max(-1, Math.min(1, (aim - p.x) * 0.3 - p.vx * 0.15));
    const gearToggle = p.gear === 0 && p.speed > 160 / 3.6;
    game.step({ steer, throttle: 1, brake: 0, gearToggle }, SIM_DT);
    game.traffic.vehicles.length = 0;
    seconds += SIM_DT;
  }
  return seconds;
}

describe("run", () => {
  it("counts down, extends at the checkpoint and ends at the goal", () => {
    const game = new Game(new Route(STAGES, FIRST));
    const run = game.run!;
    const stage1 = STAGES[FIRST];
    expect(run.timeLeft).toBe(stage1.time);
    expect(run.stage).toBe(1);

    game.step(idle, 1);
    expect(run.timeLeft).toBeCloseTo(stage1.time! - 1, 6);

    const spent = drive(game, -1, () => run.stage === 2);
    expect(game.route!.placed[1].id).toBe(stage1.fork!.left);
    const branch = STAGES[stage1.fork!.left];
    expect(run.timeLeft).toBeCloseTo(stage1.time! - 1 - spent + branch.time!, 3);
    expect(run.banner).toBe("checkpoint");

    drive(game, -1, () => run.phase !== "driving");
    expect(run.phase).toBe("goal");
    expect(game.player.z).toBeGreaterThanOrEqual(game.route!.placed[1].goal!);
    expect(run.bonus).toBeGreaterThan(0);
    expect(run.banner).toBe("goal");
    const score = run.score;

    // after the goal the car brakes to a stop, and a while later the run starts over
    while (game.player.speed > 0) game.step(idle, SIM_DT);
    expect(run.score).toBe(score);
    for (let t = 0; t < 3.5; t += SIM_DT) game.step(idle, SIM_DT);
    expect(run.stage).toBe(1);
    expect(run.timeLeft).toBeGreaterThan(stage1.time! - 1);
    expect(game.player.z).toBeLessThan(10);
  });

  it("is over when the time runs out: the car brakes to a stop and the run starts over", () => {
    const game = new Game(new Route(STAGES, FIRST));
    const run = game.run!;
    run.timeLeft = 3;
    drive(game, -1, () => run.phase !== "driving");
    expect(run.phase).toBe("over");
    expect(run.banner).toBe("over");
    const z = game.player.z;
    const speed = game.player.speed;
    game.step({ ...idle, throttle: 1 }, 1);
    expect(game.player.speed).toBeLessThan(speed);
    while (game.player.speed > 0) game.step(idle, SIM_DT);
    expect(game.player.z - z).toBeLessThan(400);
    for (let t = 0; t < 3.5; t += SIM_DT) game.step(idle, SIM_DT);
    expect(run.phase).toBe("driving");
    expect(game.player.z).toBeLessThan(10);
  });

  it("gives a clean drive time to spare on every branch, but not much", () => {
    // Real runs have traffic in the way, so a clean scripted drive should reach each checkpoint
    // and the goal with a margin; too large a margin and the clock is no pressure at all.
    const stage1 = STAGES[FIRST];
    const spare: Array<[number, string]> = [];
    for (const side of [-1, 1] as const) {
      const game = new Game(new Route(STAGES, FIRST));
      const run = game.run!;
      const branch = side < 0 ? stage1.fork!.left : stage1.fork!.right;
      drive(game, side, () => run.stage === 2);
      const atCheckpoint = run.timeLeft - STAGES[branch].time!;
      drive(game, side, () => run.phase !== "driving");
      expect(run.phase, branch).toBe("goal");
      const atGoal = run.timeLeft;
      console.info(`${FIRST} -> ${branch}: ${atCheckpoint.toFixed(1)} s spare at the checkpoint, ${atGoal.toFixed(1)} s at the goal`);
      spare.push([atCheckpoint, `${FIRST} before ${branch}`], [atGoal, branch]);
    }
    for (const [seconds, where] of spare) {
      expect(seconds, where).toBeGreaterThan(8);
      expect(seconds, where).toBeLessThan(25);
    }
  });
});
