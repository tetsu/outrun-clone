/**
 * A small seeded random source (mulberry32). The simulation draws only from this, never from
 * Math.random, so a run replays exactly from its seed and inputs. Its whole state is one
 * number, which a replay stores.
 */
export class Random {
  constructor(public state: number) {}

  /** 0 (inclusive) to 1 (exclusive). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** An integer from 0 to n - 1. */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}
