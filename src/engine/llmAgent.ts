import { z } from "zod";
import type { Agent, AgentContext, AgentOutput } from "./types";
import { deterministicAgent } from "./deterministicAgent";

// LLM-backed agent. Runs in the browser and calls the local /api/llm proxy so
// the API key stays server-side. The model's structured output is validated with
// Zod; on any error (network, bad JSON, schema mismatch) it falls back to the
// deterministic agent so a run always completes.
//
// The system prompt is INJECTED (not imported) so the UI can run an edited prompt
// through a live model — that is what makes the prompt-regression loop real.

const OutputSchema = z.object({
  spoken_response: z.string(),
  state: z.enum([
    "greeting",
    "identity_verification",
    "policy_lookup",
    "intake",
    "tool_call",
    "coverage_boundary",
    "escalation",
    "resolved",
  ]),
  next_required_field: z.string().nullable(),
  tool_call: z
    .object({
      name: z.enum([
        "verifyIdentity",
        "lookupPolicy",
        "createClaim",
        "updatePolicyDraft",
        "escalateToHuman",
      ]),
      args: z.record(z.unknown()),
    })
    .nullable(),
  risk_flags: z.array(z.string()),
  confidence: z.number(),
});

function buildUserPrompt(ctx: AgentContext): string {
  const transcript = ctx.history.map((t) => `${t.speaker}: ${t.text}`).join("\n");
  const facts = [
    `scenario_id: ${ctx.scenario.id}`,
    `customerId: ${ctx.scenario.customerId}`,
    `policyId: ${ctx.scenario.policyId}`,
    `required_fields: ${ctx.scenario.requiredFields.join(", ") || "(none)"}`,
    `identity_verified: ${ctx.verified}`,
    `policy_looked_up: ${ctx.policyLookedUp}`,
    `collected: ${JSON.stringify(ctx.collected)}`,
  ].join("\n");

  return [
    transcript ? `Conversation so far:\n${transcript}` : "This is the very start of the call.",
    `\nContext:\n${facts}`,
    "\nProduce ONLY a single JSON object for your NEXT turn, matching the output schema. No prose, no code fences.",
  ].join("\n");
}

function parseOutput(content: string): AgentOutput | null {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const obj = JSON.parse(cleaned);
    const result = OutputSchema.safeParse(obj);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function makeLlmAgent(systemPrompt: string): Agent {
  return async (ctx: AgentContext): Promise<AgentOutput> => {
    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, user: buildUserPrompt(ctx) }),
      });
      if (!res.ok) throw new Error(`llm proxy responded ${res.status}`);
      const data = (await res.json()) as { content?: string };
      const parsed = data.content ? parseOutput(data.content) : null;
      if (parsed) return parsed;
      throw new Error("LLM returned no valid structured output");
    } catch {
      // Graceful fallback keeps the demo reliable even if the model misbehaves.
      return deterministicAgent(ctx);
    }
  };
}
