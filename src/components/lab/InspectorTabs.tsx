import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LabView, ToolCallView, PromptVersion, RunAllSummary, PromptVersionLabel } from "@/lab/types";
import {
  PROMPT_VERSION_LABELS,
  loadPromptVersions,
  savePromptVersion,
  deletePromptVersion,
  diffPrompts,
} from "@/lab/types";
import type { RunMode } from "@/engine/types";
import type { EvalResult } from "@/engine/types";
import type { PromptPreset, PromptPresetId } from "@/prompts/promptPresets";
import { EvalBadge, NeutralBadge } from "./StatusBadge";
import { Wrench, FileText, ClipboardCheck, Network, RotateCcw, Gavel, GitCompare, Save, Trash2, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { runBrowserJudge } from "@/engine/llmJudge";
import { isPromptEditorReadOnly } from "@/lab/publicDemo";

type InspectorProps = {
  view: LabView;
  prompt: string;
  mode: RunMode;
  edited: boolean;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
  publicDemo?: boolean;
  promptPresets?: PromptPreset[];
  selectedPromptPresetId?: PromptPresetId;
  onPromptPresetChange?: (id: PromptPresetId) => void;
  judgeAvailable?: boolean;
  /** All current scores by scenarioId — used to snapshot per-version scores. */
  currentScores?: Record<string, string>;
  /** Baseline score snapshot used for prompt-version deltas. */
  baselineScores?: Record<string, string>;
  /** Baseline prompt used for inspectable prompt diffs. */
  baselinePrompt: string;
  /** Most recent Run All result, used to compare the full suite before/after. */
  runAllSummary?: RunAllSummary | null;
};

export function InspectorTabs({
  view,
  prompt,
  mode,
  edited,
  onPromptChange,
  onResetPrompt,
  publicDemo = false,
  promptPresets = [],
  selectedPromptPresetId,
  onPromptPresetChange,
  judgeAvailable = true,
  currentScores,
  baselineScores,
  baselinePrompt,
  runAllSummary,
}: InspectorProps) {
  return (
    <aside className="flex h-full w-[500px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/40">
      <Tabs defaultValue="prompt" className="flex h-full flex-col">
        <div className="border-b border-slate-200 bg-white px-4 pt-3">
          <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0">
            <TabTrigger value="prompt" icon={FileText} label="Prompt" />
            <TabTrigger value="tools" icon={Wrench} label="Tools" />
            <TabTrigger value="eval" icon={ClipboardCheck} label="Scorecard" />
            <TabTrigger value="judge" icon={Gavel} label="Judge" />
            {!publicDemo && <TabTrigger value="versions" icon={GitCompare} label="Versions" />}
            <TabTrigger value="arch" icon={Network} label="Arch" />
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
              publicDemo={publicDemo}
              promptPresets={promptPresets}
              selectedPromptPresetId={selectedPromptPresetId}
              onPromptPresetChange={onPromptPresetChange}
            />
          </TabsContent>
          <TabsContent value="tools" className="mt-0">
            <ToolCallsView view={view} />
          </TabsContent>
          <TabsContent value="eval" className="mt-0">
            <ScorecardView view={view} runAllSummary={runAllSummary} />
          </TabsContent>
          <TabsContent value="judge" className="mt-0">
            <JudgeView view={view} mode={mode} judgeAvailable={judgeAvailable} />
          </TabsContent>
          {!publicDemo && (
            <TabsContent value="versions" className="mt-0">
              <VersionsView
                prompt={prompt}
                currentScores={currentScores}
                baselineScores={baselineScores}
                baselinePrompt={baselinePrompt}
                onLoadPrompt={onPromptChange}
              />
            </TabsContent>
          )}
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
      className="h-8 gap-1 rounded-md px-2 text-xs font-medium text-slate-500 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none"
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
  publicDemo = false,
  promptPresets = [],
  selectedPromptPresetId,
  onPromptPresetChange,
}: {
  prompt: string;
  mode: RunMode;
  edited: boolean;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
  publicDemo?: boolean;
  promptPresets?: PromptPreset[];
  selectedPromptPresetId?: PromptPresetId;
  onPromptPresetChange?: (id: PromptPresetId) => void;
}) {
  const tokens = Math.round(prompt.length / 4);
  const readOnly = isPromptEditorReadOnly(publicDemo);
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
      {publicDemo && promptPresets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {promptPresets.map((preset) => {
            const active = preset.id === selectedPromptPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPromptPresetChange?.(preset.id)}
                className={cn(
                  "min-h-24 rounded-lg border bg-white p-3 text-left transition",
                  active
                    ? "border-slate-900 shadow-sm"
                    : "border-slate-200 hover:border-slate-400",
                )}
              >
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {preset.option}
                </span>
                <span className="mt-2 block text-[12px] font-semibold text-slate-900">
                  {preset.label}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        className={cn(
          "h-[60vh] w-full resize-none rounded-lg border border-slate-200 bg-white p-3.5 font-mono text-[12px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300",
          readOnly && "cursor-default bg-slate-50",
        )}
      />
      <p className="rounded-md bg-slate-100 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
        {publicDemo ? (
          <>
            <span className="font-medium text-slate-700">Public demo:</span> choose a prompt block
            above. Free-text prompt editing stays local-only.
          </>
        ) : mode === "llm" ? (
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

function ScorecardView({
  view,
  runAllSummary,
}: {
  view: LabView;
  runAllSummary?: RunAllSummary | null;
}) {
  return (
    <div className="space-y-3">
      {runAllSummary && <RunAllComparison summary={runAllSummary} />}

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

function RunAllComparison({ summary }: { summary: RunAllSummary }) {
  const ranAt = new Date(summary.ranAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Run All comparison</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900">{summary.totalScore}</div>
          <div className="mt-0.5 text-[11.5px] text-slate-500">
            {summary.runLabel} · {ranAt}
          </div>
          {summary.baselineDelta !== undefined && (
            <div className={cn("mt-1 font-mono text-[11px]", deltaClass(summary.baselineDelta))}>
              {formatBaselineDelta(summary.baselineDelta)} vs {summary.baselineLabel}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <NeutralBadge>{summary.passCount} pass</NeutralBadge>
          <NeutralBadge>{summary.warnCount} warn</NeutralBadge>
          <NeutralBadge>{summary.failCount} fail</NeutralBadge>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2.5 py-2 text-left font-medium">Scenario</th>
              <th className="px-2.5 py-2 text-left font-medium">Before</th>
              <th className="px-2.5 py-2 text-left font-medium">After</th>
              <th className="px-2.5 py-2 text-left font-medium">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {summary.rows.map((row) => (
              <tr key={row.scenarioId} className="align-top">
                <td className="px-2.5 py-2">
                  <div className="text-[12.5px] font-medium text-slate-900">{row.title}</div>
                  <div className={cn("mt-1 font-mono text-[11px]", deltaClass(row.scoreDelta))}>
                    {formatDelta(row.scoreDelta)}
                  </div>
                </td>
                <td className="px-2.5 py-2">
                  <div className="font-mono text-[11.5px] text-slate-600">
                    {row.beforeScore ?? "new"}
                  </div>
                  {row.beforeStatus && <EvalBadge status={row.beforeStatus} />}
                </td>
                <td className="px-2.5 py-2">
                  <div className="font-mono text-[11.5px] text-slate-800">{row.afterScore}</div>
                  <EvalBadge status={row.afterStatus} />
                  {row.baselineDelta !== undefined && (
                    <div className={cn("mt-1 font-mono text-[10.5px]", deltaClass(row.baselineDelta))}>
                      {formatBaselineDelta(row.baselineDelta)} baseline
                    </div>
                  )}
                </td>
                <td className="px-2.5 py-2">
                  <IssueSummary
                    failedCriteria={row.failedCriteria}
                    warnedCriteria={row.warnedCriteria}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueSummary({
  failedCriteria,
  warnedCriteria,
}: {
  failedCriteria: string[];
  warnedCriteria: string[];
}) {
  const issues = [
    ...failedCriteria.map((criterion) => ({ criterion, kind: "fail" as const })),
    ...warnedCriteria.map((criterion) => ({ criterion, kind: "warn" as const })),
  ];

  if (issues.length === 0) {
    return <span className="text-[11.5px] text-slate-400">No open issues</span>;
  }

  return (
    <div className="space-y-1">
      {issues.slice(0, 3).map((issue) => (
        <div
          key={`${issue.kind}-${issue.criterion}`}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] leading-snug",
            issue.kind === "fail" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700",
          )}
        >
          {issue.criterion}
        </div>
      ))}
      {issues.length > 3 && (
        <div className="text-[11px] text-slate-400">+{issues.length - 3} more</div>
      )}
    </div>
  );
}

function formatDelta(delta?: number): string {
  if (delta === undefined) return "baseline";
  if (delta === 0) return "no change";
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatBaselineDelta(delta?: number): string {
  if (delta === undefined) return "Δ --";
  if (delta === 0) return "Δ 0";
  return delta > 0 ? `Δ +${delta}` : `Δ ${delta}`;
}

function deltaClass(delta?: number): string {
  if (delta === undefined || delta === 0) return "text-slate-400";
  return delta > 0 ? "text-emerald-600" : "text-rose-600";
}

// ---------------------------------------------------------------------------
// Item 3: LLM Judge tab
// ---------------------------------------------------------------------------

function JudgeView({
  view,
  mode,
  judgeAvailable,
}: {
  view: LabView;
  mode: RunMode;
  judgeAvailable: boolean;
}) {
  const [judgeResult, setJudgeResult] = useState<EvalResult | null>(null);
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunJudge() {
    setJudging(true);
    setError(null);
    try {
      const result = await runBrowserJudge(view);
      if (result) setJudgeResult(result);
      else setError("The model returned an unparseable response. Try again.");
    } catch {
      setError("Judge call failed — check that LLM mode is enabled and a key is configured.");
    } finally {
      setJudging(false);
    }
  }

  const needsLlm = mode !== "llm" || !judgeAvailable;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>LLM Judge (optional)</SectionTitle>
        <button
          onClick={handleRunJudge}
          disabled={judging || needsLlm}
          title={needsLlm ? "The hosted public demo keeps the optional judge disabled" : undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {judging ? <Loader2 className="size-3 animate-spin" /> : <Gavel className="size-3" />}
          {judging ? "Judging…" : "Run Judge"}
        </button>
      </div>

      <p className="rounded-md bg-slate-100 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
        <span className="font-medium text-slate-700">LLM-as-judge</span> scores nuance the rule-based
        checks miss — empathy quality, coverage-boundary phrasing, and tone. Requires LLM mode + a
        configured API key. The{" "}
        <span className="font-medium">rule-based Scorecard</span> remains the primary gate.
      </p>

      {needsLlm && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          The optional judge is available only when LLM mode and the judge endpoint are enabled.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-800">
          {error}
        </p>
      )}

      {judgeResult && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Judge score</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-900">
                {judgeResult.totalScore}/{judgeResult.maxScore}
              </div>
            </div>
            <NeutralBadge>LLM graded</NeutralBadge>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Dimension</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {judgeResult.items.map((item, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-2.5">
                      <div className="text-[13px] text-slate-900">{item.label}</div>
                      <div className="mt-0.5 text-[11.5px] text-slate-500">{item.rationale}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <JudgeStatusIcon status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!judgeResult && !judging && !error && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-5 text-center text-[12.5px] text-slate-400">
          Run the judge to see model-graded scores for this transcript.
        </div>
      )}
    </div>
  );
}

function JudgeStatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === "warn") return <AlertCircle className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-rose-600" />;
}

// ---------------------------------------------------------------------------
// Item 4: Prompt Versions tab
// ---------------------------------------------------------------------------

function VersionsView({
  prompt,
  currentScores,
  baselineScores,
  baselinePrompt,
  onLoadPrompt,
}: {
  prompt: string;
  currentScores?: Record<string, string>;
  baselineScores?: Record<string, string>;
  baselinePrompt: string;
  onLoadPrompt: (p: string) => void;
}) {
  const [versions, setVersions] = useState<PromptVersion[]>(() => loadPromptVersions());
  const [newName, setNewName] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<PromptVersionLabel[]>(["candidate"]);
  const [diffTarget, setDiffTarget] = useState<PromptVersion | "baseline" | null>("baseline");
  const builtinBaseline: PromptVersion = {
    name: "Built-in baseline",
    labels: ["baseline"],
    prompt: baselinePrompt,
    savedAt: "",
    scores: baselineScores,
  };
  const savedBaseline = versions.find((v) => (v.labels ?? []).includes("baseline"));
  const baselineVersion = savedBaseline ?? builtinBaseline;
  const baselineScoreSnapshot = baselineVersion.scores ?? baselineScores;
  const currentSummary = summarizeScoreSnapshot(currentScores);
  const currentDelta = scoreSnapshotDelta(currentScores, baselineScoreSnapshot);
  const selectedDiffTarget = diffTarget === "baseline" ? baselineVersion : diffTarget;
  const diff = selectedDiffTarget ? diffPrompts(selectedDiffTarget.prompt, prompt) : null;

  function refresh() {
    setVersions(loadPromptVersions());
  }

  function handleSave() {
    const name = newName.trim() || `v${versions.length + 1}`;
    savePromptVersion({
      name,
      labels: selectedLabels,
      prompt,
      savedAt: new Date().toISOString(),
      scores: currentScores,
    });
    setNewName("");
    refresh();
  }

  function handleDelete(name: string) {
    deletePromptVersion(name);
    if (diffTarget !== "baseline" && diffTarget?.name === name) setDiffTarget("baseline");
    refresh();
  }

  function handleLoad(v: PromptVersion) {
    onLoadPrompt(v.prompt);
  }

  function handleToggleDiff(v: PromptVersion) {
    setDiffTarget((prev) => (prev !== "baseline" && prev?.name === v.name ? null : v));
  }

  function toggleLabel(label: PromptVersionLabel) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>Prompt versions</SectionTitle>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-medium text-slate-900">Current prompt</span>
              {selectedLabels.map((label) => (
                <PromptLabelPill key={label} label={label} />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ScoreSnapshotBadge summary={currentSummary} />
              <ScoreDeltaBadge delta={currentDelta} />
            </div>
          </div>
          <button
            onClick={() => setDiffTarget("baseline")}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
              diffTarget === "baseline"
                ? "border-slate-300 bg-slate-100 text-slate-800"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
            )}
          >
            <GitCompare className="size-3" />
            Baseline diff
          </button>
        </div>
      </div>

      {/* Save current */}
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Version name (e.g. v2-coverage-guardrail)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            onClick={handleSave}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800"
          >
            <Save className="size-3" />
            Save
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_VERSION_LABELS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleLabel(item.id)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                selectedLabels.includes(item.id)
                  ? labelClass(item.id)
                  : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Version list */}
      {versions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-[12.5px] text-slate-400">
          No saved versions. Save the current prompt to start tracking changes.
        </p>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <div
              key={v.name}
              className={cn(
                "rounded-lg border bg-white p-3",
                diffTarget !== "baseline" && diffTarget?.name === v.name
                  ? "border-slate-400 ring-1 ring-slate-300"
                  : "border-slate-200",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-slate-900">{v.name}</span>
                    {(v.labels ?? []).map((label) => (
                      <PromptLabelPill key={label} label={label} />
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">
                      {new Date(v.savedAt).toLocaleString()}
                    </span>
                    <ScoreSnapshotBadge summary={summarizeScoreSnapshot(v.scores)} />
                    <ScoreDeltaBadge delta={scoreSnapshotDelta(v.scores, baselineScoreSnapshot)} />
                  </div>
                  {v.scores && Object.keys(v.scores).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(v.scores).map(([id, score]) => (
                        <span
                          key={id}
                          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-600"
                        >
                          {id.replace(/-/g, " ")} {score}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggleDiff(v)}
                    title="Compare with current"
                    className={cn(
                      "rounded p-1 text-[11px]",
                      diffTarget !== "baseline" && diffTarget?.name === v.name
                        ? "bg-slate-200 text-slate-800"
                        : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
                    )}
                  >
                    <GitCompare className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleLoad(v)}
                    title="Load this prompt"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(v.name)}
                    title="Delete this version"
                    className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diff view */}
      {diff && selectedDiffTarget && (
        <PromptDiffView
          title={`Diff — ${selectedDiffTarget.name} -> current`}
          diff={diff}
        />
      )}
    </div>
  );
}

function PromptLabelPill({ label }: { label: PromptVersionLabel }) {
  const meta = PROMPT_VERSION_LABELS.find((item) => item.id === label);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium ring-1 ring-inset",
        labelClass(label),
      )}
    >
      {meta?.label ?? label}
    </span>
  );
}

function labelClass(label: PromptVersionLabel): string {
  if (label === "baseline") return "bg-slate-100 text-slate-700 ring-slate-200";
  if (label === "regression") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (label === "fix") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function ScoreSnapshotBadge({
  summary,
}: {
  summary: { display: string; available: boolean };
}) {
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-600">
      score {summary.display}
    </span>
  );
}

function ScoreDeltaBadge({ delta }: { delta?: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-px font-mono text-[10px]",
        delta === undefined
          ? "bg-slate-100 text-slate-400"
          : delta < 0
            ? "bg-rose-50 text-rose-700"
            : delta > 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600",
      )}
    >
      {formatBaselineDelta(delta)}
    </span>
  );
}

function PromptDiffView({
  title,
  diff,
}: {
  title: string;
  diff: ReturnType<typeof diffPrompts>;
}) {
  const added = diff.filter((line) => line.type === "added").length;
  const removed = diff.filter((line) => line.type === "removed").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        <div className="flex items-center gap-1">
          <NeutralBadge>+{added}</NeutralBadge>
          <NeutralBadge>-{removed}</NeutralBadge>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {diff.map((line, i) => (
          <div
            key={`${line.type}-${line.oldLine ?? "-"}-${line.newLine ?? "-"}-${i}`}
            className={cn(
              "grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-2 px-2.5 py-0.5 font-mono text-[11px] leading-relaxed",
              line.type === "added" && "bg-emerald-50 text-emerald-800",
              line.type === "removed" && "bg-rose-50 text-rose-800",
              line.type === "equal" && "text-slate-500",
            )}
          >
            <span className="select-none text-right text-slate-400">
              {line.oldLine ?? line.newLine ?? ""}
            </span>
            <span className="select-none">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className={cn("min-w-0 whitespace-pre-wrap", line.type === "removed" && "line-through opacity-75")}>
              {line.line || " "}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarizeScoreSnapshot(scores?: Record<string, string>): {
  score: number;
  max: number;
  display: string;
  available: boolean;
} {
  if (!scores || Object.keys(scores).length === 0) {
    return { score: 0, max: 0, display: "not run", available: false };
  }

  let score = 0;
  let max = 0;
  for (const value of Object.values(scores)) {
    const [scoreRaw, maxRaw] = value.split("/");
    score += Number.parseFloat(scoreRaw) || 0;
    max += Number.parseFloat(maxRaw) || 0;
  }

  return {
    score,
    max,
    display: `${formatNumber(score)}/${formatNumber(max)}`,
    available: true,
  };
}

function scoreSnapshotDelta(
  scores?: Record<string, string>,
  baselineScores?: Record<string, string>,
): number | undefined {
  const current = summarizeScoreSnapshot(scores);
  const baseline = summarizeScoreSnapshot(baselineScores);
  if (!current.available || !baseline.available) return undefined;
  return current.score - baseline.score;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
