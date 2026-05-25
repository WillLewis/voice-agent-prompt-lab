# Liberate Prompt Lab — Build Plan

A single-page React/Tailwind dashboard for an internal prompt + evaluation lab for an insurance voice agent. Static data only, no backend, no auth, no integrations.

## Scaffold

- Create a `web_app` artifact (TanStack Start + Tailwind, the standard template).
- No Lovable Cloud. No Supabase. No API keys.

## Visual direction

Modern enterprise AI tooling — think Linear / Vercel / OpenAI Playground:
- Neutral slate background, white cards, thin borders, subtle shadows
- Mono font for prompts, tool JSON, and IDs; sans for UI
- Semantic badge colors: pass = emerald, warn = amber, fail = rose, neutral state = slate
- Generous spacing, no gradients, no marketing flourishes, no consumer-insurance imagery

## Layout

Single page, full-height 3-column grid:

```text
┌──────────────┬──────────────────────────┬───────────────────────┐
│ Scenarios    │ Transcript               │ Inspector tabs        │
│ (left, 260)  │ (center, fluid)          │ (right, 420)          │
└──────────────┴──────────────────────────┴───────────────────────┘
```

Top bar: app name "Liberate Prompt Lab", small subtitle "Insurance Voice Agent — Eval Harness", model/version chip, run-status chip.

### Left — Scenario selector
Vertical list of 5 cards, selected state highlighted:
1. Routine Auto FNOL
2. Injury Escalation FNOL
3. Add Vehicle — Policy Servicing
4. Coverage Guarantee Trap
5. Prompt Injection Attempt

Each card shows: title, one-line intent, risk tag (Low / High / Adversarial), last-eval badge (pass/warn/fail).

### Center — Simulated transcript
- Scenario header: title, persona summary, current call state badge ("Intake", "Verification", "Triage", "Handoff", "Resolved").
- Turn list alternating Customer / Agent bubbles. Agent bubbles tagged "Voice Agent" with empathetic copy (no scripted-bot tone). Customer bubbles use fictional placeholder names only.
- Inline state-transition chips between turns (e.g. "→ identity_verified", "→ tool: lookup_policy").
- Footer: disabled "Replay" / "Step" / "Reset" controls for visual completeness.

### Right — Inspector (Tabs)
Tabs (shadcn Tabs):
1. **System Prompt** — mono code card with the prompt for the active scenario, copy button, token-count chip.
2. **Tool Calls** — vertical list of tool invocations, each as a distinct card with a wrench icon, tool name pill, args JSON, result JSON, latency + status badge. Visually different from chat (left accent border, mono font, tinted background).
3. **Evaluation Scorecard** — rubric table: criterion / score / pass-fail-warn badge / note. Overall score header at top.
4. **Architecture Notes** — short markdown-style notes: components, state machine, guardrails, eval methodology.

## Data shape (static placeholders, easy to swap later)

`src/data/scenarios.ts` exports typed array:

```ts
type Scenario = {
  id: string;
  title: string;
  intent: string;
  risk: "low" | "high" | "adversarial";
  state: "intake" | "verification" | "triage" | "handoff" | "resolved";
  systemPrompt: string;
  transcript: Turn[];
  toolCalls: ToolCall[];
  scorecard: ScoreRow[];
  architectureNotes: string;
  lastEval: "pass" | "warn" | "fail";
};
```

All five scenarios populated with realistic but clearly-fictional content. No real PII, no real policy numbers (use `POL-DEMO-####`).

## Components

- `AppShell` — top bar + 3-col grid
- `ScenarioList` + `ScenarioCard`
- `TranscriptPanel`, `TurnBubble`, `StateChip`
- `InspectorTabs` wrapping `SystemPromptView`, `ToolCallsView`, `ToolCallCard`, `ScorecardView`, `ArchitectureNotes`
- `Badge` variants: `pass | warn | fail | neutral | adversarial`

State: single `useState<string>` for active scenario id in the page component. No routing needed.

## Out of scope
- No real LLM calls, no streaming, no auth, no Supabase, no persistence
- No replay/step logic beyond disabled buttons
- No consumer-facing insurance portal styling
