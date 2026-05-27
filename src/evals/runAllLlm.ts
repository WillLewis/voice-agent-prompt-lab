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
// fixed deterministic golden transcripts and so CANNOT detect a prompt change),
// this runs the CURRENT system prompt through the live model and scores its
// actual behavior. It calls the provider directly (no dev server / /api/llm
// proxy needed), so it works from CI.
//
// Usage:
//   npm run eval:llm                              # all scenarios, 1 sample
//   npm run eval:llm -- injury-escalation         # one scenario, 1 sample
//   npm run eval:llm -- --samples 5               # all scenarios, 5 samples each
//   npm run eval:llm -- injury-escalation --samples 5 --threshold 0.8
//   LPL_PROMPT_FILE=/tmp/p.txt npm run eval:llm   # eval a candidate prompt
//
// --samples N     : run each scenario N times and report pass-rate per check
// --threshold T   : exit non-zero if overall pass-rate is below T (0-1, default 0.5)

const SYMBOL: Record<EvalStatus, string> = { pass: "✓", warn: "⚠", fail: "✗" };

function parseArgs(argv: string[]): {
  scenarioIds: string[];
  samples: number;
  threshold: number;
} {
  const scenarioIds: string[] = [];
  let samples = 1;
  let threshold = 0.5;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--samples" && argv[i + 1]) {
      samples = Math.max(1, parseInt(argv[++i], 10) || 1);
    } else if (argv[i] === "--threshold" && argv[i + 1]) {
      threshold = Math.max(0, Math.min(1, parseFloat(argv[++i]) || 0.5));
    } else if (!argv[i].startsWith("--")) {
      scenarioIds.push(argv[i]);
    }
  }
  return { scenarioIds, samples, threshold };
}

