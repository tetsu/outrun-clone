import { SEGMENT_LENGTH, type Segment, type Track } from "../sim/track";

/** Floats stored per screen row; two RGBA32F texels. */
export const ROW_FLOATS = 8;
// texel 0: centreX, halfWidth, distance along the track, valid
// texel 1: fog, distance covered by one pixel row, unused, unused

const NEAR = 0.6;

export interface ViewParams {
  width: number;
  height: number;
  focal: number;
  /** Camera position: distance along the track, lateral offset, absolute height. */
  z: number;
  x: number;
  y: number;
  drawDistance: number;
}

/** A segment's near edge on screen, kept for placing scenery. */
export interface ProjectedSegment {
  segment: Segment;
  /** Pixels per metre at the segment's near edge. */
  scale: number;
  /** Screen position of the road centre at the near edge. */
  x: number;
  y: number;
  /** Rows at or below this one are hidden by nearer road (a hill crest in front). */
  clipY: number;
  fog: number;
  /** Camera-space depth of the near edge, metres. */
  depth: number;
}

/**
 * Fills one entry per screen row with the road as seen from the camera: the classic
 * per-scanline road table. Rows are indexed top-down. Returns the visible segments,
 * nearest first.
 *
 * Segments are walked front to back. `clipY` is the highest row drawn so far; a segment
 * only fills rows above it, which is what hides road behind a crest.
 */
export function fillRoadTable(track: Track, view: ViewParams, rows: Float32Array): ProjectedSegment[] {
  const { width, height, focal } = view;
  rows.fill(0, 0, height * ROW_FLOATS);

  const segments = track.segments;
  const n = segments.length;
  const baseIndex = Math.floor(view.z / SEGMENT_LENGTH);
  const basePercent = view.z / SEGMENT_LENGTH - baseIndex;
  const count = Math.ceil(view.drawDistance / SEGMENT_LENGTH);
  const projected: ProjectedSegment[] = [];

  // Lateral drift of the road centre, accumulated from the camera outwards. A segment of
  // curvature k turns the heading by k*L, which moves the centre k*L*L further each segment.
  let offset = 0;
  let drift = -segments[((baseIndex % n) + n) % n].curve * SEGMENT_LENGTH * SEGMENT_LENGTH * basePercent;
  let clipY = height;

  for (let i = 0; i < count; i++) {
    const segment = segments[(((baseIndex + i) % n) + n) % n];
    let z1 = (i - basePercent) * SEGMENT_LENGTH;
    const z2 = z1 + SEGMENT_LENGTH;
    let x1 = offset;
    const x2 = offset + drift;
    let y1 = segment.y1;
    const y2 = segment.y2;
    offset += drift;
    drift += segment.curve * SEGMENT_LENGTH * SEGMENT_LENGTH;
    if (z2 <= NEAR) continue;
    if (z1 < NEAR) {
      const t = (NEAR - z1) / (z2 - z1);
      x1 += (x2 - x1) * t;
      y1 += (y2 - y1) * t;
      z1 = NEAR;
    }

    const s1 = focal / z1;
    const s2 = focal / z2;
    const sx1 = width / 2 + (x1 - view.x) * s1;
    const sx2 = width / 2 + (x2 - view.x) * s2;
    const sy1 = height / 2 - (y1 - view.y) * s1;
    const sy2 = height / 2 - (y2 - view.y) * s2;
    const fog1 = fogAt(z1, view.drawDistance);

    projected.push({ segment, scale: s1, x: sx1, y: sy1, clipY, fog: fog1, depth: z1 });

    // Fill the rows whose centres lie between the far edge and the near edge (or the clip line).
    const first = Math.max(0, Math.ceil(sy2 - 0.5));
    const last = Math.min(clipY, Math.ceil(Math.min(sy1, height) - 0.5)) - 1;
    if (sy2 >= sy1 || last < first) continue;

    const invZ1 = 1 / z1;
    const invZ2 = 1 / z2;
    const span = sy1 - sy2;
    const startDistance = view.z + z1;
    for (let row = last; row >= first; row--) {
      const t = (sy1 - (row + 0.5)) / span;
      // centre and width are linear on screen; depth is linear in 1/z
      const invZ = invZ1 + (invZ2 - invZ1) * t;
      const z = 1 / invZ;
      const o = row * ROW_FLOATS;
      rows[o] = sx1 + (sx2 - sx1) * t;
      rows[o + 1] = track.halfWidth * focal * invZ;
      rows[o + 2] = startDistance + (z - z1);
      rows[o + 3] = 1;
      rows[o + 4] = fogAt(z, view.drawDistance);
      rows[o + 5] = (Math.abs(invZ2 - invZ1) / span) * z * z;
    }
    clipY = Math.min(clipY, first);
  }
  return projected;
}

/** Haze towards the horizon: clear nearby, fully hazed at the draw distance. */
export function fogAt(z: number, drawDistance: number): number {
  const d = z / drawDistance;
  return 1 - Math.exp(-4.5 * d * d);
}
