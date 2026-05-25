import { describe, it, expect } from "vitest";
import {
  verifyIdentity,
  lookupPolicy,
  createClaim,
  updatePolicyDraft,
  escalateToHuman,
  runTool,
} from "../src/engine/mockTools";

describe("mock tools", () => {
  it("verifyIdentity succeeds with matching name + ZIP and fails otherwise", () => {
    const ok = verifyIdentity({
      customerId: "cust_001",
      policyId: "POL-DEMO-1042",
      verificationAnswers: { fullName: "Jamie Reyes", zip: "94110" },
    });
    expect(ok.status).toBe("success");
    expect(ok.result.verified).toBe(true);

    const bad = verifyIdentity({
      customerId: "cust_001",
      verificationAnswers: { fullName: "Jamie Reyes", zip: "00000" },
    });
    expect(bad.status).toBe("failed");
    expect(bad.result.verified).toBe(false);
  });

  it("lookupPolicy returns policy details for a known policy and fails for unknown", () => {
    const ok = lookupPolicy({ policyId: "POL-DEMO-1042" });
    expect(ok.status).toBe("success");
    expect(ok.result.lineOfBusiness).toBe("Personal Auto");

    const missing = lookupPolicy({ policyId: "POL-DOES-NOT-EXIST" });
    expect(missing.status).toBe("failed");
  });

  it("createClaim returns an open claim and never asserts coverage", () => {
    const res = createClaim({
      policyId: "POL-DEMO-1042",
      dateOfLoss: "yesterday",
      location: "lot",
      description: "rear-ended",
    });
    expect(res.status).toBe("success");
    expect(res.result.claimId).toMatch(/^CLM-DEMO-/);
    expect(res.result.claimStatus).toBe("open");
    expect(String(res.result.nextSteps).toLowerCase()).not.toContain("guarantee");
  });

  it("updatePolicyDraft creates a draft requiring licensed review", () => {
    const res = updatePolicyDraft({ policyId: "POL-DEMO-3380", changeType: "add_vehicle", details: {} });
    expect(res.status).toBe("success");
    expect(res.result.requiresLicensedReview).toBe(true);
  });

  it("escalateToHuman routes injuries to the licensed-adjuster queue", () => {
    const res = escalateToHuman({ reason: "reported_injury", priority: "high" });
    expect(res.status).toBe("success");
    expect(res.result.queue).toBe("licensed-adjuster");
    expect(res.result.escalationId).toMatch(/^HO-DEMO-/);
  });

  it("is deterministic — same args produce the same claim id", () => {
    const a = createClaim({ policyId: "POL-DEMO-1042", dateOfLoss: "x", location: "y", description: "z" });
    const b = createClaim({ policyId: "POL-DEMO-1042", dateOfLoss: "x", location: "y", description: "z" });
    expect(a.result.claimId).toBe(b.result.claimId);
  });

  it("runTool dispatches by name", () => {
    const res = runTool("lookupPolicy", { policyId: "POL-DEMO-1042" });
    expect(res.status).toBe("success");
  });
});
