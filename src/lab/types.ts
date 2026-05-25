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
}

export interface ScenarioMeta {
  id: string;
  title: string;
  intent: string;
  risk: Risk;
  lastEval: EvalStatus;
}
