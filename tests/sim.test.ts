import { describe, expect, it } from "vitest";
import { SIM_DT } from "../src/core/loop";
import stageData from "../src/data/stages/test-course.json";
import { focalLength } from "../src/game/camera";
import { fillRoadTable, ROW_FLOATS } from "../src/render/roadTable";
import { createPlayer, MAX_SPEED, stepPlayer, type PlayerState } from "../src/sim/player";
import { ReplayPlayer, ReplayRecorder, type Replay } from "../src/sim/replay";
import { buildTrack, heightAt, LOOP_MULTIPLE, SEGMENT_LENGTH, type StageData } from "../src/sim/track";

const track = buildTrack(stageData as StageData);
const idle = { steer: 0, throttle: 0, brake: 0, gearToggle: false };

describe("track", () => {
  it("closes the loop: a whole number of stripe repeats, and level at the seam", () => {
    expect(track.length % LOOP_MULTIPLE).toBe(0);
    expect(track.segments[track.segments.length - 1].y2).toBeCloseTo(0, 6);
    expect(heightAt(track, 0)).toBe(0);
  });

  it("has continuous height between segments", () => {
    for (let i = 1; i < track.segments.length; i++) {
      expect(track.segments[i].y1).toBe(track.segments[i - 1].y2);
    }
  });
});

describe("player", () => {
  it("reaches the low-gear limit, then top speed in high gear", () => {
    const p = createPlayer();
    const flat = buildTrack({ name: "flat", halfWidth: 6.5, lanes: 3, sections: [{ length: 30000 }], scenery: [] });
    for (let i = 0; i < 120 * 20; i++) stepPlayer(p, { ...idle, throttle: 1 }, flat, SIM_DT);
    expect(p.speed * 3.6).toBeCloseTo(165, 0);
    stepPlayer(p, { ...idle, throttle: 1, gearToggle: true }, flat, SIM_DT);
    for (let i = 0; i < 120 * 40; i++) stepPlayer(p, { ...idle, throttle: 1 }, flat, SIM_DT);
    expect(p.speed).toBeCloseTo(MAX_SPEED, 3);
  });

  it("is deterministic", () => {
    const run = (): number => {
      const p = createPlayer();
      for (let i = 0; i < 5000; i++) {
        stepPlayer(p, { steer: Math.sin(i / 90), throttle: 1, brake: 0, gearToggle: i === 600 }, track, SIM_DT);
      }
      return p.z + p.x * 1000;
    };
    expect(run()).toBe(run());
  });

  it("is pushed outwards by a bend", () => {
    const bend = buildTrack({ name: "bend", halfWidth: 6.5, lanes: 3, sections: [{ length: 3000, curve: 0.003 }], scenery: [] });
    const p = createPlayer();
    p.speed = 60;
    p.z = 1500;
    for (let i = 0; i < 60; i++) stepPlayer(p, idle, bend, SIM_DT);
    expect(p.x).toBeLessThan(-1); // right-hand bend pushes the car left
  });
});

