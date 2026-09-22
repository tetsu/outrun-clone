import { describe, expect, it } from "vitest";
import tree from "../src/data/stages.json";
import { formatStage } from "../src/dev/editor";
import type { StageData } from "../src/sim/track";

const texts = import.meta.glob<string>("../src/data/stages/*.json", { eager: true, query: "?raw", import: "default" });
const files = Object.keys(texts);
const name = (path: string): string => path.replace(/^.*\/|\.json$/g, "");
const stages = Object.fromEntries(files.map((f) => [name(f), JSON.parse(texts[f]) as StageData]));

describe("stage files", () => {
  it("are written by the track editor exactly as they are", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = texts[f].replace(/\r\n/g, "\n");
      expect(formatStage(JSON.parse(text) as StageData), f).toBe(text);
    }
  });

  it("form the stage tree: tier n has n stages, each forking to the two below it, and the last tier ends at goals", () => {
    const tiers = tree.tiers;
    tiers.forEach((tier, k) => {
      expect(tier.length, `tier ${k + 1}`).toBe(k + 1);
      tier.forEach((id, i) => {
        const stage = stages[id];
        expect(stage, id).toBeDefined();
        expect(stage.next, id).toBeUndefined();
        if (k === tiers.length - 1) {
          expect(stage.fork, id).toBeUndefined();
        } else {
          expect(stage.fork?.left, id).toBe(tiers[k + 1][i]);
          expect(stage.fork?.right, id).toBe(tiers[k + 1][i + 1]);
        }
      });
    });
  });

  it("only lead to stages that exist", () => {
    for (const [from, stage] of Object.entries(stages)) {
      for (const next of [stage.next, stage.fork?.left, stage.fork?.right]) {
        if (next) expect(stages[next], `${from} -> ${next}`).toBeDefined();
      }
    }
  });
});
