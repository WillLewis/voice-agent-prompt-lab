import { describe, expect, it } from "vitest";
import { normalizeBasePath, withBasePath } from "../src/lib/basePath";
import { canRunAll, isPromptEditorReadOnly } from "../src/lab/publicDemo";

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
});
