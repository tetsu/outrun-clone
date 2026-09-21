/** Length of one road segment in metres. Short enough that curves stay smooth at 4K. */
export const SEGMENT_LENGTH = 3;

/** Stripe bands (grass, rumble strips) alternate every this many segments. */
export const BAND_SEGMENTS = 3;

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

export function buildTrack(stage: StageData): Track {
  const segments: Segment[] = [];
  let y = 0;

  for (const section of stage.sections) {
    const count = Math.max(1, Math.round(section.length / SEGMENT_LENGTH));
    const curve = section.curve ?? 0;
    const startY = y;
    const endY = y + (section.hill ?? 0);
    // Curvature eases in over the first quarter and out over the last, like a real road's transitions.
    const ease = Math.max(1, Math.floor(count / 4));
    for (let i = 0; i < count; i++) {
      const ramp = Math.min(1, (i + 1) / ease, (count - i) / ease);
      const y1 = y;
      y = startY + (endY - startY) * easeInOut((i + 1) / count);
      segments.push({ index: segments.length, curve: curve * easeInOut(ramp), y1, y2: y, scenery: [] });
    }
  }

  // The course loops: pad to a whole number of stripe pairs and bring the height back to zero
  // so neither the stripes nor the road surface jump at the seam.
  const pair = BAND_SEGMENTS * 2;
  const closing = pair * 10 + ((pair - (segments.length % pair)) % pair);
  const startY = y;
  for (let i = 0; i < closing; i++) {
    const y1 = y;
    y = startY * (1 - easeInOut((i + 1) / closing));
    segments.push({ index: segments.length, curve: 0, y1, y2: y, scenery: [] });
  }

  for (const rule of stage.scenery) {
    const first = Math.floor(rule.from / SEGMENT_LENGTH);
    const last = Math.min(segments.length - 1, Math.floor(rule.to / SEGMENT_LENGTH));
    const step = Math.max(1, Math.round(rule.every / SEGMENT_LENGTH));
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
