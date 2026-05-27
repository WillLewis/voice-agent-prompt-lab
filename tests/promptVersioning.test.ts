import { describe, expect, it } from "vitest";
import { diffPrompts } from "../src/lab/types";

describe("prompt versioning", () => {
  it("keeps line order when showing prompt diffs", () => {
    const diff = diffPrompts("role\nold guardrail\noutput", "role\nnew guardrail\noutput");

    expect(diff).toEqual([
      { type: "equal", line: "role", oldLine: 1, newLine: 1 },
      { type: "removed", line: "old guardrail", oldLine: 2 },
      { type: "added", line: "new guardrail", newLine: 2 },
      { type: "equal", line: "output", oldLine: 3, newLine: 3 },
    ]);
  });

  it("does not collapse repeated lines into a set diff", () => {
    const diff = diffPrompts("rule\nrule\nsummary", "rule\nsummary");

    expect(diff).toEqual([
      { type: "equal", line: "rule", oldLine: 1, newLine: 1 },
      { type: "removed", line: "rule", oldLine: 2 },
      { type: "equal", line: "summary", oldLine: 3, newLine: 2 },
    ]);
  });
});
