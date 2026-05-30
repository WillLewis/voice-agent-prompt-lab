import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleLlmApi } from "./llmApi";
import { loadEnvKeys } from "./envKeys";

// Local dev middleware for optional LLM mode. It delegates to the same Fetch
// handler used by the Cloudflare Worker so production and dev share validation.

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolveBody(data));
    req.on("error", () => resolveBody(""));
  });
}

function headersFromNode(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function nodeRequest(req: IncomingMessage, path: string): Promise<Request> {
  const origin = `http://${req.headers.host ?? "localhost"}`;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  return new Request(`${origin}${path}`, {
    method: req.method ?? "GET",
    headers: headersFromNode(req),
    body,
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}

export function llmProxyPlugin(): Plugin {
  return {
    name: "lpl-llm-proxy",
    configureServer(server) {
      const handle = async (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
        path: string,
      ) => {
        const request = await nodeRequest(req, path);
        const response = await handleLlmApi(request, loadEnvKeys(server.config.root));
        if (!response) return next();
        await writeResponse(res, response);
      };

      for (const base of ["", "/voice"]) {
        server.middlewares.use(`${base}/api/llm-status`, (req, res, next) => {
          void handle(req, res, next, `${base}/api/llm-status`);
        });
        server.middlewares.use(`${base}/api/llm`, (req, res, next) => {
          void handle(req, res, next, `${base}/api/llm`);
        });
        server.middlewares.use(`${base}/api/llm-judge`, (req, res, next) => {
          void handle(req, res, next, `${base}/api/llm-judge`);
        });
      }
    },
  };
}
