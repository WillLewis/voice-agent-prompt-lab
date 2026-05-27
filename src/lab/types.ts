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

export interface RunAllComparisonRow {
  scenarioId: string;
  title: string;
  baselineScore?: string;
  baselineDelta?: number;
  beforeScore?: string;
  afterScore: string;
  scoreDelta?: number;
  beforeStatus?: EvalStatus;
  afterStatus: EvalStatus;
  failedCriteria: string[];
  warnedCriteria: string[];
}

export interface RunAllSummary {
  ranAt: string;
  runLabel: string;
  baselineLabel: string;
  totalScore: string;
  baselineDelta?: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  rows: RunAllComparisonRow[];
}

// ---------------------------------------------------------------------------
// Caller / persona settings (Item 1)
// ---------------------------------------------------------------------------

export type CallerMode = "scripted" | "simulated" | "live";

// ---------------------------------------------------------------------------
// Prompt versioning (Item 4)
// ---------------------------------------------------------------------------

export type PromptVersionLabel = "baseline" | "candidate" | "regression" | "fix";

export const PROMPT_VERSION_LABELS: Array<{
  id: PromptVersionLabel;
  label: string;
}> = [
  { id: "baseline", label: "Baseline" },
  { id: "candidate", label: "Candidate" },
  { id: "regression", label: "Regression" },
  { id: "fix", label: "Fix" },
];

/** A saved snapshot of a named prompt and its eval score at save time. */
export interface PromptVersion {
  name: string;
  labels?: PromptVersionLabel[];
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
  const labels = version.labels ?? [];
  // Replace if name already exists, otherwise prepend.
  const idx = versions.findIndex((v) => v.name === version.name);
  const normalized = { ...version, labels };
  const next = labels.includes("baseline")
    ? versions.map((v) => ({
        ...v,
        labels: (v.labels ?? []).filter((label) => label !== "baseline"),
      }))
    : versions;
  if (idx >= 0) next[idx] = normalized;
  else next.unshift(normalized);
  localStorage.setItem(PROMPT_VERSIONS_KEY, JSON.stringify(next));
}

export function deletePromptVersion(name: string): void {
  const versions = loadPromptVersions().filter((v) => v.name !== name);
  localStorage.setItem(PROMPT_VERSIONS_KEY, JSON.stringify(versions));
}

/** Simple line-level diff between two prompt strings. */
export function diffPrompts(
  a: string,
  b: string,
): Array<{ type: "equal" | "added" | "removed"; line: string; oldLine?: number; newLine?: number }> {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const lengths = Array.from({ length: aLines.length + 1 }, () =>
    Array<number>(bLines.length + 1).fill(0),
  );

  for (let i = aLines.length - 1; i >= 0; i--) {
    for (let j = bLines.length - 1; j >= 0; j--) {
      lengths[i][j] =
        aLines[i] === bLines[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const result: Array<{
    type: "equal" | "added" | "removed";
    line: string;
    oldLine?: number;
    newLine?: number;
  }> = [];
  let i = 0;
  let j = 0;
  while (i < aLines.length && j < bLines.length) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: "equal", line: aLines[i], oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      result.push({ type: "removed", line: aLines[i], oldLine: i + 1 });
      i += 1;
    } else {
      result.push({ type: "added", line: bLines[j], newLine: j + 1 });
      j += 1;
    }
  }
  while (i < aLines.length) {
    result.push({ type: "removed", line: aLines[i], oldLine: i + 1 });
    i += 1;
  }
  while (j < bLines.length) {
    result.push({ type: "added", line: bLines[j], newLine: j + 1 });
    j += 1;
  }
  return result;
}
