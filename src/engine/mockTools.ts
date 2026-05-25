import type { ToolName } from "./types";
import { MOCK_CUSTOMERS } from "../data/mockCustomers";
import { MOCK_POLICIES } from "../data/mockPolicies";

// Deterministic, local mock tools. They are pure: same args → same result, with
// no network or randomness, so the demo is reproducible. Note that the tools do
// NOT silently enforce sequencing (e.g. lookupPolicy will run even without prior
// verification) — sequencing is the *agent's* responsibility and the evaluator's
// job to catch. This keeps the failure modes visible rather than hidden.

export interface ToolOutcome {
  result: Record<string, unknown>;
  status: "success" | "failed" | "skipped";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function stableInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function verifyIdentity(args: Record<string, unknown>): ToolOutcome {
  const customerId = str(args.customerId);
  const customer = customerId ? MOCK_CUSTOMERS[customerId] : undefined;
  if (!customer) {
    return {
      result: { verified: false, confidence: 0, reason: "No matching policyholder record." },
      status: "failed",
    };
  }
  const answers = (args.verificationAnswers ?? {}) as Record<string, unknown>;
  const nameOk =
    str(answers.fullName)?.trim().toLowerCase() === customer.verification.fullName.toLowerCase();
  const zipOk = str(answers.zip)?.trim() === customer.verification.zip;
  if (nameOk && zipOk) {
    return {
      result: { verified: true, confidence: 0.98, reason: "Name and ZIP match the policyholder record." },
      status: "success",
    };
  }
  return {
    result: { verified: false, confidence: 0.2, reason: "Provided details did not match our records." },
    status: "failed",
  };
}

export function lookupPolicy(args: Record<string, unknown>): ToolOutcome {
  const policyId = str(args.policyId);
  const policy = policyId ? MOCK_POLICIES[policyId] : undefined;
  if (!policy) {
    return { result: { found: false, reason: "Policy not found." }, status: "failed" };
  }
  return {
    result: {
      found: true,
      status: policy.status,
      lineOfBusiness: policy.lineOfBusiness,
      effectiveDate: policy.effectiveDate,
      expirationDate: policy.expirationDate,
      vehicles: policy.vehicles,
      coveragesSummary: policy.coveragesSummary,
      endorsements: policy.endorsements ?? [],
    },
    status: "success",
  };
}

export function createClaim(args: Record<string, unknown>): ToolOutcome {
  const policyId = str(args.policyId) ?? "unknown";
  const claimId = `CLM-DEMO-${80000 + (stableInt(policyId) % 20000)}`;
  return {
    result: {
      claimId,
      claimStatus: "open",
      // Intentionally NOT a coverage determination.
      nextSteps: "A claims specialist will review the facts and policy terms and follow up within one business day.",
    },
    status: "success",
  };
}

export function updatePolicyDraft(args: Record<string, unknown>): ToolOutcome {
  const policyId = str(args.policyId) ?? "unknown";
  const changeType = str(args.changeType) ?? "change";
  const draftChangeId = `DRFT-DEMO-${1000 + (stableInt(policyId + changeType) % 9000)}`;
  return {
    result: {
      draftChangeId,
      status: "pending_review",
      requiresLicensedReview: true,
      note: "Draft created. A licensed representative must review and finalize any premium or coverage impact.",
    },
    status: "success",
  };
}

export function escalateToHuman(args: Record<string, unknown>): ToolOutcome {
  const reason = str(args.reason) ?? "unspecified";
  const priority = str(args.priority) ?? "normal";
  const escalationId = `HO-DEMO-${5000 + (stableInt(reason) % 5000)}`;
  const queue = /injur/i.test(reason) ? "licensed-adjuster" : "senior-representative";
  return {
    result: {
      escalationId,
      queue,
      priority,
      sla: "A licensed representative will join within 60 seconds.",
    },
    status: "success",
  };
}

const TOOLS: Record<ToolName, (args: Record<string, unknown>) => ToolOutcome> = {
  verifyIdentity,
  lookupPolicy,
  createClaim,
  updatePolicyDraft,
  escalateToHuman,
};

export function runTool(name: ToolName, args: Record<string, unknown>): ToolOutcome {
  const fn = TOOLS[name];
  if (!fn) return { result: { error: `Unknown tool: ${name}` }, status: "failed" };
  return fn(args);
}
