import { SEGMENT_LENGTH, type Segment, type Track } from "../sim/track";
import type { CurveModel } from "../game/camera";

/** Floats stored per screen row; two RGBA32F texels. */
export const ROW_FLOATS = 8;
// texel 0: centre of road a, halfWidth, distance along the track, valid
// texel 1: fog, distance covered by one pixel row, centre of road b minus centre of road a, how much of road b shows

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
  /**
   * Arcade model: how much of the true, projected bend is added to the sweep (default 0). The
   * sweep alone only shows a bend once the car is nearly in it: it grows with screen height
   * above the car, and a bend 100 m ahead is only the top few rows. The projected bend is
   * what shows a bend coming from far off.
   */
  curveLookahead?: number;
}

/** A segment's near edge on screen, kept for placing scenery. */
export interface ProjectedSegment {
  segment: Segment;
  /** Pixels per metre at the segment's near edge. */
  scale: number;
  /** Screen position of the centre of road a, and of road b where the road forks, at the near edge. */
  x: number;
  xB: number;
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
 *    arc: it is accumulated over where each segment would be on flat ground. On its own this
 *    shows a bend only once the car is almost in it, so `curveLookahead` adds the projected
 *    bend on top, which is what makes a bend visible from far away.
 *
 * Where the road forks, both roads share the rows (they are at the same height), each with its
 * own lateral position and its own bend.
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
  // A loop wraps; a route starts with its first segment and ends with its last.
  const segmentFor = (i: number): Segment | undefined =>
    track.loop ? segments[((i % n) + n) % n] : i >= n ? undefined : segments[Math.max(0, i)];
  const baseIndex = Math.floor(view.z / SEGMENT_LENGTH);
  const basePercent = view.z / SEGMENT_LENGTH - baseIndex;
  const count = Math.ceil(view.drawDistance / SEGMENT_LENGTH);
  const projected: ProjectedSegment[] = [];

  // Projected bend: each road's lateral drift, accumulated from the camera outwards. A segment
  // of curvature k turns the heading by k*L, which moves the centre k*L*L further each segment.
  const lookahead = arcade ? view.curveLookahead ?? 0 : 1;
  const first = segmentFor(baseIndex);
  const driftA = { offset: 0, drift: -(first?.curve ?? 0) * SEGMENT_LENGTH * SEGMENT_LENGTH * basePercent };
  const driftB = { offset: 0, drift: -(first?.curveB ?? 0) * SEGMENT_LENGTH * SEGMENT_LENGTH * basePercent };
  const advance = (d: { offset: number; drift: number }, curve: number): [number, number] => {
    const edges: [number, number] = [d.offset * lookahead, (d.offset + d.drift) * lookahead];
    d.offset += d.drift;
    d.drift += curve * SEGMENT_LENGTH * SEGMENT_LENGTH;
    return edges;
  };
  // arcade model: sideways offset in screen heights, and its slope per screen height, per road
  const arcA = { offset: 0, slope: 0 };
  const arcB = { offset: 0, slope: 0 };
  let clipY = height;

  for (let i = 0; i < count; i++) {
    const segment = segmentFor(baseIndex + i);
    if (!segment) break;
    const z0 = (i - basePercent) * SEGMENT_LENGTH;
    let z1 = z0;
    const z2 = z1 + SEGMENT_LENGTH;
    const [bendA1, bendA2] = advance(driftA, segment.curve);
    const [bendB1, bendB2] = advance(driftB, segment.curveB);
    let y1 = segment.y1;
    const y2 = segment.y2;

    // Arcade model: a road's offset within this segment, in screen heights, at depth z. It is
    // exact for every row, not interpolated between the segment's edges: near the car one segment
    // can cover a fifth of the screen, and straight chords there would put a kink in the arc.
    const r0 = flatRise(z0);
    const arcFor = (arc: { offset: number; slope: number }, curve: number): ((z: number) => number) => {
      const k = curve * gain;
      const { offset: offset0, slope: slope0 } = arc;
      if (arcade) {
        arc.slope += k * (flatRise(z2) - r0);
        arc.offset = offset0 + slope0 * (flatRise(z2) - r0) + 0.5 * k * (flatRise(z2) - r0) ** 2;
      }
      return (z) => {
        if (!arcade) return 0;
        const d = flatRise(z) - r0;
        return offset0 + slope0 * d + 0.5 * k * d * d;
      };
    };
    const arcAtA = arcFor(arcA, segment.curve);
    const arcAtB = arcFor(arcB, segment.curveB);

    if (z2 <= NEAR) continue;
    // Lateral position of each road at depth z: its place in the segment plus the projected
    // bend, both interpolated through the segment in the world.
    const along = (z: number): number => (z - z0) / SEGMENT_LENGTH;
    const roadA = (z: number): number => segment.a1 + (segment.a2 - segment.a1) * along(z) + bendA1 + (bendA2 - bendA1) * along(z);
    const roadB = (z: number): number => segment.b1 + (segment.b2 - segment.b1) * along(z) + bendB1 + (bendB2 - bendB1) * along(z);
    if (z1 < NEAR) {
      y1 += (y2 - y1) * ((NEAR - z1) / (z2 - z1));
      z1 = NEAR;
    }

    const s1 = focal / z1;
    const s2 = focal / z2;
    const sx1 = width / 2 + (roadA(z1) - view.x) * s1 + arcAtA(z1) * height;
    const sx1B = width / 2 + (roadB(z1) - view.x) * s1 + arcAtB(z1) * height;
    const sy1 = horizon - (y1 - view.y) * s1;
    const sy2 = horizon - (y2 - view.y) * s2;
    const fog1 = fogAt(z1, view.drawDistance);

    projected.push({ segment, scale: s1, x: sx1, xB: sx1B, y: sy1, clipY, fog: fog1, depth: z1 });

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
      const centreA = width / 2 + (roadA(z) - view.x) * focal * invZ + arcAtA(z) * height;
      const centreB = width / 2 + (roadB(z) - view.x) * focal * invZ + arcAtB(z) * height;
      const t2 = along(z);
      rows[o] = centreA;
      rows[o + 1] = track.halfWidth * focal * invZ;
      rows[o + 2] = startDistance + (z - z1);
      rows[o + 3] = 1;
      rows[o + 4] = fogAt(z, view.drawDistance);
      rows[o + 5] = (Math.abs(invZ2 - invZ1) / span) * z * z;
      rows[o + 6] = centreB - centreA;
      rows[o + 7] = segment.fadeB1 + (segment.fadeB2 - segment.fadeB1) * t2;
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
