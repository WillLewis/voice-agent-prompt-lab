// Presentation (display) types consumed by the UI components. The adapter maps
// the engine's domain model onto these, so the polished components never need to
// know about the engine internals.

import type { CallerPersona } from "../engine/types";

export type Risk = "low" | "high" | "adversarial";
export type CallState = "intake" | "verification" | "triage" | "handoff" | "resolved";
export type EvalStatus = "pass" | "warn" | "fail";

// Re-export CallerPersona so UI components import from one place.
export type { CallerPersona };

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
  /** Whether ASR noise was applied in this run (Item 5). */
  noiseEnabled?: boolean;
}

export interface ScenarioMeta {
  id: string;
  title: string;
  intent: string;
  risk: Risk;
  lastEval: EvalStatus;
}

// ---------------------------------------------------------------------------
// Caller / persona settings (Item 1)
// ---------------------------------------------------------------------------

export type CallerMode = "scripted" | "live";

// ---------------------------------------------------------------------------
// Prompt versioning (Item 4)
// ---------------------------------------------------------------------------

/** A saved snapshot of a named prompt and its eval score at save time. */
export interface PromptVersion {
  name: string;
  prompt: string;
  savedAt: string; // ISO timestamp
  /** Scorecard snapshot at save time (overallScore per scenario). */
  scores?: Record<string, string>;
}

export const PROMPT_VERSIONS_KEY = "lpl-prompt-versions";

export function loadPromptVersions(): PromptVersion[] {
  try {
    const raw = localStorage.getItem(PROMPT_VERSIONS_KEY);
    return raw ? (JSON.parse(raw) as PromptVersion[]) : [];
  } catch {
    return [];
  }
}

export function savePromptVersion(version: PromptVersion): void {
  const versions = loadPromptVersions();
  // Replace if name already exists, otherwise prepend.
  const idx = versions.findIndex((v) => v.name === version.name);
  if (idx >= 0) versions[idx] = version;
  else versions.unshift(version);
  localStorage.setItem(PROMPT_VERSIONS_KEY, JSON.stringify(versions));
}

export function deletePromptVersion(name: string): void {
  const versions = loadPromptVersions().filter((v) => v.name !== name);
  localStorage.setItem(PROMPT_VERSIONS_KEY, JSON.stringify(versions));
}

/** Simple line-level diff between two prompt strings. */
export function diffPrompts(
  a: string,
  b: string,
): Array<{ type: "equal" | "added" | "removed"; line: string }> {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const result: Array<{ type: "equal" | "added" | "removed"; line: string }> = [];

  // Very fast O(n) approximation: mark removed lines then added lines.
  // Good enough for prompt diffs which are usually sequential edits.
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);

  for (const line of aLines) {
    if (bSet.has(line)) result.push({ type: "equal", line });
    else result.push({ type: "removed", line });
  }
  for (const line of bLines) {
    if (!aSet.has(line)) result.push({ type: "added", line });
  }
  return result;
}
