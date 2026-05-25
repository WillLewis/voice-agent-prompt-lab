import type { RunMode } from "../engine/types";
import { SCENARIOS, SCENARIOS_BY_ID } from "../data/scenarios";
import { SCENARIO_SCRIPTS } from "../data/scenarioScripts";
import { deterministicAgent } from "../engine/deterministicAgent";
import { runScenario } from "../engine/runScenario";
import { mapRunToLabView } from "./adapter";
import type { LabView } from "./types";

// Runs a scenario in the browser and returns a display-ready LabView. The
// deterministic agent runs entirely client-side (instant, no network). LLM mode
// is wired in src/engine/llmAgent.ts and selected here once available.

export async function runLab(scenarioId: string, mode: RunMode = "deterministic"): Promise<LabView> {
  const scenario = SCENARIOS_BY_ID[scenarioId];
  let agent = deterministicAgent;
  if (mode === "llm") {
    // Lazy-load so the LLM path (and its fetch usage) is only pulled in on demand.
    const { llmAgent } = await import("../engine/llmAgent");
    agent = llmAgent;
  }
  const run = await runScenario(scenario, agent, SCENARIO_SCRIPTS[scenarioId] ?? [], mode);
  return mapRunToLabView(scenario, run);
}

/** Runs every scenario deterministically — used to seed the dashboard on load. */
export async function runAllDeterministic(): Promise<Record<string, LabView>> {
  const entries = await Promise.all(
    SCENARIOS.map(async (s) => [s.id, await runLab(s.id, "deterministic")] as const),
  );
  return Object.fromEntries(entries);
}
