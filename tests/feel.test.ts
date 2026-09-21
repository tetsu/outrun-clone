import { describe, expect, it } from "vitest";
import stage from "../src/data/stages/test-course.json";
import { formatFeel, measureFeel } from "../src/dev/feel";
import type { StageData } from "../src/sim/track";

describe("feel", () => {
  it("meets every feel target with the shipped tuning", () => {
    const results = measureFeel(stage as StageData);
    const missed = results.filter((r) => !r.pass).map((r) => r.id);
    // the full report is the failure message, so a miss shows what moved
    expect(missed, formatFeel(results)).toEqual([]);
  });
});
