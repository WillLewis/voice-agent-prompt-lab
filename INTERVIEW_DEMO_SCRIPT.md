# 3-Minute Interview Demo Script

## Opening

“I built a lightweight local prompt lab to isolate the behavior layer of an insurance voice agent. I intentionally did not build production telephony because the prompting exercise is really about state, tool use, guardrails, escalation, and evaluation.”

## Walkthrough

1. “Here are five scenarios: routine FNOL, injury escalation, add-vehicle servicing, coverage-boundary trap, and prompt injection.”
2. “When I run a scenario, the app shows the transcript, state transitions, tool calls, and evaluator results.”
3. “The agent has to verify identity before policy lookup, collect required fields before claim creation, avoid coverage guarantees, and escalate high-risk cases.”
4. “The important part is that the evaluator turns prompt quality into testable behavior. If I change the prompt and it starts implying coverage, the regression check catches it.”

## Strongest point

“The prompt is not the system. The system is prompt plus state machine, tool contracts, guardrails, escalation policy, and evals. That’s how I would think about making a voice agent reliable in insurance.”

## Production caveat

“In production this would sit behind ASR/TTS, telephony, latency monitoring, call recording policy, CRM/core-system integrations, human handoff queues, and observability. This demo focuses on the reasoning/control layer.”
