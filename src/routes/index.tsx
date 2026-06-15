import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SCENARIOS } from "@/data/scenarios";
import { runLab, runAllDeterministic, runAllLab, type RunLabOptions } from "@/lab/run";
import { FAILURE_MODE_OPTIONS } from "@/engine/failureAgents";
import { INSURANCE_VOICE_AGENT_PROMPT } from "@/prompts/insuranceVoiceAgentPrompt";
import {
  DEFAULT_PROMPT_PRESET_ID,
  getPromptPreset,
  PROMPT_PRESETS,
  type PromptPresetId,
} from "@/prompts/promptPresets";
import type { LabView, ScenarioMeta, CallerMode, CallerPersona, RunAllSummary } from "@/lab/types";
import type { FailureModeId, RunMode } from "@/engine/types";
import { ScenarioList } from "@/components/lab/ScenarioList";
import { TranscriptPanel } from "@/components/lab/TranscriptPanel";
import { InspectorTabs } from "@/components/lab/InspectorTabs";
import { NeutralBadge } from "@/components/lab/StatusBadge";
import { Activity, Loader2, Volume2, VolumeX } from "lucide-react";
import { apiPath, getViteBasePath, withBasePath } from "@/lib/basePath";
import {
  canRunAll,
  isPublicDemoBuild,
  quotaFromUsage,
  readPublicLlmUsage,
  reservePublicLlmRun,
  writePublicLlmUsage,
} from "@/lab/publicDemo";

export const Route = createFileRoute("/")({
  component: Index,
});

const PERSONAS: { value: CallerPersona; label: string }[] = [
  { value: "cooperative", label: "Cooperative" },
  { value: "rushed", label: "Rushed" },
  { value: "confused", label: "Confused" },
  { value: "irate", label: "Irate" },
  { value: "evasive-adversarial", label: "Adversarial" },
];

function browserSessionStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function Index() {
  const [views, setViews] = useState<Record<string, LabView>>({});
  const [activeId, setActiveId] = useState(SCENARIOS[0].id);
  const [mode, setMode] = useState<RunMode>("deterministic");
  const [prompt, setPrompt] = useState(INSURANCE_VOICE_AGENT_PROMPT);
  const [promptPresetId, setPromptPresetId] =
    useState<PromptPresetId>(DEFAULT_PROMPT_PRESET_ID);
  const [running, setRunning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [llm, setLlm] = useState<{
    available: boolean;
    provider?: string | null;
    model?: string | null;
    publicDemo?: boolean;
    capabilities?: { agent: boolean; judge: boolean; liveCaller: boolean };
    reason?: string;
  }>({ available: false });
  const [llmLimitNotice, setLlmLimitNotice] = useState<string | null>(null);
  // Item 1: adaptive caller controls
  const [callerMode, setCallerMode] = useState<CallerMode>("scripted");
  const [callerPersona, setCallerPersona] = useState<CallerPersona>("cooperative");
  // Item 5: ASR noise toggle
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [failureMode, setFailureMode] = useState<FailureModeId>("none");
  const [runAllSummary, setRunAllSummary] = useState<RunAllSummary | null>(null);
  const [baselineScores, setBaselineScores] = useState<Record<string, string>>({});
  const [publicLlmUsage, setPublicLlmUsage] = useState(() =>
    readPublicLlmUsage(browserSessionStorage()),
  );

  // Seed the dashboard: run every scenario deterministically (instant, local).
  useEffect(() => {
    let cancelled = false;
    runAllDeterministic().then((v) => {
      if (!cancelled) {
        setViews(v);
        setBaselineScores(scoresFromViews(v));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect whether a server-side API key is configured (enables LLM mode).
  useEffect(() => {
    fetch(apiPath("api/llm-status"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.available === "boolean") setLlm(d);
      })
      .catch(() => {
        /* LLM status is best-effort; deterministic mode always works. */
      });
  }, []);

  const items: ScenarioMeta[] = useMemo(
    () =>
      SCENARIOS.map((s) => ({
        id: s.id,
        title: s.title,
        intent: s.intent,
        risk: s.risk,
        lastEval: views[s.id]?.lastEval ?? "pass",
      })),
    [views],
  );

  const activeView = views[activeId];
  const publicDemo = isPublicDemoBuild() || llm.publicDemo === true;
  const runAllAllowed = canRunAll(mode, publicDemo);
  const faviconHref = withBasePath(getViteBasePath(), "favicon.svg");
  const publicLlmQuota = useMemo(() => quotaFromUsage(publicLlmUsage), [publicLlmUsage]);
  const currentPresetRemaining = publicLlmQuota.remainingByPreset[promptPresetId];

  // Build the current-scores map for the Versions tab snapshot.
  const currentScores = useMemo(() => {
    return scoresFromViews(views);
  }, [views]);

  async function runActiveScenario(options: RunLabOptions = currentRunOptions()) {
    const consumesPublicLiveRun =
      publicDemo && options.mode === "llm" && (options.failureMode ?? failureMode) === "none";
    if (consumesPublicLiveRun && !reserveLiveRun(options.promptPresetId ?? promptPresetId)) {
      return;
    }
    setRunning(true);
    try {
      const v = await runLab(activeId, options);
      setViews((prev) => ({ ...prev, [activeId]: v }));
      setRunAllSummary(null);
    } finally {
      setRunning(false);
    }
  }

  async function handleRun() {
    await runActiveScenario();
  }

  function currentRunOptions(): RunLabOptions {
    return {
      mode,
      systemPrompt: prompt,
      callerMode,
      callerPersona,
      noiseEnabled,
      failureMode,
      publicDemo,
      promptPresetId,
    };
  }

  async function handleRunAll() {
    if (!runAllAllowed) {
      setLlmLimitNotice("Public LLM mode runs one scenario at a time to control model usage.");
      return;
    }
    setRunningAll(true);
    try {
      const before = views;
      const next = await runAllLab(currentRunOptions());
      setViews(next);
      setRunAllSummary(
        buildRunAllSummary(
          before,
          next,
          baselineScores,
          runLabel(mode, callerMode, failureMode, noiseEnabled),
        ),
      );
    } finally {
      setRunningAll(false);
    }
  }

  async function handleReset() {
    setRunningAll(true);
    try {
      const next = await runAllDeterministic();
      setViews(next);
      setBaselineScores(scoresFromViews(next));
      setMode("deterministic");
      setPromptPresetId(DEFAULT_PROMPT_PRESET_ID);
      setPrompt(INSURANCE_VOICE_AGENT_PROMPT);
      setFailureMode("none");
      setCallerMode("scripted");
      setCallerPersona("cooperative");
      setNoiseEnabled(false);
      setRunAllSummary(null);
      setLlmLimitNotice(null);
    } finally {
      setRunningAll(false);
    }
  }

  function reserveLiveRun(nextPresetId: PromptPresetId): boolean {
    const result = reservePublicLlmRun(publicLlmUsage, nextPresetId);
    setPublicLlmUsage(result.usage);
    writePublicLlmUsage(browserSessionStorage(), result.usage);

    if (!result.ok) {
      const preset = getPromptPreset(nextPresetId);
      setLlmLimitNotice(
        `Prompt ${preset.option} has used its ${result.quota.perPresetLimit} live scenario runs in this browser session. Try another prompt, or use deterministic mode.`,
      );
      return false;
    }

    setLlmLimitNotice(null);
    return true;
  }

  async function handlePromptPresetChange(nextPresetId: PromptPresetId) {
    const nextPrompt = getPromptPreset(nextPresetId).prompt;
    setPromptPresetId(nextPresetId);
    setPrompt(nextPrompt);

    if (publicDemo && llm.available) {
      const nextQuota = quotaFromUsage(publicLlmUsage);
      const selectedPreset = getPromptPreset(nextPresetId);
      setMode("llm");
      setFailureMode("none");
      setLlmLimitNotice(
        nextQuota.remainingByPreset[nextPresetId] <= 0
          ? `Prompt ${selectedPreset.option} has used its ${nextQuota.perPresetLimit} live scenario runs in this browser session. Try another prompt, or use deterministic mode.`
          : null,
      );
    } else {
      setLlmLimitNotice(null);
    }
  }

  // Live caller requires LLM mode + key; simulated caller is local and always available.
  const liveCallerAvailable =
    mode === "llm" && llm.available && !publicDemo && llm.capabilities?.liveCaller !== false;
  const busy = running || runningAll;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
          <img src={faviconHref} alt="Insurtech Prompt Lab logo" className="size-7 rounded-md" />
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">
              Insurtech Prompt Lab
            </div>
            <div className="text-[11px] leading-tight text-slate-500">
              Insurance voice agent · eval harness
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Agent mode toggle */}
          <ModeToggle
            mode={mode}
            onChange={setMode}
            llmAvailable={llm.available}
            unavailableReason={llm.reason}
          />
          <FailureModeSelect value={failureMode} onChange={setFailureMode} />
          {/* Caller mode toggle (Item 1) */}
          <CallerToggle
            callerMode={callerMode}
            onChange={setCallerMode}
            liveAvailable={liveCallerAvailable}
          />
          {/* Persona dropdown (Item 1) */}
          {(callerMode === "simulated" || (callerMode === "live" && liveCallerAvailable)) && (
            <select
              value={callerPersona}
              onChange={(e) => setCallerPersona(e.target.value as CallerPersona)}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              {PERSONAS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          )}
          {/* ASR noise toggle (Item 5) */}
          <NoiseToggle
            enabled={noiseEnabled}
            onChange={setNoiseEnabled}
            available={callerMode === "simulated" || (callerMode === "live" && liveCallerAvailable)}
          />
          <NeutralBadge>
            engine: {failureMode !== "none" ? "failure demo" : mode === "llm" ? llm.provider ?? "llm" : "deterministic"}
          </NeutralBadge>
          {publicDemo && (
            <NeutralBadge>
              live runs: {publicLlmQuota.usedTotal}/{publicLlmQuota.totalLimit}
            </NeutralBadge>
          )}
          <span
            className={
              busy
                ? "inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                : "inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
            }
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Activity className="size-3" />}
            {runningAll ? "running all" : running ? "running" : "idle"}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <ScenarioList items={items} activeId={activeId} onSelect={setActiveId} />
        {activeView ? (
          <>
            <TranscriptPanel
              view={activeView}
              onRun={handleRun}
              onRunAll={handleRunAll}
              onReset={handleReset}
              running={running}
              runningAll={runningAll}
              runAllDisabled={!runAllAllowed}
              runAllDisabledReason="Public LLM mode runs one scenario at a time to control model usage."
              runDisabled={
                publicDemo &&
                mode === "llm" &&
                failureMode === "none" &&
                currentPresetRemaining <= 0
              }
              runDisabledReason={`Prompt ${getPromptPreset(promptPresetId).option} has no live scenario runs left in this browser session.`}
              notice={llmLimitNotice}
            />
            <InspectorTabs
              view={activeView}
              prompt={prompt}
              mode={mode}
              edited={prompt !== INSURANCE_VOICE_AGENT_PROMPT}
              onPromptChange={setPrompt}
              onResetPrompt={() => handlePromptPresetChange(DEFAULT_PROMPT_PRESET_ID)}
              publicDemo={publicDemo}
              promptPresets={PROMPT_PRESETS}
              selectedPromptPresetId={promptPresetId}
              onPromptPresetChange={handlePromptPresetChange}
              publicLlmQuota={publicLlmQuota}
              llmAvailable={llm.available}
              promptPresetBusy={busy}
              judgeAvailable={llm.capabilities?.judge !== false && llm.available && !publicDemo}
              currentScores={currentScores}
              baselineScores={baselineScores}
              baselinePrompt={INSURANCE_VOICE_AGENT_PROMPT}
              runAllSummary={runAllSummary}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 size-4 animate-spin" /> Running initial evaluations…
          </div>
        )}
      </main>
    </div>
  );
}

function buildRunAllSummary(
  before: Record<string, LabView>,
  after: Record<string, LabView>,
  baselineScores: Record<string, string>,
  runLabelText: string,
): RunAllSummary {
  let score = 0;
  let maxScore = 0;
  let baselineScore = 0;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  const rows = SCENARIOS.map((scenario) => {
    const beforeView = before[scenario.id];
    const afterView = after[scenario.id];
    const afterScoreParts = parseScore(afterView.overallScore);
    const baselineScoreText = baselineScores[scenario.id];
    const baselineScoreParts = baselineScoreText ? parseScore(baselineScoreText) : undefined;
    score += afterScoreParts.score;
    maxScore += afterScoreParts.max;
    baselineScore += baselineScoreParts?.score ?? 0;

    if (afterView.lastEval === "pass") passCount += 1;
    else if (afterView.lastEval === "warn") warnCount += 1;
    else failCount += 1;

    const beforeScore = beforeView ? parseScore(beforeView.overallScore).score : undefined;
    const scoreDelta = beforeScore === undefined ? undefined : afterScoreParts.score - beforeScore;

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      baselineScore: baselineScoreText,
      baselineDelta: baselineScoreParts ? afterScoreParts.score - baselineScoreParts.score : undefined,
      beforeScore: beforeView?.overallScore,
      afterScore: afterView.overallScore,
      scoreDelta,
      beforeStatus: beforeView?.lastEval,
      afterStatus: afterView.lastEval,
      failedCriteria: afterView.scorecard
        .filter((row) => row.status === "fail")
        .map((row) => row.criterion),
      warnedCriteria: afterView.scorecard
        .filter((row) => row.status === "warn")
        .map((row) => row.criterion),
    };
  });

  return {
    ranAt: new Date().toISOString(),
    runLabel: runLabelText,
    baselineLabel: "Baseline",
    totalScore: `${trimScore(score)}/${trimScore(maxScore)}`,
    baselineDelta: Object.keys(baselineScores).length > 0 ? score - baselineScore : undefined,
    passCount,
    warnCount,
    failCount,
    rows,
  };
}

function scoresFromViews(views: Record<string, LabView>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, view] of Object.entries(views)) {
    out[id] = view.overallScore;
  }
  return out;
}

