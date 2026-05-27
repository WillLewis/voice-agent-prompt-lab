import type { Agent, Caller, RunMode } from "../engine/types";
import { SCENARIOS, SCENARIOS_BY_ID } from "../data/scenarios";
import { SCENARIO_SCRIPTS } from "../data/scenarioScripts";
import { deterministicAgent } from "../engine/deterministicAgent";
import { makeDeterministicCaller } from "../engine/deterministicCaller";
import { runScenario } from "../engine/runScenario";
import { INSURANCE_VOICE_AGENT_PROMPT } from "../prompts/insuranceVoiceAgentPrompt";
import { mapRunToLabView } from "./adapter";
import type { CallerMode, CallerPersona, LabView } from "./types";

// Runs a scenario in the browser and returns a display-ready LabView. The
// deterministic agent runs entirely client-side (instant, no network) and ignores
// the prompt (it is a fixed golden transcript). In LLM mode the supplied prompt
// is what actually drives the model, so editing it changes behavior and evals.

export interface RunLabOptions {
  mode?: RunMode;
  systemPrompt?: string;
  /** "scripted" = fixed queue; "simulated" = local caller; "live" = LLM caller. */
  callerMode?: CallerMode;
  /** Persona for simulated/live callers. Ignored when callerMode is "scripted". */
  callerPersona?: CallerPersona;
  /** Apply ASR noise to caller utterances (Item 5). */
  noiseEnabled?: boolean;
}

export async function runLab(
  scenarioId: string,
  {
    mode = "deterministic",
    systemPrompt = INSURANCE_VOICE_AGENT_PROMPT,
    callerMode = "scripted",
    callerPersona = "cooperative",
    noiseEnabled = false,
  }: RunLabOptions = {},
): Promise<LabView> {
  const scenario = SCENARIOS_BY_ID[scenarioId];
  let agent: Agent = deterministicAgent;
  let caller: Caller | undefined;

  if (callerMode === "simulated") {
    caller = makeDeterministicCaller(scenario.facts, callerPersona);
  }

  if (mode === "llm") {
    // Lazy-load so the LLM path (and its fetch usage) is only pulled in on demand.
    const { makeLlmAgent } = await import("../engine/llmAgent");
    agent = makeLlmAgent(systemPrompt);

    if (callerMode === "live") {
      const { makeBrowserLlmCaller } = await import("../engine/llmCaller");
      caller = makeBrowserLlmCaller(scenario.facts, callerPersona);
    }
  }

  const run = await runScenario(
    scenario,
    agent,
    SCENARIO_SCRIPTS[scenarioId] ?? [],
    mode,
    { caller, noiseEnabled },
  );

  // Show the prompt that actually ran (the edited one in LLM mode, the default otherwise).
  return mapRunToLabView(scenario, run, mode === "llm" ? systemPrompt : INSURANCE_VOICE_AGENT_PROMPT);
}

/** Runs every scenario deterministically — used to seed the dashboard on load. */
export async function runAllDeterministic(): Promise<Record<string, LabView>> {
  const entries = await Promise.all(
    SCENARIOS.map(async (s) => [s.id, await runLab(s.id, { mode: "deterministic" })] as const),
  );
  return Object.fromEntries(entries);
}
