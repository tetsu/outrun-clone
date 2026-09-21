import { Random } from "./random";
import { SEGMENT_LENGTH, segmentAt, type Segment, type Track } from "./track";

/** A kind of traffic vehicle: its size for collisions, how fast it drives, how common it is. */
export interface VehicleKind {
  /** Metres. */
  length: number;
  width: number;
  /** Cruising speed range, km/h. */
  speed: [number, number];
  /** Relative share of the traffic. */
  weight: number;
}

/**
 * The traffic vehicles. The names match the sprite folders (local-assets/traffic/<name>/) and
 * the lengths the models were prepared at; a build without the sprites draws placeholders.
 */
export const VEHICLES: Record<string, VehicleKind> = {
  "kei-truck": { length: 3.4, width: 1.48, speed: [60, 85], weight: 3 },
  "kei-wagon": { length: 3.4, width: 1.48, speed: [65, 95], weight: 3 },
  "peanut-hatchback": { length: 3.7, width: 1.7, speed: [75, 105], weight: 2 },
  "grey-sedan": { length: 4.7, width: 1.8, speed: [80, 115], weight: 3 },
  yankee: { length: 4.4, width: 1.8, speed: [95, 130], weight: 2 },
  supercar: { length: 4.5, width: 2.0, speed: [120, 160], weight: 1 },
  "deco-truck": { length: 6.0, width: 2.3, speed: [70, 95], weight: 2 },
  bus: { length: 7.3, width: 2.5, speed: [60, 85], weight: 1 },
};
const KIND_NAMES = Object.keys(VEHICLES);
const TOTAL_WEIGHT = KIND_NAMES.reduce((sum, k) => sum + VEHICLES[k].weight, 0);

/** Vehicles per kilometre of road around the player. */
export const TRAFFIC_DENSITY = 5;
/** Traffic exists from this far behind the player to this far ahead; new vehicles appear far ahead, in the haze. */
const BEHIND = 80;
const AHEAD = 1250;
const SPAWN_FROM = 1080;
/** A vehicle closes up to one ahead in its lane no nearer than this, metres. */
const FOLLOW_GAP = 22;

export interface Vehicle {
  id: number;
  kind: string;
  /** Distance along the track of its centre, and its lateral position (derived from road and lane). */
  z: number;
  x: number;
  /** Which road it follows where the road forks, and its lane's offset from that road's centre. */
  road: "a" | "b";
  lane: number;
  speed: number;
  /** The speed it cruises at when nothing is in the way, m/s. */
  cruise: number;
}

/** Everything needed to restart the traffic exactly (a replay stores it). */
export interface TrafficSnapshot {
  seed: number;
  nextId: number;
  vehicles: Vehicle[];
}

/** Lateral centre of a road at a distance along the track. */
export function roadCentre(track: Track, z: number, road: "a" | "b"): number {
  const s = segmentAt(track, z);
  const t = Math.min(1, Math.max(0, z / SEGMENT_LENGTH - Math.floor(z / SEGMENT_LENGTH)));
  return road === "a" ? s.a1 + (s.a2 - s.a1) * t : s.b1 + (s.b2 - s.b1) * t;
}

/**
 * Lane-keeping traffic, all driving the player's way. Vehicles keep their lane, close up
 * behind slower ones rather than pass through them, and are spawned from a seeded generator
 * far ahead in the haze and dropped once far behind. Where the road forks, vehicles in the left
 * lanes take the left road and those in the right lanes the right road; the middle lane picks
 * one at random.
 */
export class Traffic {
  vehicles: Vehicle[] = [];
  private random: Random;
  private nextId = 1;
  /** Previous positions, for drawing between simulation steps. */
  readonly previous = new Map<number, { z: number; x: number }>();

  constructor(seed: number, private density = TRAFFIC_DENSITY) {
    this.random = new Random(seed);
  }

  snapshot(): TrafficSnapshot {
    return { seed: this.random.state, nextId: this.nextId, vehicles: this.vehicles.map((v) => ({ ...v })) };
  }

  restore(s: TrafficSnapshot): void {
    this.random.state = s.seed;
    this.nextId = s.nextId;
    this.vehicles = s.vehicles.map((v) => ({ ...v }));
    this.previous.clear();
  }