function parseScore(scoreText: string): { score: number; max: number } {
  const [scoreRaw, maxRaw] = scoreText.split("/");
  return {
    score: Number.parseFloat(scoreRaw) || 0,
    max: Number.parseFloat(maxRaw) || 0,
  };
}

function trimScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function runLabel(
  mode: RunMode,
  callerMode: CallerMode,
  failureMode: FailureModeId,
  noiseEnabled: boolean,
): string {
  const failure = FAILURE_MODE_OPTIONS.find((option) => option.id === failureMode);
  if (failure && failure.id !== "none") return `failure demo: ${failure.label}`;

  const modeLabel = mode === "llm" ? "LLM agent" : "deterministic agent";
  const callerLabel =
    callerMode === "scripted"
      ? "scripted caller"
      : callerMode === "simulated"
        ? "simulated caller"
        : "live caller";
  return `${modeLabel} · ${callerLabel}${noiseEnabled ? " · ASR noise" : ""}`;
}

// ---------------------------------------------------------------------------
// Header controls
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  onChange,
  llmAvailable,
  unavailableReason,
}: {
  mode: RunMode;
  onChange: (m: RunMode) => void;
  llmAvailable: boolean;
  unavailableReason?: string;
}) {
  const btn = (m: RunMode, label: string, disabled = false) => (
    <button
      key={m}
      onClick={() => !disabled && onChange(m)}
      disabled={disabled}
      title={
        disabled
          ? unavailableReason || "Set ANTHROPIC_API_KEY in .dev.vars to enable LLM mode"
          : undefined
      }
      className={
        mode === m
          ? "rounded px-2 py-0.5 text-[11px] font-medium bg-white text-slate-900 shadow-sm"
          : "rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:text-slate-500"
      }
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200">
      {btn("deterministic", "Deterministic")}
      {btn("llm", "LLM", !llmAvailable)}
    </div>
  );
}

