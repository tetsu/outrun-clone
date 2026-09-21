import { SEGMENT_LENGTH, type Segment, type Track } from "../sim/track";
import type { CurveModel } from "../game/camera";

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
  /** Screen row of the horizon; the middle of the screen when the camera is level. */
  horizon?: number;
  /** How bends are drawn (default "projected"). */
  curveModel?: CurveModel;
  /** Arcade model: screen heights of sweep per (1/m of curvature x screen height²). */
  curveGain?: number;
  /** Camera height above the road, for the arcade model's flat reference (default 2). */
  eyeHeight?: number;
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
 *
 * Bends are drawn one of two ways:
 *  - "projected": the road is bent in the world and projected, so it is geometrically exact.
 *    Near the car the road looks straight and the bend swings out towards the horizon.
 *  - "arcade": the way the 1980s arcade hardware did it. The road is straight in the world,
 *    and a bend adds a sideways offset that accumulates row by row up the screen, so the
 *    road curves as a smooth arc from just in front of the car. Hills do not change the
 *    arc: it is accumulated over where each segment would be on flat ground.
 */
export function fillRoadTable(track: Track, view: ViewParams, rows: Float32Array): ProjectedSegment[] {
  const { width, height, focal } = view;
  const horizon = view.horizon ?? height / 2;
  const arcade = view.curveModel === "arcade";
  const gain = view.curveGain ?? 1000;
  const eye = view.eyeHeight ?? 2;
  rows.fill(0, 0, height * ROW_FLOATS);
  // Arcade model: screen heights above the bottom edge where depth z meets flat ground.
  const flatRise = (z: number): number => (z <= 0 ? 0 : Math.max(0, (height - horizon - (eye * focal) / z) / height));

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
  // arcade model: sideways offset in screen heights, and its slope per screen height
  let arcOffset = 0;
  let arcSlope = 0;
  let clipY = height;

  for (let i = 0; i < count; i++) {
    const segment = segments[(((baseIndex + i) % n) + n) % n];
    const z0 = (i - basePercent) * SEGMENT_LENGTH;
    let z1 = z0;
    const z2 = z1 + SEGMENT_LENGTH;
    let x1 = offset;
    let x2 = offset + drift;
    let y1 = segment.y1;
    const y2 = segment.y2;
    offset += drift;
    drift += segment.curve * SEGMENT_LENGTH * SEGMENT_LENGTH;

    // Arcade model: the offset within this segment, in screen heights, at depth z. It is exact
    // for every row, not interpolated between the segment's edges: near the car one segment can
    // cover a fifth of the screen, and straight chords there would put a kink in the arc.
    const k = segment.curve * gain;
    const r0 = flatRise(z0);
    const offset0 = arcOffset;
    const slope0 = arcSlope;
    const arcAt = (z: number): number => {
      const d = flatRise(z) - r0;
      return offset0 + slope0 * d + 0.5 * k * d * d;
    };
    let arc1 = 0;
    let arc2 = 0;
    if (arcade) {
      arc1 = arcAt(Math.max(z0, NEAR));
      arc2 = arcAt(z2);
      arcSlope += k * (flatRise(z2) - r0);
      arcOffset = arc2;
      x1 = x2 = 0;
    }

    if (z2 <= NEAR) continue;
    if (z1 < NEAR) {
      const t = (NEAR - z1) / (z2 - z1);
      x1 += (x2 - x1) * t;
      y1 += (y2 - y1) * t;
      z1 = NEAR;
    }

    const s1 = focal / z1;
    const s2 = focal / z2;
    const sx1 = width / 2 + (x1 - view.x) * s1 + arc1 * height;
    const sx2 = width / 2 + (x2 - view.x) * s2 + arc2 * height;
    const sy1 = horizon - (y1 - view.y) * s1;
    const sy2 = horizon - (y2 - view.y) * s2;
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
      rows[o] = arcade ? width / 2 - view.x * focal * invZ + arcAt(z) * height : sx1 + (sx2 - sx1) * t;
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
