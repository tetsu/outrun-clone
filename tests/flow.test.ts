import { describe, expect, it } from "vitest";
import type { InputState } from "../src/core/input";
import { SIM_DT } from "../src/core/loop";
import type { SaveStorage } from "../src/core/storage";
import tree from "../src/data/stages.json";
import { Flow } from "../src/game/flow";
import { Game } from "../src/game/game";
import { insertScore, loadScores, rankOf, TABLE_SIZE } from "../src/game/scores";
import { Route, type Stages } from "../src/sim/route";
import type { StageData } from "../src/sim/track";

const files = import.meta.glob<StageData>("../src/data/stages/*.json", { eager: true, import: "default" });
const STAGES: Stages = Object.fromEntries(Object.entries(files).map(([path, data]) => [path.replace(/^.*\/|\.json$/g, ""), data]));

class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, unknown>();
  read<T>(key: string, fallback: T): T {
    return this.data.has(key) ? (this.data.get(key) as T) : fallback;
  }
  write<T>(key: string, value: T): void {
    this.data.set(key, value);
  }
}

const idle: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false };
const throttle: InputState = { ...idle, throttle: 1 };

function setup(): { game: Game; flow: Flow; storage: MemoryStorage; advance: (seconds: number, input?: InputState) => void } {
  const storage = new MemoryStorage();
  const game = new Game(new Route(STAGES, tree.tiers[0][0]));
  const flow = new Flow(game, storage);
  const advance = (seconds: number, input = idle): void => {
    for (let t = 0; t < seconds; t += SIM_DT) flow.step(input, SIM_DT);
  };
  return { game, flow, storage, advance };
}

describe("flow", () => {
  it("holds the car on the title, counts down from start, then drives", () => {
    const { game, flow, advance } = setup();
    expect(flow.screen).toBe("title");
    advance(2, throttle);
    expect(game.player.z).toBe(0);
    expect(game.run!.timeLeft).toBe(STAGES[tree.tiers[0][0]].time);

    flow.press("start");
    expect(flow.screen).toBe("musicSelect");
    flow.press("right");
    expect(flow.music).toBe(1);
    flow.press("start");
    expect(flow.screen).toBe("countdown");
    advance(2.5, throttle);
    expect(game.player.z).toBe(0);
    advance(1, throttle);
    expect(flow.screen).toBe("driving");
    expect(game.player.z).toBeGreaterThan(0);
    expect(game.run!.timeLeft).toBeLessThan(STAGES[tree.tiers[0][0]].time!);
  });

  it("runs a demo drive after the title has sat idle, and goes back to the title", () => {
    const { game, flow, advance } = setup();
    advance(13);
    expect(flow.screen).toBe("attract");
    advance(10);
    expect(game.player.z).toBeGreaterThan(100);
    flow.press("start");
    expect(flow.screen).toBe("musicSelect");
  });

  it("goes from game over to the title when the score does not rank", () => {
    const { game, flow, advance } = setup();
    flow.press("start");
    flow.press("start");
    advance(3.1);
    game.run!.timeLeft = 0.5;
    advance(1, throttle);
    expect(game.run!.phase).toBe("over");
    while (game.player.speed > 0) advance(SIM_DT);
    advance(3.5);
    expect(flow.screen).toBe("gameover");
    advance(4.5);
    expect(flow.screen).toBe("title");
  });

  it("shows the results after the goal, takes initials for a ranking score and saves the table", () => {
    const { game, flow, storage, advance } = setup();
    flow.press("start");
    flow.press("start");
    advance(3.1);
    // take every right branch down to a goal, then drop the car just before the line
    const route = game.route!;
    while (route.placed[route.placed.length - 1].goal === undefined) {
      route.update({ ...game.player, z: route.placed[route.placed.length - 1].commit! + 1, x: 4 });
    }
    game.player.z = route.placed[route.placed.length - 1].goal! - 30;
    game.player.speed = 40;
    advance(1);
    expect(game.run!.phase).toBe("goal");
    while (game.player.speed > 0) advance(SIM_DT);
    advance(3.5);
    expect(flow.screen).toBe("results");
    expect(flow.run.route).toBe("RRRR");
    expect(flow.run.goal).toBe(true);
    const score = flow.run.score;
    expect(score).toBeGreaterThan(0);

    flow.press("start");
    expect(flow.screen).toBe("nameEntry");
    expect(flow.rank).toBe(0);
    flow.press("right");
    flow.press("right");
    flow.press("throttle");
    flow.press("left");
    flow.press("throttle");
    flow.press("throttle");
    expect(flow.screen).toBe("title");
    expect(flow.scores[0]).toEqual({ initials: "C.A", score, route: "RRRR", goal: true });
    expect(flow.scores.length).toBe(TABLE_SIZE);
    expect(loadScores(storage)[0].initials).toBe("C.A");
  });

  it("ranks scores into a table of fixed size", () => {
    const scores = loadScores(new MemoryStorage());
    expect(rankOf(scores, 1)).toBe(-1);
    expect(rankOf(scores, scores[0].score + 1)).toBe(0);
    expect(insertScore(scores, { initials: "NEW", score: scores[4].score + 1, route: "L", goal: false })).toBe(4);
    expect(scores.length).toBe(TABLE_SIZE);
    expect(scores[4].initials).toBe("NEW");
  });
});
