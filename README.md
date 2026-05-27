# Liberate Prompt Lab

A lightweight, local-first prompt lab for designing and evaluating an **insurance voice agent** across claims intake, policy servicing, escalation, and adversarial scenarios.

This is an interview demo, not production telephony. The point is that reliable voice automation is not just a clever prompt — it's **prompt + conversation state + tool contracts + guardrails + escalation policy + evals**. The app makes that reasoning layer visible: pick a scenario, run it, and inspect the transcript, tool calls, system prompt, and a pass/fail/warn scorecard.

## Quick start

```bash
npm install
npm run dev        # http://localhost:8080
```

Other scripts:

```bash
npm run test       # Vitest unit tests (engine, tools, evaluator)
npm run eval       # CLI: run all scenarios, print scorecards, exit non-zero on any failure
npm run eval:llm   # Optional live-model eval with pass-rate and fallback thresholds
npm run build      # production build (client + SSR)
npm run typecheck  # tsc --noEmit
```

Requires Node 20+. The demo works with **no API keys**.

## Scenarios

| Scenario | What it tests |
| --- | --- |
| Routine Auto FNOL | Verify identity → look up policy → collect required fields → create claim → summarize |
| Injury Escalation FNOL | Acknowledge injury, collect minimal context, escalate to a human quickly, no auto-claim |
| Policy Servicing: Add Vehicle | Verify identity → collect vehicle details → create a *draft* change → explain licensed review |
| Coverage Guarantee Trap | Refuse to guarantee coverage; defer to an adjuster; escalate on a persistent dispute |
| Prompt Injection / Override | Don't reveal instructions, don't skip verification; redirect or escalate |
| Lapsed Policy FNOL Attempt | Verify identity → detect lapsed status → refuse claim creation → escalate |

## How it works

```
React UI (TanStack Start)
  → adapter (domain model → display model)
    → conversation runner (agent-agnostic, scripted/simulated caller side)
        → agent: deterministic (default) | LLM (optional)
        → caller: scripted queue | deterministic simulator | LLM caller
        → optional failure-mode demo agents
        → mock tools: verifyIdentity, lookupPolicy, createClaim, updatePolicyDraft, escalateToHuman
    → evaluator (rule-based rubric) → scorecard
```

- **Deterministic mode (default)** produces realistic, reproducible transcripts entirely in the browser — no network, so the demo always works.
- **Structured scenario facts** drive caller behavior and expected outcomes: identity answers, loss/servicing facts, required tool arguments, forbidden tools, acceptable terminal states, and escalation reasons live in `src/data/scenarios.ts`.
- **The evaluator** runs rule-based checks over the transcript + tool trace (identity-before-lookup, required-fields-before-claim, no coverage guarantee, no legal advice, one-question-per-turn, injury escalation, prompt-injection resistance, final summary, empathy, no prompt leak, scenario tool contract, required tool args, terminal state, escalation reason, licensed review language, state transitions, lapsed-policy behavior, and ASR repair). `npm run eval` doubles as a **regression gate** for prompt changes.
- **Failure-mode demo agents** intentionally break one safety/workflow rule at a time (coverage guarantee, policy lookup before verification, missing fields before claim creation, injury over-automation, prompt leakage), so the scorecard can demonstrate regression detection without live API keys.
- **Prompt iteration is inspectable**: save labeled prompt versions, compare line-level diffs against the baseline or any saved version, and track score deltas from baseline after eval runs.
- **The mock tools do not hide sequencing rules** — e.g. `lookupPolicy` will run even without prior verification. Enforcing the order is the agent's job and catching violations is the evaluator's job, which keeps failure modes visible.

## Optional LLM mode

LLM mode is off by default. To enable it:

```bash
cp .dev.vars.example .dev.vars     # then add ANTHROPIC_API_KEY (or OPENAI_API_KEY)
npm run dev
```

The key is read **server-side** by a small Vite dev middleware (`/api/llm`, `/api/llm-status`) and never reaches the browser. The UI toggle enables itself when a key is detected. The LLM agent reuses the same scenarios, prompt, tools, and evaluator; its structured output is Zod-validated and falls back to the deterministic agent on any error. Never commit `.dev.vars`.

For prompt regression checks against a live model, run `npm run eval:llm -- --samples 5`. The runner fails when any rubric falls below the weighted pass-rate threshold (`--threshold`, default `0.8`) or when any model turn falls back to the deterministic script (`--max-fallback-rate`, default `0`).

## Project structure

```
src/
  routes/          TanStack Start routes (index = the dashboard)
  components/lab/  UI: ScenarioList, TranscriptPanel, InspectorTabs, StatusBadge
  engine/          types, stateMachine, mockTools, deterministicAgent,
                   deterministicCaller, llmCaller, conversationRunner,
                   runScenario, llmClient, llmAgent
  evals/           rubric, assertions, evaluator, runAll (CLI)
  data/            scenarios, mockCustomers, mockPolicies, scenarioScripts
  prompts/         insuranceVoiceAgentPrompt, evaluatorPrompt
  lab/             types, adapter, run (engine ⇄ UI bridge)
  server/          llmMiddleware (dev-only LLM proxy)
tests/             evaluator, mockTools, stateMachine
```

The `engine`, `evals`, `data`, and `prompts` layers are framework-agnostic (no React/Vite imports), so they run under Vitest and the `tsx` CLI as well as in the browser.

## Constraints

Local-first and synthetic data only. No real PII, carrier APIs, telephony, ASR/TTS, database, or auth. In production, those layers would wrap this reasoning layer — this lab isolates the part the prompting interview is actually about.

## What this demonstrates

- Translating an insurance use case into promptable agent behavior.
- Voice-agent constraints: short turns, one question at a time, confirmation, repair, escalation.
- Safe tool sequencing and mock system integration.
- Evaluating prompts with deterministic checks, not vibes — and preventing regressions.
- Knowing where prompt engineering ends and production architecture begins.
```
