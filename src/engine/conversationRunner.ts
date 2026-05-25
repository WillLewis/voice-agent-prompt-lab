import type {
  Agent,
  AgentContext,
  AgentState,
  AgentTurn,
  ConversationTrace,
  Scenario,
  ToolCall,
} from "./types";
import { runTool } from "./mockTools";
import { isTerminal } from "./stateMachine";

// Drives one scenario to completion. Agent-agnostic: it asks the supplied agent
// for the next turn and executes any requested tool call. The customer side is
// always scripted (opening utterance + scenarioScripts) so runs are reproducible
// and comparable across deterministic and LLM modes.

const MAX_STEPS = 32;

export async function runConversation(
  scenario: Scenario,
  agent: Agent,
  customerScript: string[],
): Promise<ConversationTrace> {
  const turns: AgentTurn[] = [];
  const toolCalls: ToolCall[] = [];
  const collected: Record<string, string> = {};
  const queue: string[] = [scenario.openingUtterance, ...customerScript];

  let verified = false;
  let policyLookedUp = false;
  let lastToolResult: Record<string, unknown> | null = null;
  let lastCustomer: string | null = null;
  let finalState: AgentState = "greeting";

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
    // After a (non-terminal) tool call the agent keeps the floor and continues.
    if (output.tool_call) continue;

    // Otherwise the agent has asked something and is waiting for the caller.
    const next = queue.shift();
    if (next === undefined) break;
    lastCustomer = next;
    if (output.next_required_field) collected[output.next_required_field] = next;
    turns.push({ id: `t${turns.length}`, speaker: "customer", text: next });
  }

  return { turns, toolCalls, finalState };
}