async function main(): Promise<void> {
  const sel = selectProvider(loadEnvKeys(process.cwd()));
  if (!sel) {
    console.error(
      "eval:llm needs an API key. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .dev.vars (or the env).",
    );
    process.exit(2);
  }

  const { scenarioIds, samples, threshold } = parseArgs(process.argv.slice(2));

  // Show WHERE the key came from (value redacted). A real env var overrides the
  // .dev.vars file, so a stale export can mask a good file key — and vice versa.
  const keyEnvVar = sel.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const keySource = process.env[keyEnvVar] ? "shell env (overrides .dev.vars)" : ".dev.vars file";
  console.log(`\n[eval:llm] provider=${sel.provider} model=${sel.model} · key source: ${keySource}`);
  if (samples > 1) {
    console.log(`[eval:llm] samples=${samples} per scenario · threshold=${threshold}`);
  }

  // Preflight: surface the REAL provider error (bad key, no credits, rate limit,
  // network) up front, instead of letting it hide behind the agent's silent
  // per-turn fallback and surface only as a generic "model never reached".
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

  const scenarios =
    scenarioIds.length > 0
      ? scenarioIds.map((id) => SCENARIOS_BY_ID[id]).filter(Boolean)
      : SCENARIOS;

  if (scenarioIds.length > 0 && scenarios.length === 0) {
    console.error(
      `Unknown scenario id(s): ${scenarioIds.join(", ")}. Known: ${SCENARIOS.map((s) => s.id).join(", ")}`,
    );
    process.exit(2);
  }

  const promptFile = process.env.LPL_PROMPT_FILE;
  const systemPrompt =
    promptFile && existsSync(promptFile) ? readFileSync(promptFile, "utf8") : INSURANCE_VOICE_AGENT_PROMPT;

  console.log(`\n=== Liberate Prompt Lab — LLM Evaluation (${sel.provider}:${sel.model}) ===`);
  console.log(`Prompt: ${promptFile && existsSync(promptFile) ? promptFile : "default (insuranceVoiceAgentPrompt.ts)"}`);
  if (samples === 1) {
    console.log("Non-deterministic: each scenario is one live sample. Use --samples N for pass-rate aggregation.\n");
  } else {
    console.log(`Multi-sample: ${samples} runs × ${scenarios.length} scenario(s) = ${samples * scenarios.length} total runs.\n`);
  }

  const agent = makeAgentWithCaller(systemPrompt, (system, user) => callProvider(sel, system, user));

  let globalAnyFail = false;
  let globalScoreSum = 0;
  let globalMaxSum = 0;
  let globalAgentTurns = 0;
  let globalFallbacks = 0;

  for (const scenario of scenarios) {
    if (samples === 1) {
      // --- Single-sample path (original behavior) ---
      const result = await runScenario(scenario, agent, SCENARIO_SCRIPTS[scenario.id] ?? [], "llm");
      const { evaluation } = result;
      globalScoreSum += evaluation.totalScore;
      globalMaxSum += evaluation.maxScore;

      const agentTurns = result.turns.filter((t) => t.speaker === "agent");
      const fellBack = agentTurns.filter((t) => t.source === "fallback").length;
      globalAgentTurns += agentTurns.length;
      globalFallbacks += fellBack;
      if (evaluation.items.some((i) => i.status === "fail")) globalAnyFail = true;

      const flag = fellBack ? `  (⚠ ${fellBack} turn(s) fell back to deterministic — model output rejected)` : "";
      console.log(`${scenario.title}  —  ${evaluation.totalScore}/${evaluation.maxScore}${flag}`);
      for (const i of evaluation.items) {
        const detail = i.status === "pass" ? "" : ` — ${i.rationale}`;
        console.log(`  ${SYMBOL[i.status]} ${i.label}${detail}`);
      }
      console.log("");
    } else {
      // --- Multi-sample path (Item 2) ---
      // Track pass/warn/fail counts per rubric id across N runs.
      const passCount: Record<string, number> = {};
      const warnCount: Record<string, number> = {};
      const failCount: Record<string, number> = {};
      let sampleFallbacks = 0;
      let sampleAgentTurns = 0;
      let firstItems: typeof globalAnyFail extends boolean ? typeof globalAnyFail : never = false as never;
      firstItems; // suppress unused warning
      let rubricLabels: Record<string, string> = {};

      for (let s = 0; s < samples; s++) {
        const result = await runScenario(scenario, agent, SCENARIO_SCRIPTS[scenario.id] ?? [], "llm");
        const { evaluation } = result;

        for (const item of evaluation.items) {
          rubricLabels[item.id] = item.label;
          if (item.status === "pass") passCount[item.id] = (passCount[item.id] ?? 0) + 1;
          else if (item.status === "warn") warnCount[item.id] = (warnCount[item.id] ?? 0) + 1;
          else failCount[item.id] = (failCount[item.id] ?? 0) + 1;
        }

        const agentTurns = result.turns.filter((t) => t.speaker === "agent");
        sampleFallbacks += agentTurns.filter((t) => t.source === "fallback").length;
        sampleAgentTurns += agentTurns.length;

        // Accumulate global score (average across samples).
        globalScoreSum += evaluation.totalScore / samples;
        globalMaxSum += evaluation.maxScore / samples;
      }

      globalAgentTurns += sampleAgentTurns;
      globalFallbacks += sampleFallbacks;

      const fallbackNote = sampleFallbacks > 0 ? `  ⚠ ${sampleFallbacks}/${sampleAgentTurns} agent turns fell back` : "";
      console.log(`${scenario.title}  (${samples} samples)${fallbackNote}`);

      // Per-check pass rate.
      const rubricIds = Object.keys(rubricLabels);
      let scenarioBelowThreshold = false;
      for (const id of rubricIds) {
        const p = passCount[id] ?? 0;
        const w = warnCount[id] ?? 0;
        const f = failCount[id] ?? 0;
        // Weighted rate: pass=1, warn=0.5, fail=0.
        const rate = (p + w * 0.5) / samples;
        const pct = Math.round(rate * 100);
        const sym = rate === 1 ? "✓" : rate >= threshold ? "⚠" : "✗";
        if (rate < threshold) {
          scenarioBelowThreshold = true;
          globalAnyFail = true;
        }
        if (f > 0 && rate === 0) globalAnyFail = true;
        console.log(`  ${sym} ${rubricLabels[id]}  ${pct}% (${p}✓ ${w}⚠ ${f}✗ / ${samples})`);
      }
      if (scenarioBelowThreshold) {
        console.log(`  → At least one check below threshold (${Math.round(threshold * 100)}%)`);
      }
      console.log("");
    }
  }

  if (samples === 1) {
    console.log(`Overall: ${Math.round(globalScoreSum * 10) / 10}/${globalMaxSum}`);
  } else {
    const avgScore = globalScoreSum;
    const avgMax = globalMaxSum;
    console.log(`Overall (avg across samples): ${Math.round(avgScore * 10) / 10}/${Math.round(avgMax)}`);
    console.log(`Threshold: ${Math.round(threshold * 100)}% pass-rate required per check.`);
  }

  // If EVERY turn fell back, the model was never actually reached (bad key,
  // network, etc.). The scores then reflect the deterministic golden transcript,
  // not the prompt — so do not report a misleading PASS.
  if (globalAgentTurns > 0 && globalFallbacks === globalAgentTurns) {
    console.log(
      "\nRESULT: ERROR — the live model was never reached; every turn fell back to the deterministic script.",
    );
    console.log(
      "These scores reflect the golden transcript, NOT your prompt. Check the API key in .dev.vars / env and network.\n",
    );
    process.exit(2);
  }

  console.log(
    globalAnyFail
      ? "RESULT: FAIL — at least one check failed or fell below the threshold.\n"
      : "RESULT: PASS — within policy on this sample.\n",
  );
  process.exit(globalAnyFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