  /** Clears the road and fills it again around a new position (a route restart). */
  reset(track: Track, playerZ: number): void {
    this.vehicles = [];
    this.previous.clear();
    const want = Math.round(((AHEAD - 40) / 1000) * this.density);
    for (let i = 0; i < want; i++) this.spawn(track, playerZ + 40 + this.random.next() * (AHEAD - 40));
    this.vehicles.sort((p, q) => p.z - q.z);
  }

  /**
   * Taking the right branch of a fork swaps the two roads from the commit point on (see Route);
   * vehicles past it swap roads with them, so each stays on the road it was on.
   */
  swapRoads(fromZ: number): void {
    for (const v of this.vehicles) if (v.z >= fromZ) v.road = v.road === "a" ? "b" : "a";
  }

  /** Moves every vehicle's lateral position by the route's re-centring of the frame. */
  shift(by: number): void {
    for (const v of this.vehicles) v.x -= by;
    for (const p of this.previous.values()) p.x -= by;
  }

  step(track: Track, playerZ: number, dt: number): void {
    this.previous.clear();
    for (const v of this.vehicles) this.previous.set(v.id, { z: v.z, x: v.x });

    // Keep a lane's order: close up behind a slower vehicle ahead, never through it.
    const sorted = this.vehicles.slice().sort((p, q) => p.z - q.z);
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      let target = v.cruise;
      for (let j = i + 1; j < sorted.length && sorted[j].z - v.z < FOLLOW_GAP * 3; j++) {
        const ahead = sorted[j];
        if (Math.abs(ahead.x - v.x) > 1.5) continue;
        const gap = ahead.z - v.z - (VEHICLES[ahead.kind].length + VEHICLES[v.kind].length) / 2;
        if (gap < FOLLOW_GAP) target = Math.min(target, ahead.speed * Math.max(0.5, gap / FOLLOW_GAP));
        break;
      }
      v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), 4 * dt);
      v.z += v.speed * dt;
      v.x = roadCentre(track, v.z, v.road) + v.lane;
    }

    // Drop vehicles far behind, past the end of the road built so far, or on a branch that fades out.
    this.vehicles = this.vehicles.filter((v) => {
      if (v.z < playerZ - BEHIND || (!track.loop && v.z > track.length - SEGMENT_LENGTH)) return false;
      const s = segmentAt(track, v.z);
      return !(v.road === "b" && forked(s) && s.fadeB1 < 0.3);
    });

    // Top up far ahead.
    const want = Math.round(((AHEAD + BEHIND) / 1000) * this.density);
    let tries = 0;
    while (this.vehicles.length < want && tries++ < 4) {
      const z = playerZ + SPAWN_FROM + this.random.next() * (AHEAD - SPAWN_FROM);
      if (!track.loop && z > track.length - 60) break;
      this.spawn(track, z);
    }
  }

  private spawn(track: Track, z: number): void {
    let r = this.random.next() * TOTAL_WEIGHT;
    let kind = KIND_NAMES[0];
    for (const name of KIND_NAMES) {
      r -= VEHICLES[name].weight;
      if (r < 0) {
        kind = name;
        break;
      }
    }
    const k = VEHICLES[kind];
    const lanes = track.lanes;
    const laneIndex = this.random.int(lanes);
    const laneWidth = (2 * track.halfWidth) / lanes;
    const lane = -track.halfWidth + (laneIndex + 0.5) * laneWidth;
    const middle = (lanes - 1) / 2;
    const road = laneIndex < middle ? "a" : laneIndex > middle ? "b" : this.random.next() < 0.5 ? "a" : "b";
    const cruise = this.random.range(k.speed[0], k.speed[1]) / 3.6;
    // keep clear of vehicles already in the lane
    const x = roadCentre(track, z, road) + lane;
    for (const v of this.vehicles) if (Math.abs(v.z - z) < 30 && Math.abs(v.x - x) < 1.5) return;
    this.vehicles.push({ id: this.nextId++, kind, z, x, road, lane, speed: cruise, cruise });
  }
}

function forked(s: Segment): boolean {
  return s.a1 !== s.b1 || s.a2 !== s.b2;
}
