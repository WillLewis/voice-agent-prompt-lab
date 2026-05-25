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
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
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
