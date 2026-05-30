import type { RunMode } from "../engine/types";

export const PUBLIC_LLM_RUN_LIMIT = 3;

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
