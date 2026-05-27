import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SCENARIOS } from "@/data/scenarios";
import { runLab, runAllDeterministic } from "@/lab/run";
import { INSURANCE_VOICE_AGENT_PROMPT } from "@/prompts/insuranceVoiceAgentPrompt";
import type { LabView, ScenarioMeta, CallerMode, CallerPersona } from "@/lab/types";
import type { RunMode } from "@/engine/types";
import { ScenarioList } from "@/components/lab/ScenarioList";
import { TranscriptPanel } from "@/components/lab/TranscriptPanel";
import { InspectorTabs } from "@/components/lab/InspectorTabs";
import { NeutralBadge } from "@/components/lab/StatusBadge";
import { Activity, Loader2, Volume2, VolumeX } from "lucide-react";

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

function Index() {
  const [views, setViews] = useState<Record<string, LabView>>({});
  const [activeId, setActiveId] = useState(SCENARIOS[0].id);
  const [mode, setMode] = useState<RunMode>("deterministic");
  const [prompt, setPrompt] = useState(INSURANCE_VOICE_AGENT_PROMPT);
  const [running, setRunning] = useState(false);
  const [llm, setLlm] = useState<{ available: boolean; provider?: string }>({ available: false });
  // Item 1: adaptive caller controls
  const [callerMode, setCallerMode] = useState<CallerMode>("scripted");
  const [callerPersona, setCallerPersona] = useState<CallerPersona>("cooperative");
  // Item 5: ASR noise toggle
  const [noiseEnabled, setNoiseEnabled] = useState(false);

  // Seed the dashboard: run every scenario deterministically (instant, local).
  useEffect(() => {
    let cancelled = false;
    runAllDeterministic().then((v) => {
      if (!cancelled) setViews(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect whether a server-side API key is configured (enables LLM mode).
  useEffect(() => {
    fetch("/api/llm-status")
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

  // Build the current-scores map for the Versions tab snapshot.
  const currentScores = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, view] of Object.entries(views)) {
      out[id] = view.overallScore;
    }
    return out;
  }, [views]);

  async function handleRun() {
    setRunning(true);
    try {
      const v = await runLab(activeId, {
        mode,
        systemPrompt: prompt,
        callerMode,
        callerPersona,
        noiseEnabled,
      });
      setViews((prev) => ({ ...prev, [activeId]: v }));
    } finally {
      setRunning(false);
    }
  }

  // Live caller requires LLM mode + key; simulated caller is local and always available.
  const liveCallerAvailable = mode === "llm" && llm.available;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Liberate Prompt Lab logo" className="size-7 rounded-md" />
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">
              Liberate Prompt Lab
            </div>
            <div className="text-[11px] leading-tight text-slate-500">
              Insurance voice agent · eval harness
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Agent mode toggle */}
          <ModeToggle mode={mode} onChange={setMode} llmAvailable={llm.available} />
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
            engine: {mode === "llm" ? llm.provider ?? "llm" : "deterministic"}
          </NeutralBadge>
          <span
            className={
              running
                ? "inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                : "inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
            }
          >
            {running ? <Loader2 className="size-3 animate-spin" /> : <Activity className="size-3" />}
            {running ? "running" : "idle"}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <ScenarioList items={items} activeId={activeId} onSelect={setActiveId} />
        {activeView ? (
          <>
            <TranscriptPanel view={activeView} onRun={handleRun} running={running} />
            <InspectorTabs
              view={activeView}
              prompt={prompt}
              mode={mode}
              edited={prompt !== INSURANCE_VOICE_AGENT_PROMPT}
              onPromptChange={setPrompt}
              onResetPrompt={() => setPrompt(INSURANCE_VOICE_AGENT_PROMPT)}
              currentScores={currentScores}
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

// ---------------------------------------------------------------------------
// Header controls
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  onChange,
  llmAvailable,
}: {
  mode: RunMode;
  onChange: (m: RunMode) => void;
  llmAvailable: boolean;
}) {
  const btn = (m: RunMode, label: string, disabled = false) => (
    <button
      key={m}
      onClick={() => !disabled && onChange(m)}
      disabled={disabled}
      title={
        disabled
          ? "Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .dev.vars to enable LLM mode"
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
