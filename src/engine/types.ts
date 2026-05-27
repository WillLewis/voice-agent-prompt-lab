// Domain types for the Liberate Prompt Lab reasoning layer.
//
// This module is framework-agnostic: it must not import React, Vite, or any
// browser/SSR code, because it is consumed by the in-browser UI, the Vitest
// suites, AND the `tsx` CLI eval runner. Keep imports within the domain layer
// relative so the CLI runs without path-alias resolution.

/** High-level grouping used for filtering / presentation. */
export type ScenarioCategory = "fnol" | "servicing" | "adversarial";

/** Presentation risk tag (mirrors the UI badge vocabulary). */
export type Risk = "low" | "high" | "adversarial";

/** Conversation state machine states. */
export type AgentState =
  | "greeting"
  | "identity_verification"
  | "policy_lookup"
  | "intake"
  | "tool_call"
  | "coverage_boundary"
  | "escalation"
  | "resolved";

/** The five mock insurance tools the agent may call. */
export type ToolName =
  | "verifyIdentity"
  | "lookupPolicy"
  | "createClaim"
  | "updatePolicyDraft"
  | "escalateToHuman";

export type ToolStatus = "success" | "failed" | "skipped";

/** Which engine actually produced an agent turn. "llm" = the model's output was
 *  used; "fallback" = the model output was rejected (bad/missing schema) or the
 *  call failed, so the deterministic agent filled in. Undefined in plain
 *  deterministic mode. Surfaced in the UI so a silent fallback can't masquerade
 *  as a live model run. */
export type AgentSource = "llm" | "fallback";

export interface ToolCall {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  status: ToolStatus;
}

export type Speaker = "customer" | "agent" | "system";

export interface AgentTurn {
  id: string;
  speaker: Speaker;
  text: string;
  /** State the agent is in when producing this turn. */
  state?: AgentState;
  /** Tool invoked as part of this turn, if any. */
  toolCall?: ToolCall;
  riskFlags?: string[];
  /** For agent turns: which engine produced it (see AgentSource). */
  source?: AgentSource;
}

/**
 * Structured output contract the agent (deterministic OR llm) must satisfy on
 * every step. Mirrors the output schema documented in the system prompt, and is
 * validated with Zod when produced by the LLM.
 */
export interface AgentOutput {
  spoken_response: string;
  state: AgentState;
  next_required_field: string | null;
  tool_call: { name: ToolName; args: Record<string, unknown> } | null;
  risk_flags: string[];
  confidence: number;
  /** Set by the LLM agent wrapper; left undefined by the deterministic agent. */
  source?: AgentSource;
}

export type EvalStatus = "pass" | "fail" | "warn";

export interface EvalItem {
  id: string;
  label: string;
  status: EvalStatus;
  rationale: string;
}

export interface EvalResult {
  scenarioId: string;
  totalScore: number;
  maxScore: number;
  items: EvalItem[];
}

/**
 * A single scenario. Merges the behavioral fields the engine/evals need with
 * the presentation fields the UI renders, so there is one source of truth.
 */
export interface Scenario {
  id: string;
  title: string;
  category: ScenarioCategory;
  /** One-line summary shown in the scenario list and transcript header. */
  intent: string;
  /** Display persona line, e.g. "Caller: Jamie R. — Auto policy POL-DEMO-1042". */
  persona: string;
  /** UI risk badge. */
  risk: Risk;
  /** The caller's first utterance, used to seed the conversation. */
  openingUtterance: string;
  /** Plain-language description of what a correct run should achieve. */
  expectedOutcome: string;
  /** Fields the agent must collect for this workflow before acting. */
  requiredFields: string[];
  /** Machine-readable risk triggers (e.g. "injury", "prompt_injection"). */
  riskFlags: string[];
  customerId: string;
  policyId: string;
  /** Notes rendered in the UI "Architecture" tab. */
  architectureNotes: string;
  /** Structured synthetic facts the simulated/LLM caller uses to answer. */
  facts: ScenarioFacts;
  /** Scenario-level behavioral contract used by the evaluator. */
  expectations: ScenarioExpectations;
}

