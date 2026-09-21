import { describe, expect, it } from "vitest";
import { SIM_DT } from "../src/core/loop";
import { Game } from "../src/game/game";
import { CAR_LENGTH, CRASH_NONE, CRASH_ROLL, CRASH_SPIN } from "../src/sim/collision";
import { Route, type Stages } from "../src/sim/route";
import { VEHICLES, type Vehicle } from "../src/sim/traffic";
import type { StageData } from "../src/sim/track";

const stage = (extra: Partial<StageData> = {}): StageData => ({
  name: "flat", halfWidth: 6.5, lanes: 3, sections: [{ length: 6000 }], scenery: [], next: "flat", ...extra,
});
const STAGES: Stages = { flat: stage() };
const idle = { steer: 0, throttle: 0, brake: 0, gearToggle: false };
const full = { ...idle, throttle: 1 };

function run(game: Game, seconds: number, input = full): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) game.step(input, SIM_DT);
}

/** A game on a flat road with only the given vehicle on it (no others spawn nearby). */
function alone(vehicle: Partial<Vehicle>, stages = STAGES): Game {
  const game = new Game(new Route(stages, "flat"));
  const v: Vehicle = { id: 999, kind: "kei-truck", z: 100, x: 0, road: "a", lane: 0, speed: 20, cruise: 20, ...vehicle };
  game.traffic.vehicles = [v];
  return game;
}

describe("traffic", () => {
  it("is the same every time from the same seed", () => {
    const a = new Game(new Route(STAGES, "flat"));
    const b = new Game(new Route(STAGES, "flat"));
    run(a, 20);
    run(b, 20);
    expect(a.traffic.snapshot()).toEqual(b.traffic.snapshot());
    expect(a.traffic.vehicles.length).toBeGreaterThan(3);
  });

  it("keeps its lanes and never drives through a vehicle ahead", () => {
    const game = new Game(new Route(STAGES, "flat"));
    game.player.speed = 60;
    for (let step = 0; step < 60 / SIM_DT; step++) {
      game.step({ ...full, steer: 0 }, SIM_DT);
      game.player.x = 30; // off to the side, out of the way
      const vs = game.traffic.vehicles;
      for (const v of vs) {
        expect(Math.abs(v.x - v.lane)).toBeLessThan(1e-9);
        for (const w of vs) {
          if (w === v || Math.abs(w.x - v.x) > 1 || w.z <= v.z) continue;
          expect(w.z - v.z).toBeGreaterThan((VEHICLES[w.kind].length + VEHICLES[v.kind].length) / 2);
        }
      }
    }
  });
});

describe("collisions", () => {
  it("a slow run into the back of a vehicle is a bump: slowed behind it, no crash", () => {
    const game = alone({ z: 12, speed: 20, cruise: 20 });
    const p = game.player;
    p.speed = 30;
    p.gear = 1;
    let bumped = false;
    // coasting in at about 10 m/s faster than the truck
    for (let i = 0; i < 6 / SIM_DT; i++) {
      game.step(idle, SIM_DT);
      if (game.lastHit === "bump") bumped = true;
      expect(p.crash).toBe(CRASH_NONE);
    }
    expect(bumped).toBe(true);
    const v = game.traffic.vehicles.find((w) => w.id === 999)!;
    expect(v.z - p.z).toBeGreaterThanOrEqual((CAR_LENGTH + VEHICLES[v.kind].length) / 2 - 0.5);
  });

  it("a fast one spins the car, a very fast one rolls it; then it is back on the road", () => {
    for (const [speed, kind] of [[45, CRASH_SPIN], [75, CRASH_ROLL]] as const) {
      const game = alone({ z: 30, speed: 15, cruise: 15, lane: 2, x: 2 });
      const p = game.player;
      p.speed = speed;
      p.gear = 1;
      p.x = 2;
      let crashed = 0;
      for (let i = 0; i < 1 / SIM_DT && !crashed; i++) {
        game.step(full, SIM_DT);
        crashed = p.crash;
      }
      expect(crashed).toBe(kind);
      for (let i = 0; i < 5 / SIM_DT && p.crash !== CRASH_NONE; i++) game.step(full, SIM_DT);
      expect(p.crash).toBe(CRASH_NONE);
      expect(p.x).toBeCloseTo(0, 6);
      expect(p.ghost).toBeGreaterThan(0);
    }
  });

  it("running off the road into a tree at speed crashes; a post only slows the car", () => {
    const trees: Stages = { flat: stage({ scenery: [{ kind: "pine", from: 100, to: 100, every: 50, offset: 13, side: "right" }] }) };
    const game = alone({ z: 5000 }, trees);
    const p = game.player;
    p.x = 13;
    p.speed = 40;
    p.gear = 1;
    let crashed = false;
    for (let i = 0; i < 8 / SIM_DT && !crashed; i++) {
      game.step(full, SIM_DT);
      crashed = game.lastHit === "crash";
    }
    expect(crashed).toBe(true);

    const posts: Stages = { flat: stage({ scenery: [{ kind: "post", from: 100, to: 100, every: 50, offset: 8.2, side: "right" }] }) };
    const g2 = alone({ z: 5000 }, posts);
    g2.player.x = 8.2;
    g2.player.speed = 40;
    g2.player.gear = 1;
    let knocked = false;
    for (let i = 0; i < 8 / SIM_DT; i++) {
      const before = g2.player.speed;
      g2.step(idle, SIM_DT);
      if (g2.lastHit === "knock") {
        knocked = true;
        expect(g2.player.speed).toBeGreaterThan(before * 0.97);
      }
    }
    expect(knocked).toBe(true);
    expect(g2.player.crash).toBe(CRASH_NONE);
  });
});
