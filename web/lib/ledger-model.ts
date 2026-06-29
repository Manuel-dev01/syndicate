// Types mirroring the Daml templates (Facility, LenderPosition, Cash, Settlement, Covenant).
// The sim-ledger API serves these now; in Phase 3 the same shapes come from the JSON Ledger API,
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

// The viewer's own slice — the one LenderPosition they (and the agent bank) can see.
export interface LenderPosition {
  lender: string; // "Meridian Capital"
  holdPct: number; // 10.0
  commitment: number; // 48_000_000
  drawn: number; // 31_200_000
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

export type SettlementKind =
  | "drawdown"
  | "interest"
  | "repayment"
  | "secondary";

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

// The privacy-filtered "your slice" view — what the API returns for a lender.
export interface FacilityView {
  facility: Facility;
  position: LenderPosition;
  covenants: Covenant[];
  sealedLenders: SealedLender[];
  lifecycle: LifecycleStage[];
  history: SettlementRecord[];
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
