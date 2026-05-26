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

/** First non-empty string value among candidate keys — tolerates the several
 *  shapes/spellings an LLM might use for the same field. */
function pickStr(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = str(obj[k]);
    if (v && v.trim() !== "") return v;
  }
  return undefined;
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Reduce a ZIP to its first five digits so "78701", "78701-1234", "78701." all match. */
function zip5(s: string): string {
  return (s.match(/\d/g) ?? []).join("").slice(0, 5);
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
  // Tolerate either a nested verificationAnswers object or flat args, plus common
  // key spellings — the agent may structure the call differently, but a clear
  // name + ZIP match should still verify.
  const answers = (args.verificationAnswers ?? {}) as Record<string, unknown>;
  const nameKeys = ["fullName", "name", "full_name"];
  const zipKeys = ["zip", "zipCode", "zip_code", "postalCode", "postal_code"];
  const providedName = pickStr(answers, nameKeys) ?? pickStr(args, nameKeys);
  const providedZip = pickStr(answers, zipKeys) ?? pickStr(args, zipKeys);

  const expectedName = normName(customer.verification.fullName);
  const gotName = providedName ? normName(providedName) : "";
  // Exact match, or the record name embedded in a longer answer (e.g. the model
  // passing "Dale Kim, 78701" as the name).
  const nameOk = gotName !== "" && (gotName === expectedName || gotName.includes(expectedName));
  const zipOk = providedZip != null && zip5(providedZip) === zip5(customer.verification.zip);

  if (nameOk && zipOk) {
    return {
      result: { verified: true, confidence: 0.98, reason: "Name and ZIP match the policyholder record." },
      status: "success",
    };
  }
  // Actionable reason so the agent can ask for the specific missing/incorrect detail.
  const missing = [!nameOk ? "full name" : null, !zipOk ? "ZIP code" : null].filter(Boolean).join(" and ");
  return {
    result: {
      verified: false,
      confidence: 0.2,
      reason: `Could not verify identity: the ${missing} did not match our records. Ask the caller to re-confirm their ${missing}.`,
    },
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