function FailureModeSelect({
  value,
  onChange,
}: {
  value: FailureModeId;
  onChange: (value: FailureModeId) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FailureModeId)}
      title="Run an intentionally broken local agent to demonstrate eval failures"
      className={
        value === "none"
          ? "rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
          : "rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-300"
      }
    >
      {FAILURE_MODE_OPTIONS.map((option) => (
        <option key={option.id} value={option.id} title={option.description}>
          Agent: {option.label}
        </option>
      ))}
    </select>
  );
}

/** Item 1: toggle between scripted and live caller. */
function CallerToggle({
  callerMode,
  onChange,
  liveAvailable,
}: {
  callerMode: CallerMode;
  onChange: (m: CallerMode) => void;
  liveAvailable: boolean;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200"
      title="Caller mode: scripted = fixed lines; simulated = local adaptive caller; live = LLM-generated"
    >
      <button
        onClick={() => onChange("scripted")}
        className={
          callerMode === "scripted"
            ? "rounded px-2 py-0.5 text-[11px] font-medium bg-white text-slate-900 shadow-sm"
            : "rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700"
        }
      >
        Scripted
      </button>
      <button
        onClick={() => onChange("simulated")}
        className={
          callerMode === "simulated"
            ? "rounded px-2 py-0.5 text-[11px] font-medium bg-white text-slate-900 shadow-sm"
            : "rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700"
        }
      >
        Simulated
      </button>
      <button
        onClick={() => liveAvailable && onChange("live")}
        disabled={!liveAvailable}
        title={!liveAvailable ? "Live caller requires LLM mode + an API key" : undefined}
        className={
          callerMode === "live"
            ? "rounded px-2 py-0.5 text-[11px] font-medium bg-white text-slate-900 shadow-sm"
            : "rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
        }
      >
        Live caller
      </button>
    </div>
  );
}

/** Item 5: ASR noise toggle — only meaningful with an adaptive caller. */
function NoiseToggle({
  enabled,
  onChange,
  available,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  available: boolean;
}) {
  return (
    <button
      onClick={() => available && onChange(!enabled)}
      disabled={!available}
      title={
        !available
          ? "ASR noise requires Simulated or Live caller mode"
          : enabled
            ? "Disable ASR noise"
            : "Enable ASR noise simulation (perturbs caller utterances)"
      }
      className={
        enabled && available
          ? "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
          : "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 opacity-60 hover:opacity-100 disabled:cursor-default"
      }
    >
      {enabled && available ? (
        <Volume2 className="size-3" />
      ) : (
        <VolumeX className="size-3" />
      )}
      Noise
    </button>
  );
}
