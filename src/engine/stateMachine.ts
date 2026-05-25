import type { AgentState } from "./types";

// The conversation state machine. Kept explicit and inspectable so the demo can
// show *why* a given flow is valid and where guardrails sit. Terminal states end
// the run: a resolved task or a human escalation.

export const AGENT_STATES: AgentState[] = [
  "greeting",
  "identity_verification",
  "policy_lookup",
  "intake",
  "tool_call",
  "coverage_boundary",
  "escalation",
  "resolved",
];

const TRANSITIONS: Record<AgentState, AgentState[]> = {
  greeting: ["identity_verification", "intake", "escalation"],
  identity_verification: ["policy_lookup", "escalation"],
  policy_lookup: ["intake", "coverage_boundary", "escalation"],
  intake: ["intake", "tool_call", "coverage_boundary", "escalation"],
  tool_call: ["resolved", "escalation"],
  coverage_boundary: ["intake", "escalation", "resolved"],
  escalation: [],
  resolved: [],
};

export const TERMINAL_STATES: AgentState[] = ["resolved", "escalation"];

export function canTransition(from: AgentState, to: AgentState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(state: AgentState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function allowedNextStates(from: AgentState): AgentState[] {
  return TRANSITIONS[from] ?? [];
}
