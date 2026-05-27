import type { AgentState, RunResult, Scenario, ToolStatus } from "../engine/types";
import { INSURANCE_VOICE_AGENT_PROMPT } from "../prompts/insuranceVoiceAgentPrompt";
import type { CallState, EvalStatus, LabView, ScoreRow, ToolCallView, Turn } from "./types";

// Maps the engine's domain model onto the UI's display model. This is the seam
// that lets the polished (originally static) components render live runs.

const STATE_TO_CALLSTATE: Record<AgentState, CallState> = {
  greeting: "intake",
  identity_verification: "verification",
  policy_lookup: "verification",
  intake: "triage",
  tool_call: "triage",
  coverage_boundary: "triage",
  escalation: "handoff",
  resolved: "resolved",
};

const TOOL_STATUS_TO_VIEW: Record<ToolStatus, ToolCallView["status"]> = {
  success: "ok",
  skipped: "warn",
  failed: "error",
};

const PER_ITEM_SCORE: Record<EvalStatus, string> = {
  pass: "1/1",
  warn: "0.5/1",
  fail: "0/1",
};

function stableInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function customerName(persona: string): string {
  const m = persona.match(/Caller:\s*([A-Za-z]+ [A-Za-z]+)/);
  return m ? m[1].split(" ")[0] : "Caller";
}

function overallStatus(items: { status: EvalStatus }[]): EvalStatus {
  if (items.some((i) => i.status === "fail")) return "fail";
  if (items.some((i) => i.status === "warn")) return "warn";
  return "pass";
}

export function mapRunToLabView(
  scenario: Scenario,
  run: RunResult,
  systemPrompt: string = INSURANCE_VOICE_AGENT_PROMPT,
): LabView {
  const caller = customerName(scenario.persona);

  let prevState: AgentState | undefined;
  const transcript: Turn[] = run.turns.map((turn) => {
    if (turn.speaker === "agent") {
      let transition: string | undefined;
      if (turn.toolCall) transition = `→ tool: ${turn.toolCall.name}`;
      else if (turn.state && prevState && turn.state !== prevState) transition = `→ ${turn.state}`;
      if (turn.state) prevState = turn.state;
      return { role: "agent", speaker: "Aria", text: turn.text, transition, source: turn.source };
    }
    return {
      role: turn.speaker,
      speaker: turn.speaker === "system" ? "System" : caller,
      text: turn.text,
    };
  });

  const toolCalls: ToolCallView[] = run.toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.name,
    args: tc.args,
    result: tc.result,
    latencyMs: 120 + (stableInt(tc.id + tc.name) % 380),
    status: TOOL_STATUS_TO_VIEW[tc.status],
  }));

  const scorecard: ScoreRow[] = run.evaluation.items.map((item) => ({
    criterion: item.label,
    score: PER_ITEM_SCORE[item.status],
    status: item.status,
    note: item.rationale,
  }));

  const agentTurns = run.turns.filter((t) => t.speaker === "agent");
  const llmRun =
    run.mode === "llm"
      ? {
          turns: agentTurns.length,
          fallbacks: agentTurns.filter((t) => t.source === "fallback").length,
        }
      : undefined;

  return {
    id: scenario.id,
    title: scenario.title,
    intent: scenario.intent,
    persona: scenario.persona,
    risk: scenario.risk,
    state: STATE_TO_CALLSTATE[run.finalState],
    lastEval: overallStatus(run.evaluation.items),
    systemPrompt,
    transcript,
    toolCalls,
    scorecard,
    overallScore: `${run.evaluation.totalScore}/${run.evaluation.maxScore}`,
    architectureNotes: scenario.architectureNotes,
    llmRun,
    noiseEnabled: run.noiseEnabled,
  };
}
