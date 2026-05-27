import type { Agent, Caller, RunMode, RunResult, Scenario } from "./types";
import { runConversation } from "./conversationRunner";
import { evaluateRun } from "../evals/evaluator";

// Orchestrates a full run: drive the conversation, then score it. Shared by the
// CLI eval runner and the UI so both produce identical RunResults.

export interface RunScenarioOptions {
  /** Optional adaptive LLM caller (Item 1). Absent = scripted queue. */
  caller?: Caller;
  /** When true, caller utterances are perturbed with ASR-like noise (Item 5). */
  noiseEnabled?: boolean;
}

export async function runScenario(
  scenario: Scenario,
  agent: Agent,
  customerScript: string[],
  mode: RunMode,
  options: RunScenarioOptions = {},
): Promise<RunResult> {
  const trace = await runConversation(scenario, agent, customerScript, options);
  const evaluation = evaluateRun(scenario, trace);
  return { ...trace, scenarioId: scenario.id, mode, evaluation };
}
