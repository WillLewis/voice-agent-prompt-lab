import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { selectProvider, callProvider, callProviderFreeform } from "../engine/llmClient";
import { loadEnvKeys } from "./envKeys";

// Dev-only middleware that exposes /api/llm, /api/llm-judge, and /api/llm-status.
// The API key is read server-side (from .dev.vars / .env or process.env) and never
// sent to the browser. LLM mode is optional; with no key the status endpoint
// reports unavailable and the UI keeps the toggles disabled.

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

      // Main agent endpoint (tool-forced structured output for the agent;
      // freeform text for the caller when body.freeform === true).
      server.middlewares.use("/api/llm", async (req, res, next) => {
        if (req.method !== "POST") return next();
        try {
          const sel = selectProvider(loadEnvKeys(server.config.root));
          if (!sel) return json(res, 503, { error: "No API key configured." });
          const body = JSON.parse((await readBody(req)) || "{}") as {
            system?: string;
            user?: string;
            freeform?: boolean;
          };
          const caller = body.freeform === true ? callProviderFreeform : callProvider;
          const content = await caller(sel, body.system ?? "", body.user ?? "");
          json(res, 200, { content });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      // LLM-judge endpoint (Item 3). Uses freeform text output — the model
      // returns raw JSON text, not a tool-forced schema. This keeps the judge
      // schema separate from the agent schema.
      server.middlewares.use("/api/llm-judge", async (req, res, next) => {
        if (req.method !== "POST") return next();
        try {
          const sel = selectProvider(loadEnvKeys(server.config.root));
          if (!sel) return json(res, 503, { error: "No API key configured." });
          const body = JSON.parse((await readBody(req)) || "{}") as {
            system?: string;
            user?: string;
          };
          const content = await callProviderFreeform(sel, body.system ?? "", body.user ?? "");
          json(res, 200, { content });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
