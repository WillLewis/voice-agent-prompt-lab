import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SCENARIOS } from "@/data/scenarios";
import { runLab, runAllDeterministic } from "@/lab/run";
import type { LabView, ScenarioMeta } from "@/lab/types";
import type { RunMode } from "@/engine/types";
import { ScenarioList } from "@/components/lab/ScenarioList";
import { TranscriptPanel } from "@/components/lab/TranscriptPanel";
import { InspectorTabs } from "@/components/lab/InspectorTabs";
import { NeutralBadge } from "@/components/lab/StatusBadge";
import { Activity, FlaskConical, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [views, setViews] = useState<Record<string, LabView>>({});
  const [activeId, setActiveId] = useState(SCENARIOS[0].id);
  const [mode, setMode] = useState<RunMode>("deterministic");
  const [running, setRunning] = useState(false);
  const [llm, setLlm] = useState<{ available: boolean; provider?: string }>({ available: false });

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

  async function handleRun() {
    setRunning(true);
    try {
      const v = await runLab(activeId, mode);
      setViews((prev) => ({ ...prev, [activeId]: v }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white">
            <FlaskConical className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">
              Liberate Prompt Lab
            </div>
            <div className="text-[11px] leading-tight text-slate-500">
              Insurance voice agent · eval harness
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} llmAvailable={llm.available} />
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
            <InspectorTabs view={activeView} />
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
