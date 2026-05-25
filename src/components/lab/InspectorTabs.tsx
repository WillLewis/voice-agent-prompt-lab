import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LabView, ToolCallView } from "@/lab/types";
import type { RunMode } from "@/engine/types";
import { EvalBadge, NeutralBadge } from "./StatusBadge";
import { Wrench, FileText, ClipboardCheck, Network, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type InspectorProps = {
  view: LabView;
  prompt: string;
  mode: RunMode;
  edited: boolean;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
};

export function InspectorTabs({
  view,
  prompt,
  mode,
  edited,
  onPromptChange,
  onResetPrompt,
}: InspectorProps) {
  return (
    <aside className="flex h-full w-[500px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/40">
      <Tabs defaultValue="prompt" className="flex h-full flex-col">
        <div className="border-b border-slate-200 bg-white px-4 pt-3">
          <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0">
            <TabTrigger value="prompt" icon={FileText} label="System Prompt" />
            <TabTrigger value="tools" icon={Wrench} label="Tool Calls" />
            <TabTrigger value="eval" icon={ClipboardCheck} label="Scorecard" />
            <TabTrigger value="arch" icon={Network} label="Architecture" />
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="prompt" className="mt-0">
            <SystemPromptView
              prompt={prompt}
              mode={mode}
              edited={edited}
              onPromptChange={onPromptChange}
              onResetPrompt={onResetPrompt}
            />
          </TabsContent>
          <TabsContent value="tools" className="mt-0">
            <ToolCallsView view={view} />
          </TabsContent>
          <TabsContent value="eval" className="mt-0">
            <ScorecardView view={view} />
          </TabsContent>
          <TabsContent value="arch" className="mt-0">
            <ArchitectureNotes view={view} />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function TabTrigger({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: typeof Wrench;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-500 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none"
    >
      <Icon className="size-3.5" />
      {label}
    </TabsTrigger>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </div>
  );
}

function SystemPromptView({
  prompt,
  mode,
  edited,
  onPromptChange,
  onResetPrompt,
}: {
  prompt: string;
  mode: RunMode;
  edited: boolean;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
}) {
  const tokens = Math.round(prompt.length / 4);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>System prompt</SectionTitle>
        <div className="flex items-center gap-1.5">
          {edited && (
            <button
              onClick={onResetPrompt}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}
          <NeutralBadge>~{tokens} tokens</NeutralBadge>
        </div>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        spellCheck={false}
        className="h-[60vh] w-full resize-none rounded-lg border border-slate-200 bg-white p-3.5 font-mono text-[12px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
      <p className="rounded-md bg-slate-100 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
        {mode === "llm" ? (
          <>
            <span className="font-medium text-slate-700">LLM mode:</span> edits drive the live model.
            Change a rule, then <span className="font-medium">Run scenario</span> to watch the
            scorecard respond.
          </>
        ) : (
          <>
            <span className="font-medium text-slate-700">Deterministic mode</span> runs a fixed golden
            transcript and ignores prompt edits. Switch to <span className="font-medium">LLM</span> to
            apply changes.
          </>
        )}
        {edited && <span className="ml-1 font-medium text-amber-700">Edited — re-run to apply.</span>}
      </p>
    </div>
  );
}

function ToolCallsView({ view }: { view: LabView }) {
  if (view.toolCalls.length === 0) {
    return (
      <div className="space-y-3">
        <SectionTitle>Tool invocations</SectionTitle>
        <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3.5 text-[12.5px] text-slate-500">
          No tools were called in this run.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <SectionTitle>Tool invocations</SectionTitle>
      <div className="space-y-2.5">
        {view.toolCalls.map((tc) => (
          <ToolCallCard key={tc.id} call={tc} />
        ))}
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCallView }) {
  const statusColor =
    call.status === "ok"
      ? "border-l-emerald-400"
      : call.status === "warn"
        ? "border-l-amber-400"
        : "border-l-rose-400";
  const statusEval = call.status === "ok" ? "pass" : call.status === "warn" ? "warn" : "fail";

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 border-l-4 bg-slate-50/80 p-3",
        statusColor,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="size-3.5 shrink-0 text-slate-500" />
          <span className="truncate font-mono text-[12px] font-medium text-slate-900">
            {call.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <NeutralBadge>{call.latencyMs}ms</NeutralBadge>
          <EvalBadge status={statusEval as "pass" | "warn" | "fail"} label={call.status} />
        </div>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <KvBlock label="args" value={call.args} />
        <KvBlock label="result" value={call.result} />
      </div>
    </div>
  );
}

function KvBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <pre className="mt-0.5 overflow-x-auto rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ScorecardView({ view }: { view: LabView }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Overall</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900">{view.overallScore}</div>
        </div>
        <EvalBadge status={view.lastEval} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Criterion</th>
              <th className="px-3 py-2 text-left font-medium">Score</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {view.scorecard.map((row, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2.5">
                  <div className="text-[13px] text-slate-900">{row.criterion}</div>
                  <div className="mt-0.5 text-[11.5px] text-slate-500">{row.note}</div>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-slate-700">{row.score}</td>
                <td className="px-3 py-2.5">
                  <EvalBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchitectureNotes({ view }: { view: LabView }) {
  return (
    <div className="space-y-3">
      <SectionTitle>Architecture notes</SectionTitle>
      <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3.5 text-[12.5px] leading-relaxed text-slate-700">
        {view.architectureNotes}
      </pre>
    </div>
  );
}
