import type { RunMode } from "../engine/types";
import type { PromptPresetId } from "../prompts/promptPresets";

export const PUBLIC_LLM_RUNS_PER_PROMPT_PRESET = 3;
export const PUBLIC_LLM_TOTAL_RUN_LIMIT = PUBLIC_LLM_RUNS_PER_PROMPT_PRESET * 3;
export const PUBLIC_LLM_USAGE_STORAGE_KEY = "lpl-public-llm-runs-by-preset-v1";

const PROMPT_PRESET_IDS: PromptPresetId[] = ["robust", "okay", "weak"];

export type PublicLlmUsage = Record<PromptPresetId, number>;

export type PublicLlmQuotaSnapshot = {
  perPresetLimit: number;
  totalLimit: number;
  usedByPreset: PublicLlmUsage;
  remainingByPreset: PublicLlmUsage;
  usedTotal: number;
  remainingTotal: number;
};

export function envFlag(value: unknown): boolean {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

export function isPublicDemoBuild(): boolean {
  const env = (
    import.meta as unknown as {
      env?: { VITE_LPL_PUBLIC_DEMO?: string; BASE_URL?: string; PROD?: boolean };
    }
  ).env;
  return envFlag(env?.VITE_LPL_PUBLIC_DEMO) || (env?.PROD === true && env.BASE_URL === "/voice/");
}

export function isPromptEditorReadOnly(publicDemo: boolean): boolean {
  return publicDemo;
}

export function canRunAll(mode: RunMode, publicDemo: boolean): boolean {
  return !(publicDemo && mode === "llm");
}

export function emptyPublicLlmUsage(): PublicLlmUsage {
  return { robust: 0, okay: 0, weak: 0 };
}

export function normalizePublicLlmUsage(value: unknown): PublicLlmUsage {
  const next = emptyPublicLlmUsage();
  if (!value || typeof value !== "object") return next;

  const raw = value as Record<string, unknown>;
  for (const id of PROMPT_PRESET_IDS) {
    const count = typeof raw[id] === "number" ? raw[id] : Number.parseInt(String(raw[id] ?? 0), 10);
    next[id] = Number.isFinite(count)
      ? Math.max(0, Math.min(PUBLIC_LLM_RUNS_PER_PROMPT_PRESET, Math.floor(count)))
      : 0;
  }
  return next;
}

export function quotaFromUsage(usage: PublicLlmUsage): PublicLlmQuotaSnapshot {
  const usedByPreset = normalizePublicLlmUsage(usage);
  const remainingByPreset = emptyPublicLlmUsage();
  for (const id of PROMPT_PRESET_IDS) {
    remainingByPreset[id] = Math.max(0, PUBLIC_LLM_RUNS_PER_PROMPT_PRESET - usedByPreset[id]);
  }

  const usedTotal = PROMPT_PRESET_IDS.reduce((sum, id) => sum + usedByPreset[id], 0);
  return {
    perPresetLimit: PUBLIC_LLM_RUNS_PER_PROMPT_PRESET,
    totalLimit: PUBLIC_LLM_TOTAL_RUN_LIMIT,
    usedByPreset,
    remainingByPreset,
    usedTotal,
    remainingTotal: Math.max(0, PUBLIC_LLM_TOTAL_RUN_LIMIT - usedTotal),
  };
}

export function readPublicLlmUsage(storage?: Pick<Storage, "getItem"> | null): PublicLlmUsage {
  if (!storage) return emptyPublicLlmUsage();
  try {
    const raw = storage.getItem(PUBLIC_LLM_USAGE_STORAGE_KEY);
    return normalizePublicLlmUsage(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyPublicLlmUsage();
  }
}

export function writePublicLlmUsage(
  storage: Pick<Storage, "setItem"> | null | undefined,
  usage: PublicLlmUsage,
): void {
  if (!storage) return;
  storage.setItem(PUBLIC_LLM_USAGE_STORAGE_KEY, JSON.stringify(normalizePublicLlmUsage(usage)));
}

export function reservePublicLlmRun(
  usage: PublicLlmUsage,
  presetId: PromptPresetId,
): { ok: boolean; usage: PublicLlmUsage; quota: PublicLlmQuotaSnapshot } {
  const next = normalizePublicLlmUsage(usage);
  if (next[presetId] >= PUBLIC_LLM_RUNS_PER_PROMPT_PRESET) {
    return { ok: false, usage: next, quota: quotaFromUsage(next) };
  }

  next[presetId] += 1;
  return { ok: true, usage: next, quota: quotaFromUsage(next) };
}
