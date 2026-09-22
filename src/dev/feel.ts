import type { InputState } from "../core/input";
import { SIM_DT } from "../core/loop";
import { focalLength, view } from "../game/camera";
import { fillRoadTable, ROW_FLOATS } from "../render/roadTable";
import { placeCamera } from "../render/view";
import { bendPush, createPlayer, handling, LOW_GEAR_MAX, MAX_SPEED, steerAuthority, stepPlayer, type PlayerState } from "../sim/player";
import { buildTrack, course, type StageData, type Track } from "../sim/track";

/**
 * The feel report: every "sense of speed" and "handling" quality, measured as a number on the
 * deterministic simulation and the road table, and checked against a target range.
 *
 * This is the feedback half of the tuning loop: change a value (in the code or live in the
 * tuning panel), run the report (`npm run feel`, or the panel's button), compare, repeat.
 * tests/feel.test.ts fails when a target is missed, so a tuning change cannot silently undo one.
 *
 * The targets are our own design calls, not figures from the original. Each is to be replaced
 * by a measurement from a recording of the original once one is made (TODO: measurement sheet).
 */

export interface FeelTarget {
  id: string;
  group: "speed" | "handling";
  label: string;
  unit: string;
  min?: number;
  max?: number;
  why: string;
}

export interface FeelResult extends FeelTarget {
  value: number;
  pass: boolean;
}

/** The tightest bend in use on the courses, 1/m. */
export const TIGHT_CURVE = 0.0032;
const MEDIUM_CURVE = 0.002;
const GENTLE_CURVE = 0.0012;
const HALF_WIDTH = 6.5;
const LANES = 3;
/** The player car's size, metres, for how much of the screen it fills. */
const CAR_WIDTH = 1.85;
const CAR_HALF_LENGTH = 2.25;
/** Height of the top of the car as the camera sees it (windscreen frame, headrests, occupants' heads), metres. */
const CAR_TOP = 1.3;
const KMH = 3.6;
/** How far from the line a car may wander and still count as holding a bend, metres. */
const HOLD_TOLERANCE = 2;

