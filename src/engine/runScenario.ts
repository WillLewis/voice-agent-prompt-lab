import type { Agent, RunMode, RunResult, Scenario } from "./types";
import { runConversation } from "./conversationRunner";
import { evaluateRun } from "../evals/evaluator";

// Orchestrates a full run: drive the conversation, then score it. Shared by the
// CLI eval runner and the UI so both produce identical RunResults.

export async function runScenario(
  scenario: Scenario,
  agent: Agent,
  customerScript: string[],
  mode: RunMode,
): Promise<RunResult> {
  const trace = await runConversation(scenario, agent, customerScript);
  const evaluation = evaluateRun(scenario, trace);
  return { ...trace, scenarioId: scenario.id, mode, evaluation };
}
