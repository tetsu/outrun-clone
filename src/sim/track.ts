/** Length of one road segment in metres. Short enough that curves stay smooth at 4K. */
export const SEGMENT_LENGTH = 3;

/**
 * A looping course is padded to a whole number of this many metres, so the road stripes and
 * lane dashes meet without a jump at the seam for every stripe length that divides 18 m.
 */
export const LOOP_MULTIPLE = 36;

/** Changes to a stage applied when the course is built; the tuning panel sets them live. */
export interface CourseTuning {
  /** Roadside objects per metre, relative to the stage file: 2 places them twice as often. */
  sceneryDensity: number;
  /** Height of every hill, relative to the stage file. */
  hillScale: number;
}

export const DEFAULT_COURSE: Readonly<CourseTuning> = { sceneryDensity: 1, hillScale: 1 };
export const course: CourseTuning = { ...DEFAULT_COURSE };

export interface SceneryItem {
  kind: string;
  /** Lateral position in metres from the centre of its road; negative is left. */
  offset: number;
  /** Which road it stands beside where the road forks (default "a"). */
  road?: "a" | "b";
}

/**
 * One stretch of road. Where the road forks there are two roads, "a" and "b", side by side at
 * the same height, each with its own lateral position and bend; elsewhere "b" lies exactly on
 * "a" and is not drawn. Lateral positions are in the frame of the player's x.
 */
export interface Segment {
  index: number;
  /** Curvature of road a in 1/metres; positive bends to the right. */
  curve: number;
  /** Road height in metres at the segment's start and end. */
  y1: number;
  y2: number;
  /** Lateral centre of road a and road b at the segment's start and end, metres. */
  a1: number;
  a2: number;
  b1: number;
  b2: number;
  /** Curvature of road b. */
  curveB: number;
  /** How much of road b is drawn (0..1) at the segment's start and end. */
  fadeB1: number;
  fadeB2: number;
  /** The car may drive on road b (before the fork's commit point). */
  driveB: boolean;
  scenery: SceneryItem[];
}

export interface Track {
  name: string;
  segments: Segment[];
  length: number;
  /** Half the paved width in metres. */
  halfWidth: number;
  lanes: number;
  /** The course joins up with its start. A route of stages does not loop. */
  loop: boolean;
}

/** One stretch of road in a stage file. Lengths in metres. */
export interface SectionData {
  length: number;
  /** Curvature held through the middle of the section (1 / radius in metres). */
  curve?: number;
  /** Height gained (or lost) across the section, in metres. */
  hill?: number;
}

export interface SceneryRule {
  kind: string;
  from: number;
  to: number;
  every: number;
  offset: number;
  side: "left" | "right" | "both";
}

/** The end of a stage where the road splits in two, each branch leading to another stage. */
export interface ForkData {
  /** Stage files (without .json) the left and the right branch lead to. */
  left: string;
  right: string;
  /** How hard each branch bends away, 1/metres (default 0.0015); left bends left, right bends right. */
  leftCurve?: number;
  rightCurve?: number;
}

export interface StageData {
  name: string;
  halfWidth: number;
  lanes: number;
  /** Seconds on the clock for driving it: the starting time, or added at the checkpoint into it (see run.ts). */
  time?: number;
  /** Time of day it is lit by (a palette name, src/render/palette.ts; default midday). */
  light?: string;
  sections: SectionData[];
  scenery: SceneryRule[];
  /** The stage ends in a fork. */
  fork?: ForkData;
  /** The stage runs straight on into this stage (no fork). A stage with neither ends at the goal. */
  next?: string;
}

/**
 * The fork, in metres from its start. The two roads first overlap, which reads as the road
 * widening, then part; the car is committed to a branch once there is grass between them.
 * The roads bend apart, and the branch not taken fades out before the fork ends. From the
 * commit point the fork runs on for the draw distance, so the end of its data is never in view
 * before the next stage is attached.
 */