export const FEEL_TARGETS: FeelTarget[] = [
  // sense of speed
  { id: "top_speed", group: "speed", label: "Top speed", unit: "km/h", min: 292.5, max: 293.5, why: "The original's figure." },
  { id: "objects_per_s", group: "speed", label: "Roadside objects passed per second at top speed", unit: "/s", min: 8, why: "Speed is felt through things rushing past." },
  { id: "stripe_hz", group: "speed", label: "Road stripe changes per second at top speed", unit: "Hz", min: 9, max: 16, why: "Fast enough to flicker by, slow enough not to strobe at 60 Hz." },
  { id: "ground_flow", group: "speed", label: "Road flow at the bottom of the screen at top speed", unit: "screens/s", min: 11, max: 18, why: "A lower camera makes the road rush past faster." },
  { id: "car_width", group: "speed", label: "Car width on a 16:9 screen", unit: "of width", min: 0.19, max: 0.27, why: "Plan: the car covers about a quarter of the screen." },
  { id: "curve_near", group: "speed", label: "Tightest bend: sweep a quarter of the way up the screen", unit: "screens", min: 0.02, why: "The road visibly curves right in front of the car." },
  { id: "curve_far", group: "speed", label: "Tightest bend: sweep near the horizon", unit: "screens", min: 0.2, max: 0.6, why: "A strong sweep that stays on the screen." },
  { id: "curve_ahead", group: "speed", label: "Tightest bend 150 m ahead: sideways shift of the road 300 m ahead", unit: "screens", min: 0.03, why: "A bend must show before the car is in it; otherwise the car is pushed off a road that looks straight." },
  { id: "horizon_clear", group: "speed", label: "Gap between the top of the car and the horizon", unit: "screens", min: 0.08, why: "The far road, where a coming bend first shows, must not be hidden behind the car." },
  { id: "crests_hidden", group: "speed", label: "Crests that hide the road ahead (test course)", unit: "crests", min: 3, why: "Blind crests: the road drops out of sight." },
  { id: "horizon_travel", group: "speed", label: "Horizon travel over a lap", unit: "screens", min: 0.06, why: "The horizon rises and falls clearly with the hills." },
  // handling
  { id: "lo_0_100", group: "handling", label: "0-100 km/h in LO", unit: "s", min: 3.0, max: 4.5, why: "LO launches hard." },
  { id: "hi_start_ratio", group: "handling", label: "0-100 km/h in HI, relative to LO", unit: "x", min: 1.8, why: "Starting in HI is sluggish, so LO matters." },
  { id: "best_0_290", group: "handling", label: "0-290 km/h, LO then HI", unit: "s", min: 11, max: 16, why: "Back to full speed after a crash takes a while, but not forever." },
  { id: "cross_road", group: "handling", label: "Kerb to kerb at full lock, top speed", unit: "s", min: 1.0, max: 1.6, why: "Quick enough to dodge, not twitchy." },
  { id: "lane_change", group: "handling", label: "One lane at full lock, top speed", unit: "s", min: 0.45, max: 0.8, why: "Overtaking is a flick of the wheel." },
  { id: "recentre", group: "handling", label: "Sideways motion stops after letting go of full lock", unit: "s", max: 0.25, why: "The car goes where it is pointed." },
  { id: "skid_onset", group: "handling", label: "Speed at which full lock starts a slide", unit: "km/h", min: 190, max: 235, why: "Slides belong to high speed." },
  { id: "gentle_lock", group: "handling", label: "Lock needed in a gentle bend at top speed", unit: "lock", min: 0.25, max: 0.55, why: "Gentle bends are flat-out and easy." },
  { id: "medium_lock", group: "handling", label: "Lock needed in a medium bend at top speed (99 = cannot hold)", unit: "lock", min: 0.6, max: 0.95, why: "Medium bends are flat-out but take commitment." },
  { id: "tight_limit", group: "handling", label: "Fastest speed that holds the line in the tightest bend", unit: "km/h", min: 210, max: 250, why: "The tightest bends are not flat-out." },
  { id: "low_gain", group: "handling", label: "Tight bend: time gained by dropping to LO instead of braking", unit: "s", min: 0.2, why: "Dropping to LO for a bend is the technique that pays." },
  { id: "flat_offroad", group: "handling", label: "Tight bend flat-out: time off the road", unit: "s", min: 1.0, why: "Not slowing for a tight bend costs you." },
  { id: "low_offroad", group: "handling", label: "Tight bend with LO: time off the road", unit: "s", max: 0.05, why: "The technique keeps the car on the road." },
  { id: "offroad_slow", group: "handling", label: "Off the road from top speed to 120 km/h", unit: "s", min: 1.5, max: 3.0, why: "Leaving the road is a clear, quick penalty." },
];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const idle: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false };

function flatTrack(sections: StageData["sections"]): Track {
  return buildTrack({ name: "feel", halfWidth: HALF_WIDTH, lanes: LANES, sections, scenery: [] });
}

/** Steering that holds a line: what the bend needs, plus a correction towards `targetX`. */
function holdLine(p: PlayerState, track: Track, targetX = 0): number {
  const curve = bendPush(track, p.z, p.x);
  const authority = Math.max(0.05, steerAuthority(p.speed)) * handling.steerSpeed;
  const feedForward = (curve * p.speed * p.speed * handling.centrifugal) / authority;
  return clamp(feedForward + 0.35 * (targetX - p.x) - 0.12 * p.vx, -1, 1);
}

/** Seconds from standstill to `kmh`, full throttle, shifting up at `shiftAt` km/h if given. */
function timeToSpeed(kmh: number, startGear: 0 | 1, shiftAt?: number): number {
  const track = flatTrack([{ length: 20000 }]);
  const p = createPlayer();
  p.gear = startGear;
  for (let i = 1; i <= 120 * 90; i++) {
    const gearToggle = shiftAt !== undefined && p.gear === 0 && p.speed * KMH >= shiftAt;
    stepPlayer(p, { ...idle, throttle: 1, gearToggle }, track, SIM_DT);
    if (p.speed * KMH >= kmh) return i * SIM_DT;
  }
  return Infinity;
}