export type RunMode = "deterministic" | "llm";

/** The raw conversation produced by a run, before scoring. */
export interface ConversationTrace {
  turns: AgentTurn[];
  toolCalls: ToolCall[];
  finalState: AgentState;
  /** True when ASR noise was applied to caller utterances (Item 5). Used by
   *  the confirms_critical_details rubric check. */
  noiseEnabled?: boolean;
}

/** Full result of running one scenario end-to-end (trace + score). */
export interface RunResult extends ConversationTrace {
  scenarioId: string;
  mode: RunMode;
  evaluation: EvalResult;
}

/** Context handed to an agent on each step of the conversation. */
export interface AgentContext {
  scenario: Scenario;
  /** Transcript so far (agent + customer + system turns). */
  history: AgentTurn[];
  /** Required fields collected so far, keyed by field name. */
  collected: Record<string, string>;
  lastCustomer: string | null;
  verified: boolean;
  policyLookedUp: boolean;
  lastToolResult: Record<string, unknown> | null;
}

/** An agent decides the next turn given context. Deterministic or LLM-backed. */
export type Agent = (ctx: AgentContext) => Promise<AgentOutput>;

// ---------------------------------------------------------------------------
// Caller types — adaptive LLM "customer" agent (Item 1)
// ---------------------------------------------------------------------------

/** Personas shape how simulated/live callers behave. */
export type CallerPersona =
  | "cooperative"
  | "rushed"
  | "confused"
  | "irate"
  | "evasive-adversarial";

/** Structured synthetic facts for one scenario. Sourced from mock fixtures plus
 *  scenario-specific loss/servicing details; never real customer data. */
export interface ScenarioFacts {
  /** Full name for identity verification. */
  fullName: string;
  /** ZIP code for identity verification. */
  zip: string;
  /** What happened and what the caller knows — the narrative the caller will
   *  draw on to answer questions. Keep it concrete so the LLM can improvise. */
  lossContext: string;
  /** Deterministic answers keyed by the agent's next_required_field. Lets the
   *  local caller simulator answer adaptive question order without an API key. */
  fieldResponses: Record<string, string>;
}

export type CallerBrief = ScenarioFacts;

/** Explicit scenario contract for evals. This keeps business expectations in
 *  data instead of buried in assertion code. */
export interface ScenarioExpectations {
  /** Tools that must appear, in this exact order, for the scenario to be valid. */
  expectedToolSequence: ToolName[];
  /** Tools that should not be used in this scenario. */
  forbiddenTools: ToolName[];
  /** Required arg paths for each tool, e.g. "details.vin". */
  requiredToolArgs?: Partial<Record<ToolName, string[]>>;
  /** Acceptable terminal states for this scenario. */
  terminalStates: AgentState[];
  /** If set, an escalation tool call must include this reason. */
  escalationReason?: string;
  /** If true, the agent must mention licensed review/finalization. */
  requiresLicensedReviewLanguage?: boolean;
}

/** Minimal context the runner hands to the caller on each turn. The brief and
 *  persona are closed over in the caller factory, not passed at call time. */
export interface CallerContext {
  /** Full transcript so far (agent + customer + system turns). */
  history: AgentTurn[];
  /** The agent's most recent utterance the caller must now respond to. */
  lastAgentUtterance: string;
  /** The field the agent says it is collecting now, if any. */
  nextRequiredField: string | null;
  /** Required fields collected by the runner so far. */
  collected: Record<string, string>;
  scenario: Scenario;
  verified: boolean;
  policyLookedUp: boolean;
  lastToolResult: Record<string, unknown> | null;
}

/** A caller produces the next customer utterance. Scripted callers shift from
 *  a fixed queue; LLM callers generate via a live model. Returning end:true or
 *  an empty utterance terminates the conversation. */
export type Caller = (ctx: CallerContext) => Promise<{ utterance: string; end?: boolean }>;
