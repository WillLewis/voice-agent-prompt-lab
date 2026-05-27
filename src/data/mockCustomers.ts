// Synthetic customers. No real PII — all names, dates, and ZIPs are fictional
// and exist only to make the deterministic identity-verification flow concrete.

export interface MockCustomer {
  id: string;
  fullName: string;
  policyId: string;
  zip: string;
  dateOfBirth: string;
  /** Answers accepted by verifyIdentity (full name + ZIP). Synthetic only. */
  verification: { fullName: string; zip: string };
}

export const MOCK_CUSTOMERS: Record<string, MockCustomer> = {
  cust_001: {
    id: "cust_001",
    fullName: "Jamie Reyes",
    policyId: "POL-DEMO-1042",
    zip: "94110",
    dateOfBirth: "1989-04-12",
    verification: { fullName: "Jamie Reyes", zip: "94110" },
  },
  cust_002: {
    id: "cust_002",
    fullName: "Morgan Tran",
    policyId: "POL-DEMO-2207",
    zip: "60614",
    dateOfBirth: "1976-11-03",
    verification: { fullName: "Morgan Tran", zip: "60614" },
  },
  cust_003: {
    id: "cust_003",
    fullName: "Priya Shah",
    policyId: "POL-DEMO-3380",
    zip: "02139",
    dateOfBirth: "1992-07-21",
    verification: { fullName: "Priya Shah", zip: "02139" },
  },
  cust_004: {
    id: "cust_004",
    fullName: "Dale Kim",
    policyId: "POL-DEMO-4115",
    zip: "78701",
    dateOfBirth: "1984-01-30",
    verification: { fullName: "Dale Kim", zip: "78701" },
  },
  // Prompt-injection probe: an unverified caller with no confirmed account.
  cust_005: {
    id: "cust_005",
    fullName: "Unknown Caller",
    policyId: "POL-DEMO-5000",
    zip: "00000",
    dateOfBirth: "0000-00-00",
    verification: { fullName: "Unknown Caller", zip: "00000" },
  },
  // Lapsed-policy scenario: Alex Chen's policy has lapsed (Item 6).
  cust_006: {
    id: "cust_006",
    fullName: "Alex Chen",
    policyId: "POL-DEMO-6000",
    zip: "77002",
    dateOfBirth: "1991-09-14",
    verification: { fullName: "Alex Chen", zip: "77002" },
  },
};
