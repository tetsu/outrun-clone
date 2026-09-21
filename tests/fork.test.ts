import { describe, expect, it } from "vitest";
import { SIM_DT } from "../src/core/loop";
import { Game } from "../src/game/game";
import { fillRoadTable, ROW_FLOATS } from "../src/render/roadTable";
import { Route, type Stages } from "../src/sim/route";
import { FORK, roadUnder, type StageData } from "../src/sim/track";

const HALF_WIDTH = 6.5;
const stage = (name: string, extra: Partial<StageData>): StageData => ({
  name, halfWidth: HALF_WIDTH, lanes: 3, sections: [{ length: 600 }], scenery: [], ...extra,
});
const STAGES: Stages = {
  start: stage("start", { fork: { left: "coast", right: "inland" } }),
  coast: stage("coast", { sections: [{ length: 900, curve: 0.002 }], next: "start" }),
  inland: stage("inland", { sections: [{ length: 900, hill: 20 }], next: "start" }),
};
const FORK_START = 600;

/** Drives through the fork keeping to one side, steering to the centre of the road under the car. */
function driveFork(side: -1 | 1): { game: Game; offroad: number } {
  const game = new Game(new Route(STAGES, "start"));
  const p = game.player;
  p.speed = 55;
  p.gear = 1;
  let offroad = 0;
  while (p.z < FORK_START + FORK.length + 400) {
    const road = roadUnder(game.track, p.z + 20, p.x);
    // before the roads part, aim for the chosen side of the widening road
    const aim = p.z < FORK_START + FORK.touch ? road.centre + side * 4 : road.centre;
    const steer = Math.max(-1, Math.min(1, (aim - p.x) * 0.3 - p.vx * 0.15));
    game.step({ steer, throttle: 0.6, brake: 0, gearToggle: false }, SIM_DT);
    game.traffic.vehicles.length = 0; // the road to itself: this is about the fork
    if (p.offroad) offroad++;
  }
  return { game, offroad };
}

describe("fork", () => {
  it("commits to the branch the car is on and attaches its stage", () => {
    for (const [side, next] of [[-1, "coast"], [1, "inland"]] as const) {
      const { game, offroad } = driveFork(side);
      const placed = game.route!.placed;
      expect(placed[0].branch).toBe(side < 0 ? "left" : "right");
      expect(placed[1].id).toBe(next);
      expect(offroad).toBe(0);
    }
  });

  it("draws one road before the fork, one wide road while they overlap, two apart after", () => {
    const route = new Route(STAGES, "start");
    const width = 1280;
    const height = 720;
    const rows = new Float32Array(height * ROW_FLOATS);
    const view = (z: number) => ({
      width, height, focal: height / 2 / Math.tan(Math.PI / 6), z, x: 0, y: 1.6, drawDistance: 1200,
      curveModel: "arcade" as const, curveGain: 1400, eyeHeight: 1.6,
    });
    const row = height - 40;   // just in front of the car
    const bOffset = (z: number): number => {
      fillRoadTable(route.track, view(z), rows);
      return rows[row * ROW_FLOATS + 6];
    };
    const halfWidthPx = (): number => rows[row * ROW_FLOATS + 1];

    expect(bOffset(FORK_START - 200)).toBeCloseTo(0, 3);
    const touching = bOffset(FORK_START + FORK.touch - 8);
    expect(touching).toBeGreaterThan(1.8 * halfWidthPx());
    expect(touching).toBeLessThan(2.2 * halfWidthPx());
    expect(bOffset(FORK_START + FORK.apart)).toBeGreaterThan(3.5 * halfWidthPx());
  });

  it("re-centres the frame on the new stage without moving the car against the road", () => {
    const { game } = driveFork(1);
    const p = game.player;
    const road = roadUnder(game.track, p.z, p.x);
    expect(Math.abs(road.centre)).toBeLessThan(1e-9);
    expect(Math.abs(p.x - road.centre)).toBeLessThan(HALF_WIDTH);
  });
});
