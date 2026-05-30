import { existsSync, readFileSync } from "node:fs";
import { SCENARIOS, SCENARIOS_BY_ID } from "../data/scenarios";
import { SCENARIO_SCRIPTS } from "../data/scenarioScripts";
import { makeAgentWithCaller } from "../engine/llmAgent";
import { runScenario } from "../engine/runScenario";
import { selectProvider, callProvider } from "../engine/llmClient";
import { loadEnvKeys } from "../server/envKeys";
import { INSURANCE_VOICE_AGENT_PROMPT } from "../prompts/insuranceVoiceAgentPrompt";
import type { EvalStatus } from "../engine/types";

// LLM eval runner (`npm run eval:llm`). Unlike `npm run eval` (which scores the
// fixed deterministic golden transcripts and so cannot detect a prompt change),
// this runs the current system prompt through the live model and scores its
// actual behavior. It calls the provider directly, so it does not need the Vite
// dev server or a browser.
//
// Usage:
//   npm run eval:llm
//   npm run eval:llm -- injury-escalation
//   npm run eval:llm -- --samples 5
//   npm run eval:llm -- injury-escalation --samples 5 --threshold 0.9
//   npm run eval:llm -- --samples 5 --max-fallback-rate 0
//   LPL_PROMPT_FILE=/tmp/p.txt npm run eval:llm
//
// --samples N            Run each scenario N times.
// --threshold T          Minimum weighted pass-rate per check and overall.
//                        Pass=1, warn=0.5, fail=0. Default: 0.8.
// --max-fallback-rate R  Maximum accepted live-model fallback rate. Default: 0.

const SYMBOL: Record<EvalStatus, string> = { pass: "✓", warn: "⚠", fail: "✗" };
const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_MAX_FALLBACK_RATE = 0;

type CliOptions = {
  scenarioIds: string[];
  samples: number;
  threshold: number;
  maxFallbackRate: number;
};

type CriterionStats = {
  label: string;
  pass: number;
  warn: number;
  fail: number;
  rationales: string[];
};

type ScenarioAggregate = {
  title: string;
  scoreSum: number;
  maxScoreSum: number;
  agentTurns: number;
  fallbacks: number;
  criterionOrder: string[];
  criteria: Record<string, CriterionStats>;
};

function parseArgs(argv: string[]): CliOptions {
  const scenarioIds: string[] = [];
  let samples = 1;
  let threshold = DEFAULT_THRESHOLD;
  let maxFallbackRate = DEFAULT_MAX_FALLBACK_RATE;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--samples" && argv[i + 1]) {
      samples = Math.max(1, Number.parseInt(argv[++i], 10) || 1);
    } else if (arg === "--threshold" && argv[i + 1]) {
      threshold = parseBoundedRate(argv[++i], DEFAULT_THRESHOLD);
    } else if (arg === "--max-fallback-rate" && argv[i + 1]) {
      maxFallbackRate = parseBoundedRate(argv[++i], DEFAULT_MAX_FALLBACK_RATE);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      scenarioIds.push(arg);
    }
  }

  return { scenarioIds, samples, threshold, maxFallbackRate };
}