export const FORK = {
  length: 1548,
  /** The roads overlap fully at the start and touch edge to edge here. */
  touch: 180,
  /** The roads stop moving apart here, one road width of grass between them. Parting slowly
   *  keeps each road's sideways drift under about 3 m/s at top speed; the bends do the rest. */
  apart: 540,
  commit: 330,
  /** The bends ease in over this span, and ease out again over the end of the fork. They start
   *  at the commit point: up to there both roads must bend alike (see Route). */
  bendFrom: 330,
  bendTo: 480,
  bendOutFrom: 1330,
  /** Road b fades out over this span. */
  fadeFrom: 1100,
  fadeTo: 1400,
} as const;

export interface BuiltStage {
  segments: Segment[];
  /** Metres from the stage start to the fork's commit point, when it ends in a fork. */
  commit?: number;
  length: number;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const smooth = (from: number, to: number, v: number): number => easeInOut(Math.min(1, Math.max(0, (v - from) / (to - from))));

function straightSegment(index: number, curve: number, y1: number, y2: number, centre = 0): Segment {
  return {
    index, curve, y1, y2, a1: centre, a2: centre, b1: centre, b2: centre,
    curveB: curve, fadeB1: 0, fadeB2: 0, driveB: false, scenery: [],
  };
}

/**
 * The segments of one stage, from its sections and its fork if it has one, starting at height
 * `startY`, lateral position `centre` and segment number `firstIndex`.
 */
export function buildStage(stage: StageData, tuning: CourseTuning = DEFAULT_COURSE, startY = 0, centre = 0, firstIndex = 0): BuiltStage {
  const segments: Segment[] = [];
  let y = startY;
  const push = (curve: number, y1: number, y2: number): Segment => {
    const segment = straightSegment(firstIndex + segments.length, curve, y1, y2, centre);
    segments.push(segment);
    return segment;
  };

  for (const section of stage.sections) {
    const count = Math.max(1, Math.round(section.length / SEGMENT_LENGTH));
    const curve = section.curve ?? 0;
    const sectionY = y;
    const endY = y + (section.hill ?? 0) * tuning.hillScale;
    // Curvature eases in over the first quarter and out over the last, like a real road's transitions.
    const ease = Math.max(1, Math.floor(count / 4));
    for (let i = 0; i < count; i++) {
      const ramp = Math.min(1, (i + 1) / ease, (count - i) / ease);
      const y1 = y;
      y = sectionY + (endY - sectionY) * easeInOut((i + 1) / count);
      push(curve * easeInOut(ramp), y1, y);
    }
  }

  let commit: number | undefined;
  // the first segment of the fork; before it there is only one road
  const forkFrom = stage.fork ? segments.length : Infinity;
  if (stage.fork) {
    const forkStart = segments.length * SEGMENT_LENGTH;
    commit = forkStart + FORK.commit;
    const hw = stage.halfWidth;
    // half the distance between the two roads' centres
    const gap = (d: number): number => hw * smooth(0, FORK.touch, d) + hw * smooth(FORK.touch, FORK.apart, d);
    const bend = (d: number): number => smooth(FORK.bendFrom, FORK.bendTo, d) * (1 - smooth(FORK.bendOutFrom, FORK.length, d));
    const fade = (d: number): number => 1 - smooth(FORK.fadeFrom, FORK.fadeTo, d);
    const left = stage.fork.leftCurve ?? 0.0015;
    const right = stage.fork.rightCurve ?? 0.0015;
    const count = Math.round(FORK.length / SEGMENT_LENGTH);
    for (let i = 0; i < count; i++) {
      const d1 = i * SEGMENT_LENGTH;
      const d2 = d1 + SEGMENT_LENGTH;
      const segment = push(-left * bend(d1 + SEGMENT_LENGTH / 2), y, y);
      Object.assign(segment, {
        a1: centre - gap(d1), a2: centre - gap(d2), b1: centre + gap(d1), b2: centre + gap(d2),
        curveB: right * bend(d1 + SEGMENT_LENGTH / 2), fadeB1: fade(d1), fadeB2: fade(d2),
        driveB: forkStart + d1 < commit,
      });
    }
    // a sign in the gore, where the roads part
    const tip = segments[Math.round((forkStart + FORK.touch + 30) / SEGMENT_LENGTH)];
    if (tip) tip.scenery.push({ kind: "sign", offset: (tip.b1 - tip.a1) / 2, road: "a" });
  }

  for (const rule of stage.scenery) {
    const first = Math.floor(rule.from / SEGMENT_LENGTH);
    const last = Math.min(segments.length - 1, Math.floor(rule.to / SEGMENT_LENGTH));
    const step = Math.max(1, Math.round(rule.every / tuning.sceneryDensity / SEGMENT_LENGTH));
    for (let i = first; i <= last; i += step) {
      // In a fork, left-hand objects follow the left road (a) and right-hand ones the right road
      // (b). Elsewhere everything is on road a: road b is only placed right inside a fork, and
      // seen from within a fork it still carries that fork's bend beyond it.
      if (rule.side !== "right") segments[i].scenery.push({ kind: rule.kind, offset: -rule.offset, road: "a" });
      if (rule.side !== "left") segments[i].scenery.push({ kind: rule.kind, offset: rule.offset, road: i >= forkFrom ? "b" : "a" });
    }
  }
  return { segments, commit, length: segments.length * SEGMENT_LENGTH };
}

/** A looping course from one stage, for testing and tuning; its fork and next stage are left out. */
export function buildTrack(stage: StageData, tuning: CourseTuning = DEFAULT_COURSE): Track {
  const { segments } = buildStage({ ...stage, fork: undefined }, tuning);

  // The course loops: pad to a whole number of LOOP_MULTIPLE and bring the height back to zero
  // so neither the stripes nor the road surface jump at the seam.
  const multiple = LOOP_MULTIPLE / SEGMENT_LENGTH;
  const closing = multiple * 5 + ((multiple - (segments.length % multiple)) % multiple);
  let y = segments.length > 0 ? segments[segments.length - 1].y2 : 0;
  const startY = y;
  for (let i = 0; i < closing; i++) {
    const y1 = y;
    y = startY * (1 - easeInOut((i + 1) / closing));
    segments.push(straightSegment(segments.length, 0, y1, y));
  }

  return {
    name: stage.name,
    segments,
    length: segments.length * SEGMENT_LENGTH,
    halfWidth: stage.halfWidth,
    lanes: stage.lanes,
    loop: true,
  };
}

/** The segment at a distance along the track: wrapped on a loop, the first or last beyond the ends of a route. */
export function segmentAt(track: Track, z: number): Segment {
  const n = track.segments.length;
  const i = Math.floor(z / SEGMENT_LENGTH);
  return track.segments[track.loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))];
}

/** A road the car can be on, at one distance along the track. */
export interface RoadAt {
  centre: number;
  curve: number;
}

/** The road nearest to lateral position x that the car may drive on. */
export function roadUnder(track: Track, z: number, x: number): RoadAt {
  const segment = segmentAt(track, z);
  const t = Math.min(1, Math.max(0, z / SEGMENT_LENGTH - Math.floor(z / SEGMENT_LENGTH)));
  const a = segment.a1 + (segment.a2 - segment.a1) * t;
  if (segment.driveB) {
    const b = segment.b1 + (segment.b2 - segment.b1) * t;
    if (Math.abs(x - b) < Math.abs(x - a)) return { centre: b, curve: segment.curveB };
  }
  return { centre: a, curve: segment.curve };
}

/** Road height at a distance along the track. */
export function heightAt(track: Track, z: number): number {
  const segment = segmentAt(track, z);
  const t = (((z % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH) / SEGMENT_LENGTH;
  return segment.y1 + (segment.y2 - segment.y1) * t;
}

/** A distance along the track, wrapped onto a looping course; unchanged on a route. */
export function wrapDistance(track: Track, z: number): number {
  return track.loop ? ((z % track.length) + track.length) % track.length : z;
}