/**
 * Runs `control` at a held speed for up to `seconds`; returns the time `done` first holds,
 * or Infinity. The speed is reset every step, to measure the steering alone.
 */
function atSpeed(
  track: Track, start: Partial<PlayerState>, seconds: number,
  control: (p: PlayerState, t: number) => Partial<InputState>,
  done: (p: PlayerState, t: number) => boolean,
): number {
  const p: PlayerState = { ...createPlayer(), gear: 1, ...start };
  const speed = p.speed;
  for (let i = 1; i <= Math.round(seconds / SIM_DT); i++) {
    const t = i * SIM_DT;
    stepPlayer(p, { ...idle, ...control(p, t) }, track, SIM_DT);
    p.speed = speed;
    if (done(p, t)) return t;
  }
  return Infinity;
}

/**
 * Holds the line through a long bend at a held speed: the average lock used, and whether the
 * car stays within HOLD_TOLERANCE of the line once settled (not merely on the tarmac: a car
 * drifting out slowly would survive a few seconds without holding anything).
 */
function holdBend(curve: number, speed: number): { lock: number; held: boolean } {
  const track = flatTrack([{ length: 4000, curve }]);
  let lock = 0;
  let samples = 0;
  let held = true;
  atSpeed(track, { z: 1500, speed }, 7, (p) => ({ steer: holdLine(p, track) }), (p, t) => {
    if (t > 2) {
      lock += Math.abs(p.steer);
      samples++;
      if (Math.abs(p.x) > HOLD_TOLERANCE) held = false;
    }
    return false;
  });
  return { lock: lock / samples, held };
}

