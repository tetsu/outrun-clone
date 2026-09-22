import type { PlayerState } from "./player";
import { buildStage, course, SEGMENT_LENGTH, segmentAt, type Segment, type StageData, type Track } from "./track";

/** Stage files by name (the file name without .json). */
export type Stages = Record<string, StageData>;

/** The next stage is attached once the car is this close to the end of the road built so far. */
const LOOKAHEAD = 1500;
/** Straight road past the goal line, so the run-out after the goal never sees the road end. */
export const GOAL_RUNOUT = 1500;

/** A stage laid down on the route. Distances are along the route's track. */
export interface PlacedStage {
  id: string;
  start: number;
  end: number;
  /** Where the car is committed to a branch, if the stage ends in a fork. */
  commit?: number;
  /** The branch taken, once committed. */
  branch?: "left" | "right";
  /** Where entering the stage counts (the checkpoint): the fork's commit point, or its start after a plain join. */
  checkpoint: number;
  /** The goal line, when the stage ends the run. */
  goal?: number;
}

/**
 * The road of a run: stages laid end to end as the car reaches them, on one track that does not
 * loop. A stage that ends in a fork is followed by nothing until the car commits to a branch;
 * then the branch's stage is attached. The car's lateral frame is re-centred on each new
 * stage's road, which moves the car and the road together and so cannot be seen. A stage with
 * no fork and no next stage ends at the goal line, with a straight run-out built past it.
 */
export class Route {
  readonly track: Track;
  readonly placed: PlacedStage[] = [];
  /** Set by update() when taking the right branch swapped the roads from this distance on; the caller clears it. */
  swappedFrom: number | null = null;

  constructor(readonly stages: Stages, readonly first: string) {
    const stage = this.stage(first);
    this.track = { name: stage.name, segments: [], length: 0, halfWidth: stage.halfWidth, lanes: stage.lanes, loop: false };
    this.append(first);
  }

  /** Starts over with `first` as the only stage, at distance 0. */
  restart(first = this.first): void {
    this.track.segments.length = 0;
    this.track.length = 0;
    this.placed.length = 0;
    this.append(first);
  }

  /** The stage the given distance falls in. */
  stageAt(z: number): PlacedStage {
    for (let i = this.placed.length - 1; i > 0; i--) if (z >= this.placed[i].start) return this.placed[i];
    return this.placed[0];
  }

  /**
   * Commits forks and attaches stages as the car goes. Returns the distance the lateral frame
   * moved (already applied to `p.x`); anything else that holds an x must move by it too.
   */
  update(p: PlayerState): number {
    const last = this.placed[this.placed.length - 1];
    const stage = this.stage(last.id);
    if (stage.fork && last.commit !== undefined && !last.branch && p.z >= last.commit) {
      const at = segmentAt(this.track, p.z);
      const t = p.z / SEGMENT_LENGTH - Math.floor(p.z / SEGMENT_LENGTH);
      const a = at.a1 + (at.a2 - at.a1) * t;
      const b = at.b1 + (at.b2 - at.b1) * t;
      last.branch = Math.abs(p.x - b) < Math.abs(p.x - a) ? "right" : "left";
      // Road a is the one the car drives on. Taking the right branch swaps the roads from the
      // commit point on; both roads bend alike up to there, so the picture does not change.
      if (last.branch === "right") {
        this.swappedFrom = last.commit;
        for (let i = Math.floor(last.commit / SEGMENT_LENGTH); i < this.track.segments.length; i++) swapRoads(this.track.segments[i]);
      }
      return this.append(last.branch === "right" ? stage.fork.right : stage.fork.left, p);
    }
    if (stage.next && p.z > last.end - LOOKAHEAD) return this.append(stage.next, p);
    return 0;
  }

  private stage(id: string): StageData {
    const stage = this.stages[id];
    if (!stage) throw new Error(`unknown stage "${id}"`);
    return stage;
  }

  /** Attaches a stage at the end of the road, then re-centres the frame on its road. */
  private append(id: string, p?: PlayerState): number {
    const segments = this.track.segments;
    const last = segments[segments.length - 1];
    const centre = last?.a2 ?? 0;
    const stage = this.stage(id);
    const goal = !stage.fork && !stage.next;
    const data = goal ? { ...stage, sections: [...stage.sections, { length: GOAL_RUNOUT }] } : stage;
    const built = buildStage(data, course, last?.y2 ?? 0, centre, segments.length);
    const start = this.track.length;
    for (const segment of built.segments) segments.push(segment);
    this.track.length = segments.length * SEGMENT_LENGTH;
    const previous = this.placed[this.placed.length - 1];
    const placed: PlacedStage = {
      id, start, end: start + built.length,
      commit: built.commit === undefined ? undefined : start + built.commit,
      checkpoint: previous?.commit ?? start,
    };
    if (goal) {
      placed.end -= GOAL_RUNOUT;
      placed.goal = placed.end;
      // the gantry over the goal line
      segments[Math.round(placed.goal / SEGMENT_LENGTH)].scenery.push({ kind: "goal", offset: 0, road: "a" });
    }
    this.placed.push(placed);

    if (centre !== 0) {
      for (const s of segments) {
        s.a1 -= centre;
        s.a2 -= centre;
        s.b1 -= centre;
        s.b2 -= centre;
      }
      if (p) p.x -= centre;
    }
    return centre;
  }
}

function swapRoads(s: Segment): void {
  [s.a1, s.b1] = [s.b1, s.a1];
  [s.a2, s.b2] = [s.b2, s.a2];
  [s.curve, s.curveB] = [s.curveB, s.curve];
  for (const item of s.scenery) item.road = item.road === "b" ? "a" : "b";
}
