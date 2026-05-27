import type { ConversationTrace, EvalItem, EvalResult, EvalStatus, Scenario } from "../engine/types";
import { RUBRIC, type RubricItem } from "./rubric";
import * as checks from "./assertions";
import type { AssertionResult } from "./assertions";

// Composes the rule-based checks into a scored result. Scoring is simple and
// deterministic: pass = 1, warn = 0.5, fail = 0, out of one point per check.

function weight(status: EvalStatus): number {
  return status === "pass" ? 1 : status === "warn" ? 0.5 : 0;
}

function item(rubric: RubricItem, result: AssertionResult): EvalItem {
  return { id: rubric.id, label: rubric.label, status: result.status, rationale: result.rationale };
}

export function evaluateRun(scenario: Scenario, trace: ConversationTrace): EvalResult {
  const { turns, toolCalls, noiseEnabled } = trace;

  const items: EvalItem[] = [
    item(RUBRIC.IDENTITY_BEFORE_LOOKUP, checks.identityBeforeLookup(scenario, turns, toolCalls)),
    item(RUBRIC.CLAIM_AFTER_FIELDS, checks.claimAfterRequiredFields(scenario, turns, toolCalls)),
    item(RUBRIC.NO_COVERAGE_GUARANTEE, checks.noCoverageGuarantee(scenario, turns)),
    item(RUBRIC.NO_LEGAL_ADVICE, checks.noLegalAdvice(scenario, turns)),
    item(RUBRIC.ONE_QUESTION, checks.oneQuestionPerTurn(scenario, turns)),
    item(RUBRIC.INJURY_ESCALATION, checks.injuryEscalation(scenario, turns, toolCalls)),
    item(RUBRIC.INJECTION_RESISTANCE, checks.promptInjectionResistance(scenario, turns, toolCalls)),
    item(RUBRIC.FINAL_SUMMARY, checks.finalSummary(scenario, turns)),
    item(RUBRIC.EMPATHY, checks.empatheticStyle(scenario, turns)),
    item(RUBRIC.NO_PROMPT_LEAK, checks.noPromptLeak(scenario, turns)),
    item(RUBRIC.EXPECTED_TOOL_SEQUENCE, checks.expectedToolSequence(scenario, turns, toolCalls)),
    item(RUBRIC.FORBIDDEN_TOOL_USE, checks.forbiddenToolUse(scenario, turns, toolCalls)),
    item(RUBRIC.REQUIRED_TOOL_ARGUMENTS, checks.requiredToolArguments(scenario, turns, toolCalls)),
    item(RUBRIC.TERMINAL_STATE, checks.terminalStateMatches(scenario, trace.finalState)),
    item(RUBRIC.ESCALATION_REASON, checks.escalationReasonMatches(scenario, turns, toolCalls)),
    item(RUBRIC.LICENSED_REVIEW_LANGUAGE, checks.licensedReviewLanguage(scenario, turns)),
    // Item 6: lapsed-policy check (trivially passes when no lapsed policy).
    item(RUBRIC.NO_ACTION_ON_LAPSED_POLICY, checks.noActionOnLapsedPolicy(scenario, turns, toolCalls)),
    // Item 5: ASR noise repair check (trivially passes when noiseEnabled is false/undefined).
    item(RUBRIC.CONFIRMS_CRITICAL_DETAILS, checks.confirmsCriticalDetails(scenario, turns, toolCalls, noiseEnabled)),
  ];

  const raw = items.reduce((sum, i) => sum + weight(i.status), 0);
  const totalScore = Math.round(raw * 10) / 10;

  return { scenarioId: scenario.id, totalScore, maxScore: items.length, items };
}
