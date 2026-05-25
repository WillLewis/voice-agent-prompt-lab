import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { selectProvider, callProvider, type EnvKeys } from "../engine/llmClient";

// Dev-only middleware that exposes /api/llm and /api/llm-status. The API key is
// read server-side (from .dev.vars / .env or process.env) and never sent to the
// browser. LLM mode is optional; with no key the status endpoint reports
// unavailable and the UI keeps the toggle disabled.

const KEY_NAMES = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LPL_MODEL"] as const;

function loadEnvKeys(root: string): EnvKeys {
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolveBody(data));
    req.on("error", () => resolveBody(""));
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

export function llmProxyPlugin(): Plugin {
  return {
    name: "lpl-llm-proxy",
    configureServer(server) {
      server.middlewares.use("/api/llm-status", (req, res, next) => {
        if (req.method !== "GET") return next();
        const sel = selectProvider(loadEnvKeys(server.config.root));
        json(res, 200, { available: !!sel, provider: sel?.provider ?? null });
      });

      server.middlewares.use("/api/llm", async (req, res, next) => {
        if (req.method !== "POST") return next();
        try {
          const sel = selectProvider(loadEnvKeys(server.config.root));
          if (!sel) return json(res, 503, { error: "No API key configured." });
          const body = JSON.parse((await readBody(req)) || "{}") as {
            system?: string;
            user?: string;
          };
          const content = await callProvider(sel, body.system ?? "", body.user ?? "");
          json(res, 200, { content });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