function tightLimit(): number {
  let lo = 80 / KMH;
  let hi = MAX_SPEED;
  if (holdBend(TIGHT_CURVE, hi).held) return hi;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (holdBend(TIGHT_CURVE, mid).held) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A tight bend taken three ways, from top speed and reacting only once the bend pushes in
 * full (the late entry: a bend found beyond a blind crest): flat-out, braking down to
 * `hold`, or dropping to LO until `hold` and back to HI.
 */
function throughTightBend(policy: "flat" | "brake" | "low", hold: number): { time: number; offroad: number } {
  const bendStart = 500;
  const bendEnd = 1020;
  const finish = 1500;
  const track = flatTrack([{ length: bendStart }, { length: bendEnd - bendStart, curve: TIGHT_CURVE }, { length: 900 }]);
  // the section eases its curvature in over its first quarter (see buildTrack), and the push
  // builds pushDelay metres behind that
  const react = bendStart + (bendEnd - bendStart) / 4 + handling.pushDelay;
  const p: PlayerState = { ...createPlayer(), z: 150, speed: MAX_SPEED, gear: 1 };
  let downshifted = false;
  let time = 0;
  let offroad = 0;
  while (p.z < finish && time < 60) {
    const input: InputState = { steer: holdLine(p, track), throttle: 1, brake: 0, gearToggle: false };
    const inBend = p.z >= react && p.z < bendEnd;
    if (inBend && policy === "brake") {
      if (p.speed > hold) {
        input.throttle = 0;
        input.brake = 1;
      } else if (p.speed > hold - 1 / KMH) input.throttle = 0;
    }
    if (policy === "low") {
      if (inBend && !downshifted) {
        input.gearToggle = true;
        downshifted = true;
      } else if (p.gear === 0 && (p.speed <= hold || !inBend) && p.speed * KMH >= LOW_GEAR_MAX * KMH - 2) {
        input.gearToggle = true;
      }
      if (inBend && p.gear === 1 && downshifted && p.speed > hold - 1 / KMH) input.throttle = 0;
    }
    stepPlayer(p, input, track, SIM_DT);
    time += SIM_DT;
    if (p.offroad) offroad += SIM_DT;
  }
  return { time, offroad };
}

/** Seconds from top speed to 120 km/h with the throttle held, off the road. */
function offroadSlowdown(): number {
  const track = flatTrack([{ length: 20000 }]);
  const p: PlayerState = { ...createPlayer(), z: 100, x: HALF_WIDTH + 2.5, speed: MAX_SPEED, gear: 1 };
  for (let i = 1; i <= 120 * 30; i++) {
    stepPlayer(p, { ...idle, throttle: 1 }, track, SIM_DT);
    if (p.speed * KMH <= 120) return i * SIM_DT;
  }
  return Infinity;
}

/** Road centre on a screen row, or NaN where the row shows no road. */
function centreAt(rows: Float32Array, row: number): number {
  return rows[row * ROW_FLOATS + 3] > 0.5 ? rows[row * ROW_FLOATS] : NaN;
}

/** How far the tightest bend sweeps the road sideways, in screen heights, near and far. */
function curveSweep(): { near: number; far: number; ahead: number } {
  const width = 1920;
  const height = 1080;
  const track = flatTrack([{ length: 4000, curve: TIGHT_CURVE }]);
  const rows = new Float32Array(height * ROW_FLOATS);
  const sweep = (z: number, row: (horizon: number) => number): number => {
    const camera = placeCamera(track, z, 0, width, height);
    fillRoadTable(track, camera, rows);
    return Math.abs(centreAt(rows, Math.round(row(camera.horizon!))) - centreAt(rows, height - 1)) / height;
  };
  const nearHorizon = (horizon: number): number => horizon + height * 0.04;
  // The bend starts at 1500 m and eases in over its first quarter (see buildStage).
  const straight = flatTrack([{ length: 1500 }, { length: 600, curve: TIGHT_CURVE }, { length: 2000 }]);
  const camera = placeCamera(straight, 1350, 0, width, height);
  fillRoadTable(straight, camera, rows);
  // the far end of the road: the row 300 m ahead of the camera (flat road)
  const far = camera.horizon! + (view.height * camera.focal) / 300;
  const ahead = Math.abs(centreAt(rows, Math.round(far)) - centreAt(rows, height - 1)) / height;
  return { near: sweep(2000, () => height * 0.75), far: sweep(2000, nearHorizon), ahead };
}

/**
 * Drives a lap of the stage at top speed along the centre line, sampling the view 30 times a
 * second: how many times a crest hides the road within 120 m, and how far the horizon travels.
 */
function lapView(track: Track): { crests: number; horizonTravel: number } {
  const width = 1920;
  const height = 1080;
  const rows = new Float32Array(height * ROW_FLOATS);
  let crests = 0;
  let hidden = false;
  let top = Infinity;
  let bottom = -Infinity;
  const step = MAX_SPEED / 30;
  for (let z = 0; z < track.length; z += step) {
    const camera = placeCamera(track, z, 0, width, height);
    top = Math.min(top, camera.horizon!);
    bottom = Math.max(bottom, camera.horizon!);
    const projected = fillRoadTable(track, camera, rows);
    let sight = Infinity;
    for (const p of projected) {
      if (p.depth > view.distance + 10 && p.y > p.clipY + 0.5) {
        sight = p.depth - view.distance;
        break;
      }
    }
    if (!hidden && sight < 120) {
      hidden = true;
      crests++;
    } else if (hidden && sight > 200) hidden = false;
  }
  return { crests, horizonTravel: (bottom - top) / height };
}

/** Measures everything in FEEL_TARGETS for the given stage, with the current tuning. */
export function measureFeel(stage: StageData): FeelResult[] {
  const values: Record<string, number> = {};
  const track = buildTrack(stage, course);
  const lane = (2 * HALF_WIDTH) / LANES;

  // sense of speed
  values.top_speed = MAX_SPEED * KMH;
  const nearby = track.segments.reduce((n, s) => n + s.scenery.filter((item) => Math.abs(item.offset) <= 20).length, 0);
  values.objects_per_s = nearby / (track.length / MAX_SPEED);
  values.stripe_hz = MAX_SPEED / view.stripeLength;
  values.ground_flow = (MAX_SPEED * Math.tan((view.vfovDeg * Math.PI) / 360)) / (2 * view.height);
  values.car_width = ((CAR_WIDTH * focalLength(1080)) / (view.distance - CAR_HALF_LENGTH)) / 1920;
  const sweep = curveSweep();
  values.curve_near = sweep.near;
  values.curve_far = sweep.far;
  values.curve_ahead = sweep.ahead;
  values.horizon_clear = ((view.height - CAR_TOP) * focalLength(1080)) / view.distance / 1080;
  const lap = lapView(track);
  values.crests_hidden = lap.crests;
  values.horizon_travel = lap.horizonTravel;

  // handling
  values.lo_0_100 = timeToSpeed(100, 0);
  values.hi_start_ratio = timeToSpeed(100, 1) / values.lo_0_100;
  values.best_0_290 = timeToSpeed(290, 0, LOW_GEAR_MAX * KMH - 2);
  const straight = flatTrack([{ length: 20000 }]);
  values.cross_road = atSpeed(straight, { z: 100, x: -HALF_WIDTH, speed: MAX_SPEED }, 5, () => ({ steer: 1 }), (p) => p.x >= HALF_WIDTH);
  values.lane_change = atSpeed(straight, { z: 100, x: -lane / 2, speed: MAX_SPEED }, 5, () => ({ steer: 1 }), (p) => p.x >= lane / 2);
  const release = 0.6;
  values.recentre = atSpeed(straight, { z: 100, x: -HALF_WIDTH, speed: MAX_SPEED }, 5,
    (_, t) => ({ steer: t < release ? 1 : 0 }), (p, t) => t > release && Math.abs(p.vx) < 1) - release;
  let lo = 60 / KMH;
  let hi = MAX_SPEED;
  const slides = (speed: number): boolean => {
    let skid = 0;
    atSpeed(straight, { z: 100, speed }, 1.5, () => ({ steer: 1 }), (p) => ((skid = p.skid), false));
    return skid > 0.05;
  };
  if (!slides(hi)) values.skid_onset = Infinity;
  else {
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (slides(mid)) hi = mid;
      else lo = mid;
    }
    values.skid_onset = hi * KMH;
  }
  values.gentle_lock = holdBend(GENTLE_CURVE, MAX_SPEED).lock;
  const medium = holdBend(MEDIUM_CURVE, MAX_SPEED);
  values.medium_lock = medium.held ? medium.lock : 99;
  const limit = tightLimit();
  values.tight_limit = limit * KMH;
  const hold = Math.max(40 / KMH, limit - 8 / KMH);
  const flat = throughTightBend("flat", hold);
  const braked = throughTightBend("brake", hold);
  const low = throughTightBend("low", hold);
  values.low_gain = braked.time - low.time;
  values.flat_offroad = flat.offroad;
  values.low_offroad = low.offroad;
  values.offroad_slow = offroadSlowdown();

  return FEEL_TARGETS.map((target) => {
    const value = values[target.id];
    const pass = Number.isFinite(value) && (target.min === undefined || value >= target.min) && (target.max === undefined || value <= target.max);
    return { ...target, value, pass };
  });
}

export function rangeText(t: FeelTarget): string {
  if (t.min !== undefined && t.max !== undefined) return `${t.min}–${t.max}`;
  if (t.min !== undefined) return `≥ ${t.min}`;
  return `≤ ${t.max}`;
}

/** The report as a plain-text table. */
export function formatFeel(results: FeelResult[]): string {
  const lines = results.map((r) => {
    const value = Number.isFinite(r.value) ? r.value.toFixed(r.value >= 100 ? 0 : 2) : "never";
    return `${r.pass ? "PASS" : "FAIL"}  ${r.group.padEnd(8)} ${r.id.padEnd(15)} ${value.padStart(7)} ${r.unit.padEnd(9)} target ${rangeText(r).padEnd(11)} ${r.label}`;
  });
  const passed = results.filter((r) => r.pass).length;
  return `${lines.join("\n")}\n${passed}/${results.length} targets met`;
}

