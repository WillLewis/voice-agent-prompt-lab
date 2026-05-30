import { z } from "zod";
import { SCENARIOS_BY_ID } from "../data/scenarios";
import { buildAgentUserPrompt } from "../engine/llmAgent";
import { callProvider, callProviderFreeform, type EnvKeys, type ProviderSelection } from "../engine/llmClient";
import type { AgentContext, AgentState, Speaker } from "../engine/types";
import { getPromptPreset } from "../prompts/promptPresets";

const PUBLIC_BASE_PATH = "/voice";
const MAX_BODY_BYTES = 20_000;
const PUBLIC_TIMEOUT_MS = 12_000;
const PUBLIC_MAX_TOKENS = 700;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

type RateLimitBinding = {
  limit: (input: { key: string }) => Promise<{ success: boolean }>;
};

export type LlmApiEnv = EnvKeys & {
  LPL_RATE_LIMITER?: RateLimitBinding;
};

const SpeakerSchema = z.enum(["customer", "agent", "system"]);
const StateSchema = z.enum([
  "greeting",
  "identity_verification",
  "policy_lookup",
  "intake",
  "tool_call",
  "coverage_boundary",
  "escalation",
  "resolved",
]);
const PromptPresetIdSchema = z.enum(["robust", "okay", "weak"]);

const PublicContextSchema = z
  .object({
    history: z
      .array(
        z
          .object({
            speaker: SpeakerSchema,
            text: z.string().max(1_200),
            state: StateSchema.optional(),
            riskFlags: z.array(z.string().max(80)).max(12).optional(),
          })
          .strict(),
      )
      .max(24),
    collected: z.record(z.string().max(500)),
    lastCustomer: z.string().max(1_200).nullable(),
    verified: z.boolean(),
    policyLookedUp: z.boolean(),
    lastToolResult: z.record(z.unknown()).nullable(),
  })
  .strict();

const PublicAgentRequestSchema = z
  .object({
    kind: z.literal("agentTurn"),
    scenarioId: z.string().min(1).max(80),
    promptPresetId: PromptPresetIdSchema,
    context: PublicContextSchema,
  })
  .strict();

const LegacyRequestSchema = z
  .object({
    system: z.string().max(30_000),
    user: z.string().max(30_000),
    freeform: z.boolean().optional(),
  })
  .strict();

type LlmRoute = "status" | "agent" | "judge";

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function flag(value: unknown): boolean {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

function asEnv(env: unknown): LlmApiEnv {
  return env && typeof env === "object" ? (env as LlmApiEnv) : {};
}

function getRoute(request: Request): LlmRoute | null {
  const { pathname } = new URL(request.url);
  const path = pathname.startsWith(`${PUBLIC_BASE_PATH}/`)
    ? pathname.slice(PUBLIC_BASE_PATH.length)
    : pathname;
  if (path === "/api/llm-status") return "status";
  if (path === "/api/llm") return "agent";
  if (path === "/api/llm-judge") return "judge";
  return null;
}

function selectAnthropic(env: LlmApiEnv): ProviderSelection | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return {
    provider: "anthropic",
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.LPL_MODEL || DEFAULT_ANTHROPIC_MODEL,
  };
}

function hasRateLimiter(env: LlmApiEnv): boolean {
  return typeof env.LPL_RATE_LIMITER?.limit === "function";
}

function statusPayload(env: LlmApiEnv) {
  const publicDemo = flag(env.LPL_PUBLIC_DEMO);
  const llmEnabled = flag(env.LPL_LLM_ENABLED);
  const selected = selectAnthropic(env);
  let reason: string | undefined;

  if (publicDemo && !llmEnabled) reason = "LPL_LLM_ENABLED is not true.";
  else if (!selected) reason = "ANTHROPIC_API_KEY is not configured.";
  else if (publicDemo && !env.LPL_ALLOWED_ORIGIN) reason = "LPL_ALLOWED_ORIGIN is not configured.";
  else if (publicDemo && !hasRateLimiter(env)) reason = "Cloudflare rate limiting is not configured.";

  const available = !reason && !!selected;
  return {
    available,
    provider: available ? selected?.provider : null,
    model: available ? selected?.model : null,
    publicDemo,
    capabilities: {
      agent: available,
      judge: available && !publicDemo,
      liveCaller: available && !publicDemo,
    },
    reason,
  };
}

function checkAllowedOrigin(request: Request, env: LlmApiEnv): Response | null {
  if (!flag(env.LPL_PUBLIC_DEMO)) return null;
  const allowed = env.LPL_ALLOWED_ORIGIN;
  if (!allowed) return json(503, { error: "LLM origin policy is not configured." });

  const origin = request.headers.get("origin");
  if (origin === allowed) return null;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === allowed) return null;
    } catch {
      // fall through
    }
  }

  return json(403, { error: "Origin is not allowed." });
}

