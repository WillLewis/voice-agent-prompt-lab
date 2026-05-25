import { describe, it, expect } from "vitest";
import { canTransition, isTerminal, allowedNextStates, AGENT_STATES } from "../src/engine/stateMachine";

describe("state machine", () => {
  it("allows the core FNOL progression", () => {
    expect(canTransition("greeting", "identity_verification")).toBe(true);
    expect(canTransition("identity_verification", "policy_lookup")).toBe(true);
    expect(canTransition("policy_lookup", "intake")).toBe(true);
    expect(canTransition("intake", "tool_call")).toBe(true);
    expect(canTransition("tool_call", "resolved")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("greeting", "resolved")).toBe(false);
    expect(canTransition("resolved", "greeting")).toBe(false);
    expect(canTransition("identity_verification", "tool_call")).toBe(false);
  });

  it("treats resolved and escalation as terminal", () => {
    expect(isTerminal("resolved")).toBe(true);
    expect(isTerminal("escalation")).toBe(true);
    expect(isTerminal("intake")).toBe(false);
  });

  it("exposes the allowed next states for a given state", () => {
    expect(allowedNextStates("greeting")).toContain("escalation");
    expect(allowedNextStates("resolved")).toHaveLength(0);
  });

  it("declares all eight states", () => {
    expect(AGENT_STATES).toHaveLength(8);
  });
});
