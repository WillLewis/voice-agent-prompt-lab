import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LabView, ToolCallView, PromptVersion } from "@/lab/types";
import {
  loadPromptVersions,
  savePromptVersion,
  deletePromptVersion,
  diffPrompts,
} from "@/lab/types";
import type { RunMode } from "@/engine/types";
import type { EvalResult } from "@/engine/types";
import { EvalBadge, NeutralBadge } from "./StatusBadge";
import { Wrench, FileText, ClipboardCheck, Network, RotateCcw, Gavel, GitCompare, Save, Trash2, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { runBrowserJudge } from "@/engine/llmJudge";

type InspectorProps = {
  view: LabView;
  prompt: string;
  mode: RunMode;
  edited: boolean;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
  /** All current scores by scenarioId — used to snapshot per-version scores. */
  currentScores?: Record<string, string>;
};

export function InspectorTabs({
  view,
  prompt,
  mode,
  edited,
  onPromptChange,
  onResetPrompt,
  currentScores,
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
            <TabTrigger value="versions" icon={GitCompare} label="Versions" />
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
            />
          </TabsContent>
          <TabsContent value="tools" className="mt-0">
            <ToolCallsView view={view} />
          </TabsContent>
          <TabsContent value="eval" className="mt-0">
            <ScorecardView view={view} />
          </TabsContent>
          <TabsContent value="judge" className="mt-0">
            <JudgeView view={view} mode={mode} />
          </TabsContent>
          <TabsContent value="versions" className="mt-0">
            <VersionsView
              prompt={prompt}
              currentScores={currentScores}
              onLoadPrompt={onPromptChange}
            />
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

// ---------------------------------------------------------------------------
// Item 3: LLM Judge tab
// ---------------------------------------------------------------------------

function JudgeView({ view, mode }: { view: LabView; mode: RunMode }) {
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

  const needsLlm = mode !== "llm";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>LLM Judge (optional)</SectionTitle>
        <button
          onClick={handleRunJudge}
          disabled={judging || needsLlm}
          title={needsLlm ? "Switch to LLM mode and configure an API key to enable the judge" : undefined}
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
          Switch to <strong>LLM</strong> mode and configure an API key to run the judge.
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
  onLoadPrompt,
}: {
  prompt: string;
  currentScores?: Record<string, string>;
  onLoadPrompt: (p: string) => void;
}) {
  const [versions, setVersions] = useState<PromptVersion[]>(() => loadPromptVersions());
  const [newName, setNewName] = useState("");
  const [diffTarget, setDiffTarget] = useState<PromptVersion | null>(null);

  function refresh() {
    setVersions(loadPromptVersions());
  }

  function handleSave() {
    const name = newName.trim() || `v${versions.length + 1}`;
    savePromptVersion({
      name,
      prompt,
      savedAt: new Date().toISOString(),
      scores: currentScores,
    });
    setNewName("");
    refresh();
  }

  function handleDelete(name: string) {
    deletePromptVersion(name);
    if (diffTarget?.name === name) setDiffTarget(null);
    refresh();
  }

  function handleLoad(v: PromptVersion) {
    onLoadPrompt(v.prompt);
  }

  function handleToggleDiff(v: PromptVersion) {
    setDiffTarget((prev) => (prev?.name === v.name ? null : v));
  }

  const diff = diffTarget ? diffPrompts(diffTarget.prompt, prompt) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>Prompt versions</SectionTitle>
      </div>

      {/* Save current */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Version name (e.g. v1-strict-guardrails)"
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
                diffTarget?.name === v.name ? "border-slate-400 ring-1 ring-slate-300" : "border-slate-200",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-slate-900">{v.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(v.savedAt).toLocaleString()}
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
                      diffTarget?.name === v.name
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
      {diff && diffTarget && (
        <div className="space-y-2">
          <SectionTitle>Diff — {diffTarget.name} → current</SectionTitle>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {diff.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "px-3 py-0.5 font-mono text-[11px] leading-relaxed",
                  line.type === "added" && "bg-emerald-50 text-emerald-800",
                  line.type === "removed" && "bg-rose-50 text-rose-800 line-through opacity-70",
                  line.type === "equal" && "text-slate-500",
                )}
              >
                {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                {line.line || " "}
              </div>
            ))}
          </div>
        </div>
      )}
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
