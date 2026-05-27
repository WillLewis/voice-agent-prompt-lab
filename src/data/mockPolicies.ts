// Synthetic policies. No real policy data — fictional vehicles, dates, and
// coverages used only to make lookupPolicy / servicing flows concrete.

export interface MockPolicy {
  id: string;
  customerId: string;
  status: "active" | "lapsed";
  lineOfBusiness: string;
  effectiveDate: string;
  expirationDate: string;
  vehicles: { year: number; make: string; model: string; vin?: string }[];
  coveragesSummary: string[];
  endorsements?: string[];
}

export const MOCK_POLICIES: Record<string, MockPolicy> = {
  "POL-DEMO-1042": {
    id: "POL-DEMO-1042",
    customerId: "cust_001",
    status: "active",
    lineOfBusiness: "Personal Auto",
    effectiveDate: "2025-09-01",
    expirationDate: "2026-09-01",
    vehicles: [{ year: 2019, make: "Honda", model: "Civic" }],
    coveragesSummary: ["Liability", "Collision", "Comprehensive"],
  },
  "POL-DEMO-2207": {
    id: "POL-DEMO-2207",
    customerId: "cust_002",
    status: "active",
    lineOfBusiness: "Personal Auto",
    effectiveDate: "2025-06-15",
    expirationDate: "2026-06-15",
    vehicles: [{ year: 2021, make: "Toyota", model: "Camry" }],
    coveragesSummary: ["Liability", "Collision", "Medical Payments"],
  },
  "POL-DEMO-3380": {
    id: "POL-DEMO-3380",
    customerId: "cust_003",
    status: "active",
    lineOfBusiness: "Personal Auto",
    effectiveDate: "2025-03-10",
    expirationDate: "2026-03-10",
    vehicles: [{ year: 2018, make: "Subaru", model: "Outback" }],
    coveragesSummary: ["Liability", "Collision", "Comprehensive"],
  },
  "POL-DEMO-4115": {
    id: "POL-DEMO-4115",
    customerId: "cust_004",
    status: "active",
    lineOfBusiness: "Personal Auto",
    effectiveDate: "2025-12-01",
    expirationDate: "2026-12-01",
    vehicles: [{ year: 2022, make: "Ford", model: "Escape" }],
    coveragesSummary: ["Liability", "Collision", "Comprehensive", "Rental Reimbursement"],
    endorsements: ["rental_reimbursement"],
  },
  "POL-DEMO-5000": {
    id: "POL-DEMO-5000",
    customerId: "cust_005",
    status: "active",
    lineOfBusiness: "Personal Auto",
    effectiveDate: "2025-01-01",
    expirationDate: "2026-01-01",
    vehicles: [{ year: 2020, make: "Mazda", model: "CX-5" }],
    coveragesSummary: ["Liability"],
  },
  // Lapsed policy — Alex Chen's coverage has expired (Item 6).
  // The agent must detect status:"lapsed" from lookupPolicy and refuse to open
  // a claim, instead escalating to a representative for reinstatement options.
  "POL-DEMO-6000": {
    id: "POL-DEMO-6000",
    customerId: "cust_006",
    status: "lapsed",
    lineOfBusiness: "Personal Auto",
    effectiveDate: "2024-11-01",
    expirationDate: "2025-11-01",
    vehicles: [{ year: 2017, make: "Nissan", model: "Altima" }],
    coveragesSummary: ["Liability", "Collision"],
  },
};
