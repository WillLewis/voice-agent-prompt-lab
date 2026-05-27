import { describe, expect, it } from "vitest";
import { makeFailureModeAgent } from "../src/engine/failureAgents";
import { runScenario } from "../src/engine/runScenario";
import { SCENARIOS_BY_ID } from "../src/data/scenarios";
import { RUBRIC } from "../src/evals/rubric";
import type { EvalResult, FailureModeId } from "../src/engine/types";

function status(ev: EvalResult, id: string) {
  return ev.items.find((item) => item.id === id)?.status;
}

async function runFailure(scenarioId: string, failureMode: Exclude<FailureModeId, "none">) {
  return runScenario(SCENARIOS_BY_ID[scenarioId], makeFailureModeAgent(failureMode), [], "deterministic");
}

describe("failure-mode demo agents", () => {
  it("lookup-before-verify trips identity and state-machine checks", async () => {
    const result = await runFailure("routine-fnol", "lookup-before-verify");
    expect(status(result.evaluation, RUBRIC.IDENTITY_BEFORE_LOOKUP.id)).toBe("fail");
    expect(status(result.evaluation, RUBRIC.STATE_TRANSITIONS.id)).toBe("fail");
  });

  it("missing-fields-claim trips required-field and tool-sequence checks", async () => {
    const result = await runFailure("routine-fnol", "missing-fields-claim");
    expect(status(result.evaluation, RUBRIC.CLAIM_AFTER_FIELDS.id)).toBe("fail");
    expect(status(result.evaluation, RUBRIC.EXPECTED_TOOL_SEQUENCE.id)).toBe("fail");
  });

  it("coverage-guarantee trips coverage and terminal-state checks", async () => {
    const result = await runFailure("coverage-trap", "coverage-guarantee");
    expect(status(result.evaluation, RUBRIC.NO_COVERAGE_GUARANTEE.id)).toBe("fail");
    expect(status(result.evaluation, RUBRIC.TERMINAL_STATE.id)).toBe("fail");
  });

  it("injury-overcollect trips injury escalation and forbidden tool checks", async () => {
    const result = await runFailure("injury-escalation", "injury-overcollect");
    expect(status(result.evaluation, RUBRIC.INJURY_ESCALATION.id)).toBe("fail");
    expect(status(result.evaluation, RUBRIC.FORBIDDEN_TOOL_USE.id)).toBe("fail");
  });

  it("prompt-leak trips leak and injection-resistance checks", async () => {
    const result = await runFailure("prompt-injection", "prompt-leak");
    expect(status(result.evaluation, RUBRIC.NO_PROMPT_LEAK.id)).toBe("fail");
    expect(status(result.evaluation, RUBRIC.INJECTION_RESISTANCE.id)).toBe("fail");
  });
});
