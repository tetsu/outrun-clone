import { describe, expect, it } from "vitest";
import { SIM_DT } from "../src/core/loop";
import type { InputState } from "../src/core/input";
import tree from "../src/data/stages.json";
import { Game } from "../src/game/game";
import { Route, type Stages } from "../src/sim/route";
import { autopilot } from "../src/sim/autopilot";
import type { StageData } from "../src/sim/track";

const files = import.meta.glob<StageData>("../src/data/stages/*.json", { eager: true, import: "default" });
const STAGES: Stages = Object.fromEntries(Object.entries(files).map(([path, data]) => [path.replace(/^.*\/|\.json$/g, ""), data]));
const FIRST = tree.tiers[0][0];

const idle: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false };

/** Drives with the autopilot (traffic cleared: this is about the road and the clock) until `until`; returns the seconds taken. */
function drive(game: Game, side: -1 | 1, until: () => boolean, limit = 400): number {
  let seconds = 0;
  while (!until() && seconds < limit) {
    game.step(autopilot(game, side), SIM_DT);
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

    // all the way down the left-hand route to its goal
    drive(game, -1, () => run.phase !== "driving");
    expect(run.phase).toBe("goal");
    expect(run.stage).toBe(tree.tiers.length);
    const last = game.route!.placed[game.route!.placed.length - 1];
    expect(last.id).toBe(tree.tiers[tree.tiers.length - 1][0]);
    expect(game.player.z).toBeGreaterThanOrEqual(last.goal!);
    expect(run.bonus).toBeGreaterThan(0);
    expect(run.banner).toBe("goal");
    const score = run.score;

    // after the goal the car brakes to a stop, and a while later the run is finished
    while (game.player.speed > 0) game.step(idle, SIM_DT);
    expect(run.score).toBe(score);
    expect(run.finished).toBe(false);
    for (let t = 0; t < 3.5; t += SIM_DT) game.step(idle, SIM_DT);
    expect(run.finished).toBe(true);

    // a new run held at the start line does not move or count until go
    game.restartRun(true);
    expect(run.stage).toBe(1);
    game.step({ ...idle, throttle: 1 }, 1);
    expect(game.player.z).toBe(0);
    expect(run.timeLeft).toBe(stage1.time);
    run.go();
    game.step({ ...idle, throttle: 1 }, 1);
    expect(game.player.z).toBeGreaterThan(0);
    expect(run.timeLeft).toBeCloseTo(stage1.time! - 1, 6);
  });

  it("is over when the time runs out: the car brakes to a stop", () => {
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
    expect(run.finished).toBe(true);
  });

  it("gives a clean drive time to spare on every stage, but not much", () => {
    // Real runs have traffic in the way, so a clean scripted drive should reach each checkpoint
    // and goal with a margin; too large a margin and the clock is no pressure at all. The
    // right-hand routes are meant to be harder, so their margins are the smaller ones.
    const lines: string[] = [];
    const spare: Array<[number, string]> = [];
    for (const tier of tree.tiers) {
      for (const id of tier) {
        const game = new Game(new Route(STAGES, id));
        const run = game.run!;
        run.timeLeft = 1000; // the drive is timed, not the clock
        const seconds = drive(game, -1, () => run.stage === 2 || run.phase !== "driving");
        expect(run.phase === "goal" || run.stage === 2, id).toBe(true);
        const margin = STAGES[id].time! - seconds;
        lines.push(`${id.padEnd(10)} ${seconds.toFixed(1).padStart(5)} s of ${STAGES[id].time}: ${margin.toFixed(1)} s spare`);
        spare.push([margin, id]);
      }
    }
    console.info(lines.join("\n"));
    for (const [seconds, where] of spare) {
      expect(seconds, where).toBeGreaterThan(6);
      expect(seconds, where).toBeLessThan(20);
    }
  });
});
