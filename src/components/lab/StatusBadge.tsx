import { cn } from "@/lib/utils";
import type { EvalStatus, Risk, CallState } from "@/lab/types";

const evalStyles: Record<EvalStatus, string> = {
  pass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  fail: "bg-rose-50 text-rose-700 ring-rose-200",
};

const riskStyles: Record<Risk, string> = {
  low: "bg-slate-100 text-slate-700 ring-slate-200",
  high: "bg-orange-50 text-orange-800 ring-orange-200",
  adversarial: "bg-violet-50 text-violet-800 ring-violet-200",
};

const stateStyles: Record<CallState, string> = {
  intake: "bg-sky-50 text-sky-800 ring-sky-200",
  verification: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  triage: "bg-amber-50 text-amber-800 ring-amber-200",
  handoff: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const base =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset";

export function EvalBadge({ status, label }: { status: EvalStatus; label?: string }) {
  return <span className={cn(base, evalStyles[status])}>{label ?? status}</span>;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={cn(base, riskStyles[risk])}>{risk}</span>;
}

export function StateBadge({ state }: { state: CallState }) {
  return <span className={cn(base, stateStyles[state])}>{state}</span>;
}

export function NeutralBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(base, "bg-slate-100 text-slate-600 ring-slate-200 normal-case tracking-normal", className)}>
      {children}
    </span>
  );
}
