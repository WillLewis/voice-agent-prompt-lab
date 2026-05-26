import { describe, it, expect } from "vitest";
import { runConversation } from "../src/engine/conversationRunner";
import { SCENARIOS_BY_ID } from "../src/data/scenarios";
import type { Agent } from "../src/engine/types";

// The runner must not loop forever when an agent keeps calling a tool without
// progressing — a real failure mode for an LLM that retries a failing
// verifyIdentity. The loop guard caps consecutive tool calls.

describe("conversationRunner — tool-retry loop guard", () => {
  it("breaks out of a repeated tool-call loop instead of running to the step cap", async () => {
    const loopingAgent: Agent = async () => ({
      spoken_response: "Let me verify your identity now.",
      state: "identity_verification",
      next_required_field: null,
      tool_call: { name: "verifyIdentity", args: {} },
      risk_flags: [],
      confidence: 0.5,
    });

    const trace = await runConversation(SCENARIOS_BY_ID["routine-fnol"], loopingAgent, []);

    // Without the guard this would hit MAX_STEPS (32) tool calls; with it the
    // run stops after a small, bounded number.
    expect(trace.toolCalls.length).toBeLessThanOrEqual(4);
    expect(trace.toolCalls.every((t) => t.name === "verifyIdentity")).toBe(true);
    expect(trace.turns.length).toBeLessThan(10);
  });
});
