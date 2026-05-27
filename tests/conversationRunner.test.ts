import { describe, it, expect } from "vitest";
import { runConversation } from "../src/engine/conversationRunner";
import { SCENARIOS_BY_ID } from "../src/data/scenarios";
import { deterministicAgent } from "../src/engine/deterministicAgent";
import { makeDeterministicCaller } from "../src/engine/deterministicCaller";
import { runScenario } from "../src/engine/runScenario";
import type { Agent, Caller } from "../src/engine/types";

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

// Item 1: stub caller test. Verifies that when a Caller is supplied the runner
// uses it for customer turns instead of the scripted queue.
describe("conversationRunner — adaptive caller", () => {
  it("uses the caller function for customer turns when supplied", async () => {
    let callerCallCount = 0;
    const stubCaller: Caller = async (ctx) => {
      callerCallCount += 1;
      // End the call after the second caller turn to avoid an infinite loop.
      if (callerCallCount >= 2) return { utterance: "", end: true };
      return { utterance: `Stub answer ${callerCallCount}: Jamie Reyes, 94110.` };
    };

    // Simple agent that always asks a question (no tool calls, stays in intake)
    // so the caller gets invoked.
    const questionAgent: Agent = async (ctx) => {
      const agentTurns = ctx.history.filter((t) => t.speaker === "agent").length;
      return {
        spoken_response: `Question ${agentTurns + 1}: Can you give me your name and ZIP?`,
        state: "identity_verification",
        next_required_field: "identity",
        tool_call: null,
        risk_flags: [],
        confidence: 0.9,
      };
    };

    const trace = await runConversation(
      SCENARIOS_BY_ID["routine-fnol"],
      questionAgent,
      [], // empty scripted queue — the caller provides the answers
      { caller: stubCaller },
    );

    // The caller should have been invoked at least once.
    expect(callerCallCount).toBeGreaterThanOrEqual(1);

    // Customer turns should contain the caller's utterances (not scripted lines).
    const customerTurns = trace.turns.filter((t) => t.speaker === "customer");
    // First turn is the opening utterance (seeded from scenario, not the caller).
    // Subsequent turns should come from the caller.
    if (customerTurns.length > 1) {
      expect(customerTurns[1].text).toContain("Stub answer");
    }
  });

  it("falls back to the scripted queue when caller is not supplied", async () => {
    const questionAgent: Agent = async () => ({
      spoken_response: "What is your name?",
      state: "identity_verification",
      next_required_field: "identity",
      tool_call: null,
      risk_flags: [],
      confidence: 0.9,
    });

    const script = ["From the script line 1", "From the script line 2"];
    const trace = await runConversation(
      SCENARIOS_BY_ID["routine-fnol"],
      questionAgent,
      script,
      // No caller option — defaults to scripted queue.
    );

    const customerTurns = trace.turns.filter((t) => t.speaker === "customer");
    // The scripted lines should appear in the transcript.
    const texts = customerTurns.map((t) => t.text);
    expect(texts).toContain("From the script line 1");
  });
});

describe("deterministic caller simulator", () => {
  it("answers from scenario facts instead of the fixed script queue", async () => {
    const scenario = SCENARIOS_BY_ID["routine-fnol"];
    const caller = makeDeterministicCaller(scenario.facts);

    const reorderedAgent: Agent = async (ctx) => {
      const agentTurns = ctx.history.filter((t) => t.speaker === "agent").length;
      return agentTurns === 0
        ? {
            spoken_response: "What is the best way to reach you?",
            state: "intake",
            next_required_field: "contactPreference",
            tool_call: null,
            risk_flags: [],
            confidence: 0.9,
          }
        : {
            spoken_response: "Thanks, that's all.",
            state: "resolved",
            next_required_field: null,
            tool_call: null,
            risk_flags: [],
            confidence: 0.9,
          };
    };

    const trace = await runConversation(scenario, reorderedAgent, ["This scripted line should not appear."], {
      caller,
    });

    const customerTexts = trace.turns.filter((t) => t.speaker === "customer").map((t) => t.text);
    expect(customerTexts).toContain("Email is best.");
    expect(customerTexts).not.toContain("This scripted line should not appear.");
  });

  it("can drive the full routine FNOL golden path without any scripted customer lines", async () => {
    const scenario = SCENARIOS_BY_ID["routine-fnol"];
    const caller = makeDeterministicCaller(scenario.facts);
    const result = await runScenario(scenario, deterministicAgent, [], "deterministic", { caller });

    expect(result.toolCalls.map((t) => t.name)).toEqual([
      "verifyIdentity",
      "lookupPolicy",
      "createClaim",
    ]);
    expect(result.evaluation.totalScore).toBe(result.evaluation.maxScore);
  });
});
