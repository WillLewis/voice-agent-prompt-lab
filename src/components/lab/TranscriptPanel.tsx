import { cn } from "@/lib/utils";
import type { LabView, Turn } from "@/lab/types";
import { StateBadge, RiskBadge, NeutralBadge } from "./StatusBadge";
import { Mic, User, ArrowRight, Play, Loader2, RotateCcw, TriangleAlert, CircleCheck, Info } from "lucide-react";

type Props = {
  view: LabView;
  onRun: () => void;
  running: boolean;
};

export function TranscriptPanel({ view, onRun, running }: Props) {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <header className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">{view.title}</h2>
              <RiskBadge risk={view.risk} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{view.persona}</p>
          </div>
          <div className="flex items-center gap-2">
            <NeutralBadge>state</NeutralBadge>
            <StateBadge state={view.state} />
          </div>
        </div>
      </header>

      <EngineBanner llmRun={view.llmRun} />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {view.transcript.map((turn, i) => (
            <div key={i}>
              <TurnBubble turn={turn} />
              {turn.transition && (
                <div className="my-3 flex items-center gap-2 pl-1">
                  <ArrowRight className="size-3 text-slate-400" />
                  <span className="font-mono text-[11px] text-slate-500">{turn.transition}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-6 py-3">
        <div className="font-mono text-[11px] text-slate-500">
          turns: {view.transcript.length} · tools: {view.toolCalls.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {running ? "Running…" : "Run scenario"}
          </button>
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm opacity-60"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        </div>
      </footer>
    </section>
  );
}

// Tells the viewer exactly what produced this transcript, so a silent
// LLM→deterministic fallback can never pass as a live model run.
function EngineBanner({ llmRun }: { llmRun?: { turns: number; fallbacks: number } }) {
  if (!llmRun) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11.5px] text-slate-500">
        <Info className="size-3.5 shrink-0" />
        <span>
          Deterministic mode — a fixed golden transcript; prompt edits are not applied. Switch to LLM
          to run your prompt against the live model.
        </span>
      </div>
    );
  }
  if (llmRun.fallbacks > 0) {
    return (
      <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-[11.5px] text-amber-800">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-semibold">
            {llmRun.fallbacks}/{llmRun.turns} turns fell back to the deterministic script.
          </span>{" "}
          The model's output was rejected (it didn't match the required JSON schema) or the call
          failed, so the transcript and scorecard reflect the fallback — not your prompt. Keep the
          output-schema section of the prompt intact.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-[11.5px] text-emerald-700">
      <CircleCheck className="size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">Live model</span> — all {llmRun.turns} agent turns were
        generated from your prompt.
      </span>
    </div>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  const isAgent = turn.role === "agent";
  return (
    <div className={cn("flex gap-3", isAgent ? "flex-row" : "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
          isAgent
            ? "bg-slate-900 text-white ring-slate-900"
            : "bg-slate-100 text-slate-600 ring-slate-200",
        )}
      >
        {isAgent ? <Mic className="size-3.5" /> : <User className="size-3.5" />}
      </div>
      <div className={cn("min-w-0 max-w-[85%]", isAgent ? "items-start" : "items-end")}>
        <div
          className={cn(
            "mb-1 flex items-center gap-2 text-[11px] font-medium",
            isAgent ? "" : "justify-end",
          )}
        >
          <span className="text-slate-700">{turn.speaker}</span>
          <span
            className={cn(
              "rounded px-1.5 py-px text-[10px] uppercase tracking-wide ring-1 ring-inset",
              isAgent
                ? "bg-slate-900/5 text-slate-700 ring-slate-200"
                : "bg-slate-100 text-slate-500 ring-slate-200",
            )}
          >
            {isAgent ? "Voice Agent" : turn.role === "system" ? "System" : "Customer"}
          </span>
          {turn.source === "fallback" && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
              <TriangleAlert className="size-2.5" />
              fallback
            </span>
          )}
        </div>
        <div
          className={cn(
            "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ring-1 ring-inset",
            isAgent
              ? "bg-white text-slate-800 ring-slate-200 shadow-sm"
              : "bg-slate-50 text-slate-800 ring-slate-200",
          )}
        >
          {turn.text}
        </div>
      </div>
    </div>
  );
}
