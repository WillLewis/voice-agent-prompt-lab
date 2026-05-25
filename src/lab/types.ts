// Presentation (display) types consumed by the UI components. The adapter maps
// the engine's domain model onto these, so the polished components never need to
// know about the engine internals.

export type Risk = "low" | "high" | "adversarial";
export type CallState = "intake" | "verification" | "triage" | "handoff" | "resolved";
export type EvalStatus = "pass" | "warn" | "fail";

export interface Turn {
  role: "customer" | "agent" | "system";
  speaker: string;
  text: string;
  /** Optional state-transition or tool chip rendered under the turn. */
  transition?: string;
  /** For agent turns in LLM mode: "llm" if the model produced it, "fallback" if
   *  the model's output was rejected and the deterministic script filled in. */
  source?: "llm" | "fallback";
}

export interface ToolCallView {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  latencyMs: number;
  status: "ok" | "warn" | "error";
}

export interface ScoreRow {
  criterion: string;
  score: string;
  status: EvalStatus;
  note: string;
}

/** Everything the dashboard needs to render one (live-computed) scenario run. */
export interface LabView {
  id: string;
  title: string;
  intent: string;
  persona: string;
  risk: Risk;
  state: CallState;
  lastEval: EvalStatus;
  systemPrompt: string;
  transcript: Turn[];
  toolCalls: ToolCallView[];
  scorecard: ScoreRow[];
  overallScore: string;
  architectureNotes: string;
  /** Present only for LLM-mode runs: how many agent turns came from the live
   *  model vs. fell back to the deterministic script. Drives the engine banner
   *  so a silent fallback can't pass as a live run. Undefined ⇒ deterministic. */
  llmRun?: { turns: number; fallbacks: number };
}

export interface ScenarioMeta {
  id: string;
  title: string;
  intent: string;
  risk: Risk;
  lastEval: EvalStatus;
}
