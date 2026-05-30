import { z } from "zod";
import { EVALUATOR_PROMPT } from "../prompts/evaluatorPrompt";
import type { EvalResult, EvalStatus } from "./types";
import type { LabView } from "../lab/types";
import { apiPath } from "../lib/basePath";

// LLM-as-judge evaluator (Item 3). Uses the existing EVALUATOR_PROMPT to ask
// a model to score a transcript on nuance the rule-based checks miss (empathy
// quality, coverage-boundary phrasing, tone). Optional — needs an API key.
// The rule-based scorecard remains the default gate.

const JudgeItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "fail", "warn"]),
  rationale: z.string(),
});

const JudgeOutputSchema = z.object({
  totalScore: z.number(),
  maxScore: z.number(),
  items: z.array(JudgeItemSchema),
});

/** Parse the model's raw text into an EvalResult, or return null on failure. */
function parseJudgeOutput(raw: string, scenarioId: string): EvalResult | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Find the outermost JSON object even if there's surrounding text.
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const result = JudgeOutputSchema.safeParse(obj);
    if (!result.success) return null;
    return {
      scenarioId,
      totalScore: result.data.totalScore,
      maxScore: result.data.maxScore,
      items: result.data.items.map((i) => ({
        id: i.id,
        label: i.label,
        status: i.status as EvalStatus,
        rationale: i.rationale,
      })),
    };
  } catch {
    return null;
  }
}

/** Format a LabView's transcript + tool log as a compact text block for the judge. */
function formatTranscriptForJudge(view: LabView): string {
  const turns = view.transcript.map((t) => `[${t.speaker}] ${t.text}`).join("\n");
  const tools = view.toolCalls.length
    ? "\n\nTool calls:\n" +
      view.toolCalls
        .map(
          (tc) =>
            `  ${tc.name} status=${tc.status} args=${JSON.stringify(tc.args)} result=${JSON.stringify(tc.result)}`,
        )
        .join("\n")
    : "";
  const scorecard = view.scorecard
    .map((row) => `  ${row.status} ${row.criterion} ${row.score}: ${row.note}`)
    .join("\n");
  const meta = [
    `Scenario: ${view.title}`,
    `Intent: ${view.intent}`,
    `Final state: ${view.state}`,
    `Rule-based score: ${view.overallScore}`,
    `Rule-based scorecard:\n${scorecard}`,
  ].join("\n");

  return `${meta}\n\nTranscript:\n${turns}${tools}`;
}

const JUDGE_INSTRUCTION = `${EVALUATOR_PROMPT}

Score the following transcript. Respond with ONLY a single JSON object matching the output schema above. No prose, no markdown fences.`;

/**
 * Run an LLM judge evaluation on a LabView using the browser /api/llm-judge
 * proxy. Returns null if the model output can't be parsed or the call fails.
 */
export async function runBrowserJudge(view: LabView): Promise<EvalResult | null> {
  try {
    const user = formatTranscriptForJudge(view);
    const res = await fetch(apiPath("api/llm-judge"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system: JUDGE_INSTRUCTION, user }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string };
    return data.content ? parseJudgeOutput(data.content, view.id) : null;
  } catch {
    return null;
  }
}
