import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EnvKeys } from "../engine/llmClient";

// Server/CLI-only: reads provider keys from .dev.vars / .env files (real process
// env wins). Shared by the dev LLM proxy and the CLI eval runner. Never logs
// values. Not imported by the browser bundle.

const KEY_NAMES = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LPL_MODEL"] as const;

export function loadEnvKeys(root: string): EnvKeys {
  const env: Record<string, string> = {};
  for (const file of [".dev.vars", ".env", ".env.local"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  // Real process env wins over files.
  for (const k of KEY_NAMES) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env as EnvKeys;
}
