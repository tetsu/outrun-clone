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
  /** Lateral position in metres from the road centre; negative is left. */
  offset: number;
}

export interface Segment {
  index: number;
  /** Curvature in 1/metres; positive bends to the right. */
  curve: number;
  /** Road height in metres at the segment's start and end. */
  y1: number;
  y2: number;
  scenery: SceneryItem[];
}

export interface Track {
  name: string;
  segments: Segment[];
  length: number;
  /** Half the paved width in metres. */
  halfWidth: number;
  lanes: number;
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

export interface StageData {
  name: string;
  halfWidth: number;
  lanes: number;
  sections: SectionData[];
  scenery: SceneryRule[];
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

export function buildTrack(stage: StageData, tuning: CourseTuning = DEFAULT_COURSE): Track {
  const segments: Segment[] = [];
  let y = 0;

  for (const section of stage.sections) {
    const count = Math.max(1, Math.round(section.length / SEGMENT_LENGTH));
    const curve = section.curve ?? 0;
    const startY = y;
    const endY = y + (section.hill ?? 0) * tuning.hillScale;
    // Curvature eases in over the first quarter and out over the last, like a real road's transitions.
    const ease = Math.max(1, Math.floor(count / 4));
    for (let i = 0; i < count; i++) {
      const ramp = Math.min(1, (i + 1) / ease, (count - i) / ease);
      const y1 = y;
      y = startY + (endY - startY) * easeInOut((i + 1) / count);
      segments.push({ index: segments.length, curve: curve * easeInOut(ramp), y1, y2: y, scenery: [] });
    }
  }

  // The course loops: pad to a whole number of LOOP_MULTIPLE and bring the height back to zero
  // so neither the stripes nor the road surface jump at the seam.
  const multiple = LOOP_MULTIPLE / SEGMENT_LENGTH;
  const closing = multiple * 5 + ((multiple - (segments.length % multiple)) % multiple);
  const startY = y;
  for (let i = 0; i < closing; i++) {
    const y1 = y;
    y = startY * (1 - easeInOut((i + 1) / closing));
    segments.push({ index: segments.length, curve: 0, y1, y2: y, scenery: [] });
  }

  for (const rule of stage.scenery) {
    const first = Math.floor(rule.from / SEGMENT_LENGTH);
    const last = Math.min(segments.length - 1, Math.floor(rule.to / SEGMENT_LENGTH));
    const step = Math.max(1, Math.round(rule.every / tuning.sceneryDensity / SEGMENT_LENGTH));
    for (let i = first; i <= last; i += step) {
      if (rule.side !== "right") segments[i].scenery.push({ kind: rule.kind, offset: -rule.offset });
      if (rule.side !== "left") segments[i].scenery.push({ kind: rule.kind, offset: rule.offset });
    }
  }

  return {
    name: stage.name,
    segments,
    length: segments.length * SEGMENT_LENGTH,
    halfWidth: stage.halfWidth,
    lanes: stage.lanes,
  };
}

export function segmentAt(track: Track, z: number): Segment {
  const n = track.segments.length;
  return track.segments[((Math.floor(z / SEGMENT_LENGTH) % n) + n) % n];
}

/** Road height at a distance along the track. */
export function heightAt(track: Track, z: number): number {
  const segment = segmentAt(track, z);
  const t = (((z % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH) / SEGMENT_LENGTH;
  return segment.y1 + (segment.y2 - segment.y1) * t;
}

export function wrapDistance(track: Track, z: number): number {
  return ((z % track.length) + track.length) % track.length;
}
