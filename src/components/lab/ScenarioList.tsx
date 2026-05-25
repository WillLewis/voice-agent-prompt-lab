import { cn } from "@/lib/utils";
import type { ScenarioMeta } from "@/lab/types";
import { EvalBadge, RiskBadge } from "./StatusBadge";

type Props = {
  items: ScenarioMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  footer?: string;
};

export function ScenarioList({ items, activeId, onSelect, footer }: Props) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50">
      <div className="px-4 pt-4 pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Scenarios
        </div>
        <div className="text-xs text-slate-400">{items.length} eval suites</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
        {items.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-slate-300 bg-white shadow-sm"
                  : "border-transparent hover:bg-white hover:border-slate-200",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-slate-900 leading-snug">{s.title}</div>
                <EvalBadge status={s.lastEval} />
              </div>
              <div className="mt-1 text-xs text-slate-500 leading-snug line-clamp-2">
                {s.intent}
              </div>
              <div className="mt-2">
                <RiskBadge risk={s.risk} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="border-t border-slate-200 px-4 py-3 text-[11px] text-slate-400">
        {footer ?? "Local engine · live evals"}
      </div>
    </aside>
  );
}
