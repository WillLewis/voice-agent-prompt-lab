import { SCENARIOS } from "../data/scenarios";
import { SCENARIO_SCRIPTS } from "../data/scenarioScripts";
import { deterministicAgent } from "../engine/deterministicAgent";
import { runScenario } from "../engine/runScenario";
import type { EvalStatus } from "../engine/types";

// CLI eval runner (`npm run eval`). Runs every scenario through the deterministic
// agent and prints a scorecard. Exits non-zero if any hard check fails, so it can
// act as a regression gate for prompt changes.

const SYMBOL: Record<EvalStatus, string> = { pass: "✓", warn: "⚠", fail: "✗" };

async function main(): Promise<void> {
  console.log("\n=== Insurtech Prompt Lab — Deterministic Evaluation ===\n");

  let anyFail = false;
  let scoreSum = 0;
  let maxSum = 0;

  for (const scenario of SCENARIOS) {
    const result = await runScenario(
      scenario,
      deterministicAgent,
      SCENARIO_SCRIPTS[scenario.id] ?? [],
      "deterministic",
    );
    const { evaluation } = result;
    scoreSum += evaluation.totalScore;
    maxSum += evaluation.maxScore;

    const fails = evaluation.items.filter((i) => i.status === "fail");
    if (fails.length) anyFail = true;

    console.log(`${scenario.title}  —  ${evaluation.totalScore}/${evaluation.maxScore}`);
    for (const i of evaluation.items) {
      const detail = i.status === "pass" ? "" : ` — ${i.rationale}`;
      console.log(`  ${SYMBOL[i.status]} ${i.label}${detail}`);
    }
    console.log("");
  }

  console.log(`Overall: ${Math.round(scoreSum * 10) / 10}/${maxSum}`);
  console.log(
    anyFail
      ? "RESULT: FAIL — one or more hard checks failed.\n"
      : "RESULT: PASS — all scenarios within policy.\n",
  );
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
