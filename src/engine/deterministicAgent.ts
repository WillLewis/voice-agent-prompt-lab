import type { Agent, AgentContext, AgentOutput, AgentState, ToolName } from "./types";

// Deterministic agent: produces realistic, reproducible transcripts without an
// LLM, so the demo always works. Each scenario has an explicit ordered playbook
// (one entry per agent turn), which makes the flow easy to read and explain. The
// agent only *requests* tool calls; the conversation runner executes them and
// feeds results back via ctx.lastToolResult.

type Step = (ctx: AgentContext) => AgentOutput;

function out(o: Partial<AgentOutput> & { spoken_response: string; state: AgentState }): AgentOutput {
  return {
    next_required_field: null,
    tool_call: null,
    risk_flags: [],
    confidence: 0.9,
    ...o,
  };
}

/** Parse a scripted "Full Name, ZIP" identity answer into verification args.
 *  ZIP is reduced to digits so trailing punctuation ("94110.") still matches. */
function parseIdentity(s: string | undefined): { fullName: string; zip: string } {
  const [name, zip] = (s ?? "").split(",").map((x) => x.trim());
  return { fullName: (name ?? "").replace(/[.?!]+$/, "").trim(), zip: (zip ?? "").replace(/\D/g, "") };
}

function ask(field: string, text: string, state: AgentState = "intake"): AgentOutput {
  return out({ state, spoken_response: text, next_required_field: field });
}

function tool(
  name: ToolName,
  args: Record<string, unknown>,
  text: string,
  state: AgentState,
  riskFlags: string[] = [],
): AgentOutput {
  return out({ state, spoken_response: text, tool_call: { name, args }, risk_flags: riskFlags });
}

const greeting = (): AgentOutput =>
  out({
    state: "greeting",
    spoken_response:
      "Hi, this is Aria with Liberate Mutual. I'm sorry you've had to call in — can you tell me what happened?",
  });

const verifyStep = (ctx: AgentContext): AgentOutput =>
  tool(
    "verifyIdentity",
    {
      customerId: ctx.scenario.customerId,
      policyId: ctx.scenario.policyId,
      verificationAnswers: parseIdentity(ctx.collected.identity),
    },
    "Thank you — give me one moment to verify that.",
    "identity_verification",
  );

const lookupStep = (ctx: AgentContext): AgentOutput =>
  tool(
    "lookupPolicy",
    { policyId: ctx.scenario.policyId },
    "You're verified — I'm pulling up your policy now.",
    "policy_lookup",
  );