async function checkRateLimit(request: Request, env: LlmApiEnv): Promise<Response | null> {
  if (!flag(env.LPL_PUBLIC_DEMO)) return null;
  const limiter = env.LPL_RATE_LIMITER;
  if (!limiter) return json(503, { error: "LLM rate limit is not configured." });

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  const result = await limiter.limit({ key: ip });
  return result.success ? null : json(429, { error: "LLM rate limit exceeded." });
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Response(JSON.stringify({ error: "Expected application/json." }), {
      status: 415,
      headers: { "content-type": "application/json" },
    });
  }

  const length = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new Response(JSON.stringify({ error: "Request body is too large." }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Response(JSON.stringify({ error: "Request body is too large." }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }
  return JSON.parse(text || "{}");
}

function toAgentContext(input: z.infer<typeof PublicAgentRequestSchema>): AgentContext | null {
  const scenario = SCENARIOS_BY_ID[input.scenarioId];
  if (!scenario) return null;

  return {
    scenario,
    history: input.context.history.map((turn, index) => ({
      id: `public-${index}`,
      speaker: turn.speaker as Speaker,
      text: turn.text,
      state: turn.state as AgentState | undefined,
      riskFlags: turn.riskFlags,
    })),
    collected: input.context.collected,
    lastCustomer: input.context.lastCustomer,
    verified: input.context.verified,
    policyLookedUp: input.context.policyLookedUp,
    lastToolResult: input.context.lastToolResult,
  };
}

async function handlePublicAgentRequest(request: Request, env: LlmApiEnv): Promise<Response> {
  const status = statusPayload(env);
  if (!status.available) return json(503, { error: status.reason ?? "LLM unavailable." });

  const originError = checkAllowedOrigin(request, env);
  if (originError) return originError;
  const rateLimitError = await checkRateLimit(request, env);
  if (rateLimitError) return rateLimitError;

  const body = PublicAgentRequestSchema.safeParse(await readJson(request));
  if (!body.success) return json(400, { error: "Invalid public LLM request." });

  const ctx = toAgentContext(body.data);
  if (!ctx) return json(400, { error: "Unknown scenarioId." });

  const sel = selectAnthropic(env);
  if (!sel) return json(503, { error: "ANTHROPIC_API_KEY is not configured." });

  const system = getPromptPreset(body.data.promptPresetId).prompt;
  const user = buildAgentUserPrompt(ctx);
  const content = await callProvider(sel, system, user, {
    timeoutMs: PUBLIC_TIMEOUT_MS,
    maxTokens: PUBLIC_MAX_TOKENS,
  });
  return json(200, { content });
}

async function handleLegacyRequest(request: Request, env: LlmApiEnv): Promise<Response> {
  if (flag(env.LPL_PUBLIC_DEMO)) {
    return json(400, { error: "Public LLM requests must use scenarioId and promptPresetId." });
  }

  const sel = selectAnthropic(env);
  if (!sel) return json(503, { error: "ANTHROPIC_API_KEY is not configured." });

  const body = LegacyRequestSchema.safeParse(await readJson(request));
  if (!body.success) return json(400, { error: "Invalid LLM request." });

  const caller = body.data.freeform === true ? callProviderFreeform : callProvider;
  const content = await caller(sel, body.data.system, body.data.user);
  return json(200, { content });
}

async function handleJudgeRequest(request: Request, env: LlmApiEnv): Promise<Response> {
  if (flag(env.LPL_PUBLIC_DEMO)) {
    return json(403, { error: "LLM judge is disabled in the public demo." });
  }
  const sel = selectAnthropic(env);
  if (!sel) return json(503, { error: "ANTHROPIC_API_KEY is not configured." });

  const body = LegacyRequestSchema.omit({ freeform: true }).safeParse(await readJson(request));
  if (!body.success) return json(400, { error: "Invalid judge request." });

  const content = await callProviderFreeform(sel, body.data.system, body.data.user);
  return json(200, { content });
}

export async function handleLlmApi(request: Request, rawEnv: unknown): Promise<Response | null> {
  const route = getRoute(request);
  if (!route) return null;

  const env = asEnv(rawEnv);
  try {
    if (route === "status") {
      if (request.method !== "GET") return json(405, { error: "Method not allowed." });
      return json(200, statusPayload(env));
    }

    if (request.method !== "POST") return json(405, { error: "Method not allowed." });
    if (route === "judge") return await handleJudgeRequest(request, env);

    if (flag(env.LPL_PUBLIC_DEMO)) {
      return await handlePublicAgentRequest(request, env);
    }
    return await handleLegacyRequest(request, env);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SyntaxError) return json(400, { error: "Invalid JSON." });
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
