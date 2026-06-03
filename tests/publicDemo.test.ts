import { describe, expect, it } from "vitest";
import { normalizeBasePath, withBasePath } from "../src/lib/basePath";
import {
  canRunAll,
  isPromptEditorReadOnly,
  quotaFromUsage,
  reservePublicLlmRun,
} from "../src/lab/publicDemo";

describe("public demo helpers", () => {
  it("normalizes and joins the /voice base path", () => {
    expect(normalizeBasePath("/voice/")).toBe("/voice");
    expect(normalizeBasePath("/")).toBe("");
    expect(withBasePath("/voice/", "api/llm-status")).toBe("/voice/api/llm-status");
    expect(withBasePath("", "api/llm-status")).toBe("/api/llm-status");
  });

  it("keeps public prompt editing preset-only", () => {
    expect(isPromptEditorReadOnly(true)).toBe(true);
    expect(isPromptEditorReadOnly(false)).toBe(false);
  });

  it("disables run-all only for public LLM mode", () => {
    expect(canRunAll("llm", true)).toBe(false);
    expect(canRunAll("deterministic", true)).toBe(true);
    expect(canRunAll("llm", false)).toBe(true);
  });

  it("limits public LLM runs to three per prompt preset", () => {
    let usage = { robust: 0, okay: 0, weak: 0 };

    for (let i = 0; i < 3; i++) {
      const result = reservePublicLlmRun(usage, "robust");
      expect(result.ok).toBe(true);
      usage = result.usage;
    }

    const blocked = reservePublicLlmRun(usage, "robust");
    expect(blocked.ok).toBe(false);
    expect(blocked.quota.remainingByPreset.robust).toBe(0);

    const okay = reservePublicLlmRun(blocked.usage, "okay");
    expect(okay.ok).toBe(true);
    expect(okay.quota.remainingByPreset.okay).toBe(2);
  });

  it("reports a nine-run total public LLM quota", () => {
    const quota = quotaFromUsage({ robust: 3, okay: 3, weak: 3 });

    expect(quota.usedTotal).toBe(9);
    expect(quota.remainingTotal).toBe(0);
    expect(quota.perPresetLimit).toBe(3);
  });
});
