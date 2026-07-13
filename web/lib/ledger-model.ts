// Types mirroring the Daml templates (Facility, LenderPosition, Cash, Settlement, Covenant).
// The sim-ledger API serves these now; the same shapes come from the JSON Ledger API on DevNet,
// so the UI never changes. All money is in whole USD; the UI formats to $X.XM.

export interface Facility {
  facilityId: string;
  borrower: string;
  agentBank: string;
  name: string; // "Meridian Logistics"
  tranche: string; // "Tranche B"
  currency: string; // "USD"
  totalCommitment: number; // 480_000_000
  lenderCount: number; // 6
  couponLabel: string; // "SOFR + 575bps"
  seniority: string; // "Senior secured"
  maturityDate: string; // "2031-06-30"
  nextInterestDate: string; // "2026-07-15"
}

// One LenderPosition — a single lender's slice (visible only to that lender + the agent bank).
export interface LenderPosition {
  lender: string; // "Meridian Capital"
  holdPct: number; // 40.0
  commitment: number; // 192_000_000
  drawn: number; // 124_800_000
  accruedInterest: number; // receivable not yet distributed
}

// Other syndicate members are sealed by Daml — no amounts ever cross to the viewer.
export interface SealedLender {
  index: number;
  sealed: true;
}

// Covenant *ratios* are disclosed to lenders; the underlying borrower financials are not.
export interface Covenant {
  key: string;
  label: string;
  value: number;
  threshold: number;
  kind: "floor" | "cap";
  ok: boolean;
}

export type SettlementKind = "drawdown" | "interest" | "repayment" | "secondary";

// A settlement always carries BOTH legs — there is no half-state.
export interface SettlementRecord {
  id: string;
  kind: SettlementKind;
  label: string;
  cashLeg: number; // signed: +in / -out, to the viewer
  positionLeg: number; // signed change to drawn (or slice transferred)
  date: string;
  txRef: string;
  status: "settled" | "due" | "scheduled";
}

export interface LifecycleStage {
  key: string;
  label: string;
  sub: string;
  done: boolean;
}

// Private borrower data — readable need-to-know by the agent bank / co-pilot only. NEVER returned
// to a lender view. The co-pilot reasons over this.
export interface BorrowerFinancials {
  sector: string;
  revenue: number;
  ebitda: number;
  totalDebt: number;
  dscr: number;
  netLeverage: number;
  interestCover: number;
  freightVolumeTrendPct: number; // negative = softening
  notes: string;
}

// ---- Roles: the same facility, seen five different ways (the on-ledger partition) ----

export type Role = "borrower" | "agentBank" | "lenderA" | "lenderB" | "lenderC";

export const ROLES: { key: Role; label: string; kind: "agent" | "lender" | "borrower" }[] = [
  { key: "agentBank", label: "Agent Bank", kind: "agent" },
  { key: "lenderA", label: "Lender A", kind: "lender" },
  { key: "lenderB", label: "Lender B", kind: "lender" },
  { key: "lenderC", label: "Lender C", kind: "lender" },
  { key: "borrower", label: "Borrower", kind: "borrower" },
];

const ROLE_KEYS: Role[] = ["borrower", "agentBank", "lenderA", "lenderB", "lenderC"];

export function parseRole(v: string | null | undefined): Role {
  return v && (ROLE_KEYS as string[]).includes(v) ? (v as Role) : "lenderA";
}

// The privacy-filtered view the API returns for a role. What a role may see is encoded here:
//   - `loanTape`   — every lender's slice. ONLY the agent bank gets this.
//   - `financials` — the borrower's private numbers. ONLY the agent bank and the borrower get this.
//   - `position`   — a lender's own slice; for agent bank/borrower it is a facility aggregate.
//   - `sealedLenders` — opaque placeholders for members the viewer cannot see.
// A lender-role payload therefore carries NO other-lender amounts and NO borrower financials.
export interface FacilityView {
  role: Role;
  viewerLabel: string;
  canSettle: boolean; // lenders + agent bank authorize; the borrower only requests
  facility: Facility;
  position: LenderPosition;
  covenants: Covenant[];
  sealedLenders: SealedLender[];
  lifecycle: LifecycleStage[];
  history: SettlementRecord[];
  loanTape?: LenderPosition[]; // agent bank only
  financials?: BorrowerFinancials; // agent bank + borrower only
}