function parseBoundedRate(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const sel = selectProvider(loadEnvKeys(process.cwd()));
  if (!sel) {
    console.error(
      "eval:llm needs an API key. Add ANTHROPIC_API_KEY to .dev.vars (or the env).",
    );
    process.exit(2);
  }

  const { scenarioIds, samples, threshold, maxFallbackRate } = options;

  const keySource = process.env.ANTHROPIC_API_KEY
    ? "shell env (overrides .dev.vars)"
    : ".dev.vars file";
  console.log(`\n[eval:llm] provider=${sel.provider} model=${sel.model} · key source: ${keySource}`);
  console.log(
    `[eval:llm] samples=${samples} · threshold=${percent(threshold)} · max fallback=${percent(maxFallbackRate)}`,
  );

  try {
    await callProvider(sel, "You are a connectivity check.", "Reply with the single word OK.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\nLLM preflight failed — could not reach ${sel.provider}:\n  ${msg}\n`);
    if (/credit|billing|balance|quota|payment/i.test(msg)) {
      console.error("→ Diagnosis: billing/credits — the account balance is too low or unpaid.");
    } else if (/invalid x-api-key|authentication|unauthor|\b401\b/i.test(msg)) {
      console.error("→ Diagnosis: invalid or wrong API key.");
    } else if (/rate.?limit|overloaded|\b429\b|\b529\b/i.test(msg)) {
      console.error("→ Diagnosis: rate limited or overloaded — retry shortly.");
    } else {
      console.error("→ Diagnosis: network or unknown error.");
    }
    console.error("");
    process.exit(2);
  }

  const unknownScenarioIds = scenarioIds.filter((id) => !SCENARIOS_BY_ID[id]);
  if (unknownScenarioIds.length > 0) {
    console.error(
      `Unknown scenario id(s): ${unknownScenarioIds.join(", ")}. Known: ${SCENARIOS.map((s) => s.id).join(", ")}`,
    );
    process.exit(2);
  }

  const scenarios =
    scenarioIds.length > 0 ? scenarioIds.map((id) => SCENARIOS_BY_ID[id]) : SCENARIOS;

  const promptFile = process.env.LPL_PROMPT_FILE;
  if (promptFile && !existsSync(promptFile)) {
    console.error(`Prompt file does not exist: ${promptFile}`);
    process.exit(2);
  }
  const systemPrompt = promptFile ? readFileSync(promptFile, "utf8") : INSURANCE_VOICE_AGENT_PROMPT;

  console.log(`\n=== Insurtech Prompt Lab — LLM Evaluation (${sel.provider}:${sel.model}) ===`);
  console.log(`Prompt: ${promptFile ?? "default (insuranceVoiceAgentPrompt.ts)"}`);
  console.log(
    samples === 1
      ? "Single sample: strict threshold still applies. Use --samples N to measure stochastic reliability.\n"
      : `Multi-sample: ${samples} runs × ${scenarios.length} scenario(s) = ${samples * scenarios.length} total runs.\n`,
  );

  const agent = makeAgentWithCaller(systemPrompt, (system, user) => callProvider(sel, system, user));

  let globalScoreSum = 0;
  let globalMaxScoreSum = 0;
  let globalAgentTurns = 0;
  let globalFallbacks = 0;
  let globalWeightedChecks = 0;
  let globalCheckSamples = 0;
  let belowThreshold = false;

  for (const scenario of scenarios) {
    const aggregate = createAggregate(scenario.title);

    for (let sample = 0; sample < samples; sample++) {
      const result = await runScenario(scenario, agent, SCENARIO_SCRIPTS[scenario.id] ?? [], "llm");
      const { evaluation } = result;

      aggregate.scoreSum += evaluation.totalScore;
      aggregate.maxScoreSum += evaluation.maxScore;

      for (const item of evaluation.items) {
        recordCriterion(aggregate, item.id, item.label, item.status, item.rationale);
        globalWeightedChecks += statusWeight(item.status);
        globalCheckSamples += 1;
      }

      const agentTurns = result.turns.filter((turn) => turn.speaker === "agent");
      aggregate.agentTurns += agentTurns.length;
      aggregate.fallbacks += agentTurns.filter((turn) => turn.source === "fallback").length;
    }

    globalScoreSum += aggregate.scoreSum;
    globalMaxScoreSum += aggregate.maxScoreSum;
    globalAgentTurns += aggregate.agentTurns;
    globalFallbacks += aggregate.fallbacks;

    if (printAggregate(aggregate, samples, threshold)) {
      belowThreshold = true;
    }
  }

  const averageScore = globalScoreSum / samples;
  const averageMaxScore = globalMaxScoreSum / samples;
  const overallPassRate = globalCheckSamples > 0 ? globalWeightedChecks / globalCheckSamples : 0;
  const fallbackRate = globalAgentTurns > 0 ? globalFallbacks / globalAgentTurns : 0;
  const fallbackExceeded = fallbackRate > maxFallbackRate;
  const overallBelowThreshold = overallPassRate < threshold;

  console.log(`Overall score (avg suite): ${round1(averageScore)}/${round1(averageMaxScore)}`);
  console.log(`Overall weighted pass-rate: ${percent(overallPassRate)} (threshold ${percent(threshold)})`);
  console.log(`Fallback rate: ${globalFallbacks}/${globalAgentTurns} turns (${percent(fallbackRate)})`);

  if (globalAgentTurns > 0 && globalFallbacks === globalAgentTurns) {
    console.log(
      "\nRESULT: ERROR — the live model was never reached; every turn fell back to the deterministic script.",
    );
    console.log(
      "These scores reflect the golden transcript, not your prompt. Check the API key in .dev.vars / env and network.\n",
    );
    process.exit(2);
  }

  if (fallbackExceeded) {
    console.log(
      `\nRESULT: FAIL — fallback rate exceeded the configured maximum (${percent(maxFallbackRate)}).`,
    );
    process.exit(1);
  }

  if (belowThreshold || overallBelowThreshold) {
    console.log("\nRESULT: FAIL — at least one check or the overall pass-rate fell below threshold.\n");
    process.exit(1);
  }

  console.log("\nRESULT: PASS — all checks met the configured LLM reliability threshold.\n");
  process.exit(0);
}

function createAggregate(title: string): ScenarioAggregate {
  return {
    title,
    scoreSum: 0,
    maxScoreSum: 0,
    agentTurns: 0,
    fallbacks: 0,
    criterionOrder: [],
    criteria: {},
  };
}

function recordCriterion(
  aggregate: ScenarioAggregate,
  id: string,
  label: string,
  status: EvalStatus,
  rationale: string,
): void {
  if (!aggregate.criteria[id]) {
    aggregate.criteria[id] = { label, pass: 0, warn: 0, fail: 0, rationales: [] };
    aggregate.criterionOrder.push(id);
  }

  aggregate.criteria[id][status] += 1;
  if (status !== "pass" && rationale && aggregate.criteria[id].rationales.length < 3) {
    aggregate.criteria[id].rationales.push(rationale);
  }
}

function printAggregate(
  aggregate: ScenarioAggregate,
  samples: number,
  threshold: number,
): boolean {
  const avgScore = aggregate.scoreSum / samples;
  const avgMax = aggregate.maxScoreSum / samples;
  const fallbackNote =
    aggregate.fallbacks > 0
      ? `  (⚠ ${aggregate.fallbacks}/${aggregate.agentTurns} agent turns fell back)`
      : "";
  console.log(`${aggregate.title}  —  ${round1(avgScore)}/${round1(avgMax)}${fallbackNote}`);

  let scenarioBelowThreshold = false;
  for (const id of aggregate.criterionOrder) {
    const stats = aggregate.criteria[id];
    const rate = (stats.pass + stats.warn * 0.5) / samples;
    const status = displayStatus(rate, threshold);
    if (rate < threshold) scenarioBelowThreshold = true;

    if (samples === 1) {
      const rationale = stats.rationales[0] ? ` — ${stats.rationales[0]}` : "";
      console.log(`  ${SYMBOL[status]} ${stats.label} (${percent(rate)})${rationale}`);
    } else {
      const counts = `${stats.pass}✓ ${stats.warn}⚠ ${stats.fail}✗ / ${samples}`;
      console.log(`  ${SYMBOL[status]} ${stats.label}  ${percent(rate)} (${counts})`);
      if (stats.rationales.length > 0) {
        console.log(`    ${stats.rationales[0]}`);
      }
    }
  }

  if (scenarioBelowThreshold) {
    console.log(`  → At least one check below threshold (${percent(threshold)})`);
  }
  console.log("");
  return scenarioBelowThreshold;
}

function displayStatus(rate: number, threshold: number): EvalStatus {
  if (rate >= 1) return "pass";
  if (rate >= threshold) return "warn";
  return "fail";
}

function statusWeight(status: EvalStatus): number {
  if (status === "pass") return 1;
  if (status === "warn") return 0.5;
  return 0;
}

function round1(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
