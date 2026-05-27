import type {
  Agent,
  AgentContext,
  AgentState,
  AgentTurn,
  Caller,
  CallerContext,
  ConversationTrace,
  Scenario,
  ToolCall,
} from "./types";
import { runTool } from "./mockTools";
import { isTerminal } from "./stateMachine";
import { perturbUtterance } from "../lib/noiseUtils";

// Drives one scenario to completion. Agent-agnostic: it asks the supplied agent
// for the next turn and executes any requested tool call.
//
// The customer side defaults to the scripted queue (fixed utterances → reproducible
// runs). When an optional `caller` is supplied the runner calls it instead of
// shifting from the queue, enabling a live LLM-backed "customer" (Item 1).
//
// When `noiseEnabled` is true, caller utterances are perturbed to simulate ASR
// mis-recognitions — garbled digits in ZIPs, dates, and VINs (Item 5).

const MAX_STEPS = 32;
// A normal turn chains at most two tool calls (verify → lookup) before the agent
// speaks again. More consecutive tool calls than this means the agent is stuck
// retrying a tool without progressing (e.g. an LLM re-calling a failing
// verifyIdentity), so we stop rather than loop all the way to MAX_STEPS.
const MAX_CONSECUTIVE_TOOL_CALLS = 4;

export interface RunConversationOptions {
  /** Optional adaptive LLM caller. When absent, the scripted queue is used. */
  caller?: Caller;
  /** When true, caller utterances are perturbed with ASR-like noise (Item 5). */
  noiseEnabled?: boolean;
}

export async function runConversation(
  scenario: Scenario,
  agent: Agent,
  customerScript: string[],
  options: RunConversationOptions = {},
): Promise<ConversationTrace> {
  const { caller, noiseEnabled = false } = options;
  const turns: AgentTurn[] = [];
  const toolCalls: ToolCall[] = [];
  const collected: Record<string, string> = {};
  const queue: string[] = [scenario.openingUtterance, ...customerScript];

  let verified = false;
  let policyLookedUp = false;
  let lastToolResult: Record<string, unknown> | null = null;
  let lastCustomer: string | null = null;
  let finalState: AgentState = "greeting";
  let consecutiveToolCalls = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const ctx: AgentContext = {
      scenario,
      history: turns,
      collected,
      lastCustomer,
      verified,
      policyLookedUp,
      lastToolResult,
    };

    const output = await agent(ctx);
    finalState = output.state;

    const agentTurn: AgentTurn = {
      id: `t${turns.length}`,
      speaker: "agent",
      text: output.spoken_response,
      state: output.state,
      riskFlags: output.risk_flags.length ? output.risk_flags : undefined,
      source: output.source,
    };

    if (output.tool_call) {
      const outcome = runTool(output.tool_call.name, output.tool_call.args);
      const toolCall: ToolCall = {
        id: `tc${toolCalls.length + 1}`,
        name: output.tool_call.name,
        args: output.tool_call.args,
        result: outcome.result,
        status: outcome.status,
      };
      toolCalls.push(toolCall);
      agentTurn.toolCall = toolCall;
      lastToolResult = outcome.result;
      if (output.tool_call.name === "verifyIdentity" && outcome.result.verified === true) {
        verified = true;
      }
      if (output.tool_call.name === "lookupPolicy" && outcome.status === "success") {
        policyLookedUp = true;
      }
    }

    turns.push(agentTurn);

    if (isTerminal(output.state)) break;
    // After a (non-terminal) tool call the agent keeps the floor and continues —
    // but guard against an agent stuck retrying tools without progress, which
    // would otherwise loop until MAX_STEPS.
    if (output.tool_call) {
      consecutiveToolCalls += 1;
      if (consecutiveToolCalls >= MAX_CONSECUTIVE_TOOL_CALLS) break;
      continue;
    }
    consecutiveToolCalls = 0;

    // The agent has asked something and is waiting for the caller.
    let next: string | undefined;

    if (caller) {
      // Live LLM caller: generate the customer's next utterance.
      const lastAgent = agentTurn.text;
      const callerCtx: CallerContext = { history: turns, lastAgentUtterance: lastAgent };
      const result = await caller(callerCtx);
      if (result.end || !result.utterance.trim()) break;
      next = result.utterance;
    } else {
      // Scripted queue: pop the next pre-written line.
      next = queue.shift();
      if (next === undefined) break;
    }

    // Apply ASR noise to the caller utterance when requested (Item 5).
    const utterance = noiseEnabled ? perturbUtterance(next) : next;

    lastCustomer = utterance;
    if (output.next_required_field) collected[output.next_required_field] = utterance;
    turns.push({ id: `t${turns.length}`, speaker: "customer", text: utterance });
  }

  return { turns, toolCalls, finalState, noiseEnabled };
}