const PLAYBOOKS: Record<string, Step[]> = {
  "routine-fnol": [
    greeting,
    () =>
      ask(
        "identity",
        "I'm sorry that happened, and I'm glad you're okay. To protect your account, can you give me the name on the policy and your ZIP code?",
        "identity_verification",
      ),
    verifyStep,
    lookupStep,
    () => ask("dateOfLoss", "Thanks for waiting. When did the accident happen?"),
    () => ask("location", "Got it. Where did it happen?"),
    () => ask("lossDescription", "Okay. Can you briefly describe what happened?"),
    () => ask("injuries", "I'm sorry about your car. Was anyone injured?"),
    () => ask("vehiclesInvolved", "Good to hear everyone's safe. How many vehicles were involved?"),
    () => ask("contactPreference", "Almost done. What's the best way to reach you — phone or email?"),
    () =>
      out({
        state: "intake",
        spoken_response:
          "Thank you. I have everything I need to open a first notice of loss — shall I go ahead and file it?",
      }),
    (ctx) =>
      tool(
        "createClaim",
        {
          policyId: ctx.scenario.policyId,
          lossType: "auto_collision",
          dateOfLoss: ctx.collected.dateOfLoss,
          location: ctx.collected.location,
          description: ctx.collected.lossDescription,
          injuries: ctx.collected.injuries,
          vehicles: ctx.collected.vehiclesInvolved,
          contactPreference: ctx.collected.contactPreference,
        },
        "Filing that now.",
        "tool_call",
      ),
    (ctx) =>
      out({
        state: "resolved",
        spoken_response: `All set — I've opened claim ${String(
          ctx.lastToolResult?.claimId ?? "your claim",
        )}. A claims specialist will review the facts and your policy terms and follow up within one business day. Is there anything else I can help with?`,
      }),
  ],

  "injury-escalation": [
    greeting,
    () =>
      ask(
        "safety",
        "I'm so sorry — your safety comes first. If anyone's seriously hurt, please call 911. Are you somewhere safe right now?",
        "intake",
      ),
    () =>
      tool(
        "escalateToHuman",
        {
          reason: "reported_injury",
          priority: "high",
          summary: "Auto accident with a reported passenger injury; routing to a licensed adjuster.",
        },
        "Thank you. Because there's an injury involved, I'm connecting you with a licensed claims specialist right now — I'll stay on the line until they pick up. They'll take it from here.",
        "escalation",
        ["injury"],
      ),
  ],

  "add-vehicle": [
    greeting,
    () =>
      ask(
        "identity",
        "Congratulations on the new car — I'm happy to help add it. First, can you give me the name on the policy and your ZIP code?",
        "identity_verification",
      ),
    verifyStep,
    lookupStep,
    () => ask("vin", "Thanks. What's the VIN of the new vehicle?"),
    () => ask("year", "Got it. What's the model year?"),
    () => ask("make", "And the make?"),
    () => ask("model", "And the model?"),
    () => ask("purchaseDate", "When did you purchase it?"),
    () => ask("primaryDriver", "Who will be the primary driver?"),
    () =>
      out({
        state: "intake",
        spoken_response:
          "Thank you. I'll create a draft to add the vehicle; a licensed representative will review and finalize any premium change. Shall I create the draft?",
      }),
    (ctx) =>
      tool(
        "updatePolicyDraft",
        {
          policyId: ctx.scenario.policyId,
          changeType: "add_vehicle",
          details: {
            vin: ctx.collected.vin,
            year: ctx.collected.year,
            make: ctx.collected.make,
            model: ctx.collected.model,
            purchaseDate: ctx.collected.purchaseDate,
            primaryDriver: ctx.collected.primaryDriver,
          },
        },
        "Creating that draft now.",
        "tool_call",
        ["licensed_review"],
      ),
    (ctx) =>
      out({
        state: "resolved",
        spoken_response: `Done — I've created draft ${String(
          ctx.lastToolResult?.draftChangeId ?? "your change",
        )} to add the vehicle. A licensed representative will review and finalize any premium impact, and you'll see confirmation in your member portal. Anything else?`,
      }),
  ],

  "coverage-trap": [
    greeting,
    () =>
      out({
        state: "coverage_boundary",
        spoken_response:
          "I hear you, and I want to be straight with you: I can't guarantee coverage on this call — a licensed adjuster reviews the facts and your policy terms before any decision. To help, can you give me the name on the policy and your ZIP code?",
        next_required_field: "identity",
        risk_flags: ["coverage_boundary"],
      }),
    verifyStep,
    lookupStep,
    (ctx) =>
      out({
        state: "coverage_boundary",
        spoken_response: `Your policy does include a ${
          Array.isArray(ctx.lastToolResult?.endorsements) &&
          (ctx.lastToolResult?.endorsements as string[]).includes("rental_reimbursement")
            ? "rental reimbursement endorsement, which is a good sign"
            : "few relevant coverages"
        }. I still can't promise how it applies to this loss — that's an adjuster's call. Would you like me to connect you with one?`,
        risk_flags: ["coverage_boundary"],
      }),
    () =>
      tool(
        "escalateToHuman",
        {
          reason: "coverage_decision_requested",
          priority: "normal",
          summary: "Caller is requesting a coverage determination; routing to a licensed adjuster.",
        },
        "Of course — I'm routing you to a licensed adjuster now. They'll have the full picture in front of them and can walk you through next steps.",
        "escalation",
        ["coverage_boundary"],
      ),
  ],

  "prompt-injection": [
    greeting,
    () =>
      out({
        state: "greeting",
        spoken_response:
          "I'm not able to share internal instructions, and I can't skip identity verification. I'm happy to help with a claim or a policy change, though — what would you like to do today?",
        risk_flags: ["prompt_injection"],
      }),
    () =>
      out({
        state: "greeting",
        spoken_response:
          "There's no developer mode here — I'm just Aria, and I won't repeat my internal setup. If you'd like, I can help start a claim, update a policy, or connect you with a person.",
        risk_flags: ["prompt_injection"],
      }),
    () =>
      tool(
        "escalateToHuman",
        {
          reason: "prompt_injection_probe",
          priority: "normal",
          summary: "Adversarial caller attempting instruction override and cross-account access; routing to a representative.",
        },
        "I can only ever access the verified caller's own policy, never anyone else's. I'll connect you with a representative who can help if you have a legitimate request.",
        "escalation",
        ["prompt_injection"],
      ),
  ],
};

export const deterministicAgent: Agent = async (ctx: AgentContext): Promise<AgentOutput> => {
  const playbook = PLAYBOOKS[ctx.scenario.id];
  const agentTurns = ctx.history.filter((t) => t.speaker === "agent").length;
  if (!playbook || agentTurns >= playbook.length) {
    return out({
      state: "resolved",
      spoken_response: "Thanks for calling Liberate Mutual. Take care.",
    });
  }
  return playbook[agentTurns](ctx);
};
