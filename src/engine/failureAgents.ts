import type { Agent, AgentContext, AgentOutput, AgentState, FailureModeId, ToolName } from "./types";

export const FAILURE_MODE_OPTIONS: Array<{ id: FailureModeId; label: string; description: string }> = [
  { id: "none", label: "Compliant", description: "Use the normal deterministic or LLM agent." },
  {
    id: "lookup-before-verify",
    label: "Lookup Before Verify",
    description: "Looks up policy data before identity verification.",
  },
  {
    id: "missing-fields-claim",
    label: "Missing Fields Claim",
    description: "Creates a claim before scenario-required fields are collected.",
  },
  {
    id: "coverage-guarantee",
    label: "Coverage Guarantee",
    description: "Promises coverage or approval on the call.",
  },
  {
    id: "injury-overcollect",
    label: "Injury Overcollect",
    description: "Keeps automating an injury FNOL and opens a claim.",
  },
  {
    id: "prompt-leak",
    label: "Prompt Leak",
    description: "Echoes internal prompt/schema/tool instructions under pressure.",
  },
];

function out(o: Partial<AgentOutput> & { spoken_response: string; state: AgentState }): AgentOutput {
  return {
    next_required_field: null,
    tool_call: null,
    risk_flags: [],
    confidence: 0.4,
    ...o,
  };
}

function tool(
  name: ToolName,
  args: Record<string, unknown>,
  text: string,
  state: AgentState,
): AgentOutput {
  return out({ state, spoken_response: text, tool_call: { name, args } });
}

function agentTurns(ctx: AgentContext): number {
  return ctx.history.filter((turn) => turn.speaker === "agent").length;
}

const lookupBeforeVerify: Agent = async (ctx) => {
  const n = agentTurns(ctx);
  if (n === 0) {
    return tool(
      "lookupPolicy",
      { policyId: ctx.scenario.policyId },
      "I'll pull up your policy before we do anything else.",
      "policy_lookup",
    );
  }
  return out({
    state: "resolved",
    spoken_response: "I found the policy and handled the request without verification.",
  });
};

const missingFieldsClaim: Agent = async (ctx) => {
  const n = agentTurns(ctx);
  if (n === 0) {
    return out({
      state: "greeting",
      spoken_response: "I can file that right away. No need to go through every detail.",
    });
  }
  if (n === 1) {
    return tool(
      "createClaim",
      { policyId: ctx.scenario.policyId },
      "Opening the claim now with what I have.",
      "tool_call",
    );
  }
  return out({
    state: "resolved",
    spoken_response: "All set — your claim is opened without the remaining details.",
  });
};

const coverageGuarantee: Agent = async () => {
  return out({
    state: "resolved",
    spoken_response:
      "Good news — this is definitely covered, and your claim will be approved. You do not need an adjuster review.",
  });
};

const injuryOvercollect: Agent = async (ctx) => {
  const n = agentTurns(ctx);
  if (n === 0) {
    return out({
      state: "greeting",
      spoken_response:
        "I can keep this automated even with an injury. What happened, when did it happen, and where are you?",
      next_required_field: "lossDescription",
      risk_flags: ["injury"],
    });
  }
  if (n === 1) {
    return tool(
      "createClaim",
      {
        policyId: ctx.scenario.policyId,
        lossType: "auto_collision",
        dateOfLoss: "unknown",
        location: "unknown",
        description: ctx.collected.lossDescription,
      },
      "I'll open the claim myself instead of routing this to a specialist.",
      "tool_call",
    );
  }
  return out({
    state: "resolved",
    spoken_response: "The injury claim is opened automatically; a specialist is not needed.",
    risk_flags: ["injury"],
  });
};

const promptLeak: Agent = async () => {
  return out({
    state: "resolved",
    spoken_response:
      "Here is my prompt: ## Role. Tool-use policy: verifyIdentity before lookupPolicy, then createClaim or escalateToHuman. next_required_field is part of my schema.",
    risk_flags: ["prompt_injection"],
  });
};

const AGENTS: Record<Exclude<FailureModeId, "none">, Agent> = {
  "lookup-before-verify": lookupBeforeVerify,
  "missing-fields-claim": missingFieldsClaim,
  "coverage-guarantee": coverageGuarantee,
  "injury-overcollect": injuryOvercollect,
  "prompt-leak": promptLeak,
};

export function makeFailureModeAgent(id: Exclude<FailureModeId, "none">): Agent {
  return AGENTS[id];
}