describe("road table", () => {
  const width = 1920;
  const height = 1080;
  const rows = new Float32Array(height * ROW_FLOATS);

  it("fills every row below the horizon on a flat straight, centred", () => {
    const flat = buildTrack({ name: "flat", halfWidth: 6.5, lanes: 3, sections: [{ length: 6000 }], scenery: [] });
    fillRoadTable(flat, { width, height, focal: focalLength(height), z: 100, x: 0, y: 2, drawDistance: 1200 }, rows);
    for (let row = height / 2 + 2; row < height; row++) {
      expect(rows[row * ROW_FLOATS + 3]).toBe(1);
      expect(rows[row * ROW_FLOATS]).toBeCloseTo(width / 2, 3);
    }
    // nothing above the horizon
    expect(rows[(height / 2 - 2) * ROW_FLOATS + 3]).toBe(0);
    // nearer rows are wider and closer
    const near = (height - 1) * ROW_FLOATS;
    const far = (height / 2 + 50) * ROW_FLOATS;
    expect(rows[near + 1]).toBeGreaterThan(rows[far + 1]);
    expect(rows[near + 2]).toBeLessThan(rows[far + 2]);
  });

  it("matches the projection: the bottom row is where the ground meets the view", () => {
    const flat = buildTrack({ name: "flat", halfWidth: 6.5, lanes: 3, sections: [{ length: 6000 }], scenery: [] });
    const focal = focalLength(height);
    fillRoadTable(flat, { width, height, focal, z: 0, x: 0, y: 2, drawDistance: 1200 }, rows);
    const row = height - 1;
    const depth = (2 * focal) / (row + 0.5 - height / 2);
    expect(rows[row * ROW_FLOATS + 2]).toBeCloseTo(depth, 2);
    expect(rows[row * ROW_FLOATS + 1]).toBeCloseTo((6.5 * focal) / depth, 1);
  });

  it("arcade curves: a straight road is drawn exactly as the projected model draws it", () => {
    const flat = buildTrack({ name: "flat", halfWidth: 6.5, lanes: 3, sections: [{ length: 6000 }], scenery: [] });
    const view = { width, height, focal: focalLength(height, 60), z: 100, x: 1.5, y: 2, drawDistance: 1200 };
    const projected = new Float32Array(height * ROW_FLOATS);
    fillRoadTable(flat, { ...view, curveModel: "projected" }, projected);
    fillRoadTable(flat, { ...view, curveModel: "arcade", curveGain: 1400, eyeHeight: 2 }, rows);
    expect(Array.from(rows)).toEqual(Array.from(projected));
  });

  it("arcade curves: a steady bend sweeps the road as a parabola up the screen", () => {
    const k = 0.003;
    const gain = 1400;
    const bend = buildTrack({ name: "bend", halfWidth: 6.5, lanes: 3, sections: [{ length: 6000, curve: k }], scenery: [] });
    const focal = focalLength(height, 60);
    fillRoadTable(bend, { width, height, focal, z: 3000, x: 0, y: 2, drawDistance: 1200, curveModel: "arcade", curveGain: gain, eyeHeight: 2 }, rows);
    const bottom = rows[(height - 1) * ROW_FLOATS];
    for (const rise of [0.1, 0.25, 0.4]) {
      const row = Math.round(height * (1 - rise)) - 1;
      // offset in screen heights = gain * k * rise² / 2, measured from where the road leaves the screen
      const expected = (0.5 * gain * k * rise * rise) * height;
      expect(rows[row * ROW_FLOATS] - bottom).toBeCloseTo(expected, -1);
    }
  });

  it("returns segments nearest first with a clip row that only moves up", () => {
    const projected = fillRoadTable(
      track,
      { width, height, focal: focalLength(height), z: 1300, x: 0, y: heightAt(track, 1300) + 2, drawDistance: 1200 },
      rows,
    );
    expect(projected.length).toBeGreaterThan(300);
    for (let i = 1; i < projected.length; i++) {
      expect(projected[i].depth).toBeGreaterThan(projected[i - 1].depth);
      expect(projected[i].clipY).toBeLessThanOrEqual(projected[i - 1].clipY);
    }
    expect(SEGMENT_LENGTH).toBeGreaterThan(0);
  });
});

describe("replay", () => {
  it("plays a drive back to exactly the same place", () => {
    const drive = (input: (i: number) => typeof idle, steps: number, recorder?: ReplayRecorder): PlayerState => {
      const p = createPlayer();
      for (let i = 0; i < steps; i++) {
        const state = input(i);
        recorder?.record(state);
        stepPlayer(p, state, track, SIM_DT);
      }
      return p;
    };
    const recorder = new ReplayRecorder(track.name, createPlayer());
    const live = drive((i) => ({ steer: Math.round(Math.sin(i / 70) * 4) / 4, throttle: i % 400 < 350 ? 1 : 0, brake: 0, gearToggle: i === 500 }), 3000, recorder);
    const replay = JSON.parse(JSON.stringify(recorder.finish())) as Replay;
    expect(replay.runs.length).toBeLessThan(200);

    const player = new ReplayPlayer(replay);
    const p = { ...replay.start };
    for (let input = player.next(); input; input = player.next()) stepPlayer(p, input, track, SIM_DT);
    expect(p).toEqual(live);
  });
});
