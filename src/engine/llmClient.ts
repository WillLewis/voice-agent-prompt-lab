// Provider-agnostic LLM call used SERVER-SIDE only (by the dev middleware). It
// takes the API key as an argument, so this module never reads env or holds
// secrets itself. Uses fetch — no provider SDK dependency.

export type Provider = "anthropic" | "openai";

export interface ProviderSelection {
  provider: Provider;
  apiKey: string;
  model: string;
}

export interface EnvKeys {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  LPL_MODEL?: string;
}

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
};

// JSON Schema for the agent's structured turn. Mirrors the Zod OutputSchema in
// llmAgent.ts / the AgentOutput type. Used as an Anthropic tool input_schema so
// that, with a forced tool_choice, the model's output is API-ENFORCED to this
// shape — it cannot return prose or off-schema keys regardless of the prompt.
// This is what makes the lab robust to any prompt (even a one-liner): structure
// is guaranteed by the API, not requested in the prompt.
const TURN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    spoken_response: { type: "string", description: "What the agent says to the caller this turn." },
    state: {
      type: "string",
      enum: [
        "greeting",
        "identity_verification",
        "policy_lookup",
        "intake",
        "tool_call",
        "coverage_boundary",
        "escalation",
        "resolved",
      ],
    },
    next_required_field: { type: ["string", "null"] },
    tool_call: {
      type: ["object", "null"],
      properties: {
        name: {
          type: "string",
          enum: ["verifyIdentity", "lookupPolicy", "createClaim", "updatePolicyDraft", "escalateToHuman"],
        },
        args: { type: "object" },
      },
      required: ["name", "args"],
    },
    risk_flags: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["spoken_response", "state", "next_required_field", "tool_call", "risk_flags", "confidence"],
};

export function selectProvider(env: EnvKeys): ProviderSelection | null {
  if (env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.LPL_MODEL || DEFAULT_MODEL.anthropic,
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: env.OPENAI_API_KEY,
      model: env.LPL_MODEL || DEFAULT_MODEL.openai,
    };
  }
  return null;
}

export async function callProvider(
  sel: ProviderSelection,
  system: string,
  user: string,
): Promise<string> {
  if (sel.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": sel.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: sel.model,
        max_tokens: 1024,
        system,
        tools: [
          {
            name: "emit_turn",
            description: "Emit the agent's next conversational turn as structured data.",
            input_schema: TURN_INPUT_SCHEMA,
          },
        ],
        // Force the model to answer via the tool, so its output is guaranteed to
        // conform to TURN_INPUT_SCHEMA no matter what the system prompt contains.
        tool_choice: { type: "tool", name: "emit_turn" },
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
    const toolUse = data.content?.find((b) => b.type === "tool_use");
    // Serialize the structured tool input back to JSON so the /api/llm contract
    // (and llmAgent's parser) stay unchanged; Zod still validates as a backstop.
    return toolUse ? JSON.stringify(toolUse.input ?? {}) : "";
  }

  // openai
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${sel.apiKey}` },
    body: JSON.stringify({
      model: sel.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Freeform provider call — no tool-forcing, no json_object constraint. Used
 *  by the LLM caller (Item 1) and the LLM judge (Item 3) where we need plain
 *  text or free JSON rather than the agent's structured schema. */
export async function callProviderFreeform(
  sel: ProviderSelection,
  system: string,
  user: string,
): Promise<string> {
  if (sel.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": sel.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: sel.model,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.find((b) => b.type === "text")?.text ?? "";
  }

  // openai — plain text, not forced JSON
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${sel.apiKey}` },
    body: JSON.stringify({
      model: sel.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data2 = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data2.choices?.[0]?.message?.content ?? "";
}
