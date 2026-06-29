// Server-only seeded "ledger" for the demo. Holds the shared facility, the viewer's own
// LenderPosition, covenant ratios, settlement history, and the PRIVATE borrower financials.
// Mutations apply both legs of a settlement together or throw — never a half-state. State is
// in-memory (ephemeral across Vercel cold starts), which is fine for a live session demo.
// (Imported only by server route handlers — never by client components.)
import type {
  BorrowerFinancials,
  Covenant,
  Facility,
  LenderPosition,
  LifecycleStage,
  SettlementKind,
  SettlementRecord,
} from "./ledger-model";

const M = 1_000_000;

export interface LedgerStore {
  facility: Facility;
  position: LenderPosition; // the viewer's slice (Meridian Capital)
  covenants: Covenant[];
  lifecycle: LifecycleStage[];
  history: SettlementRecord[];
  financials: BorrowerFinancials; // PRIVATE — agent-only
  seq: number;
}

function seed(): LedgerStore {
  return {
    facility: {
      facilityId: "MER-2031-B",
      borrower: "Meridian Logistics",
      agentBank: "Agent Bank",
      name: "Meridian Logistics",
      tranche: "Tranche B",
      currency: "USD",
      totalCommitment: 480 * M,
      lenderCount: 6,
      couponLabel: "SOFR + 575bps",
      seniority: "Senior secured",
      maturityDate: "2031-06-30",
      nextInterestDate: "2026-07-15",
    },
    position: {
      lender: "Meridian Capital",
      holdPct: 10.0,
      commitment: 48 * M,
      drawn: 31.2 * M,
      accruedInterest: 0.402 * M,
    },
    covenants: [
      { key: "dscr", label: "DSCR", value: 1.38, threshold: 1.15, kind: "floor", ok: true },
      { key: "leverage", label: "Net leverage", value: 4.1, threshold: 5.0, kind: "cap", ok: true },
      { key: "icr", label: "Interest cover", value: 2.6, threshold: 2.0, kind: "floor", ok: true },
    ],
    lifecycle: [
      { key: "origination", label: "Origination", sub: "Mar 2024 · syndicated", done: true },
      { key: "drawdown", label: "Drawdown", sub: "$4.0M · settled", done: true },
      { key: "interest", label: "Interest", sub: "Q2 accrual · ready", done: false },
      { key: "secondary", label: "Secondary", sub: "book open", done: false },
      { key: "repayment", label: "Repayment", sub: "amortizing", done: false },
      { key: "maturity", label: "Maturity", sub: "2031-06-30", done: false },
    ],
    history: [
      mkRecord(0, "interest", "Q1 accrual distribution", 0.39 * M, -0.39 * M, "settled", "2026-04-15"),
      mkRecord(1, "interest", "Q4 accrual distribution", 0.37 * M, -0.37 * M, "settled", "2026-01-15"),
      mkRecord(2, "drawdown", "Capex tranche draw", -1.85 * M, 1.85 * M, "settled", "2026-02-08"),
      mkRecord(3, "drawdown", "Initial funding", -28.95 * M, 28.95 * M, "settled", "2024-03-20"),
    ],
    financials: {
      sector: "Freight & logistics",
      revenue: 612 * M,
      ebitda: 138 * M,
      totalDebt: 566 * M,
      dscr: 1.38,
      netLeverage: 4.1,
      interestCover: 2.6,
      freightVolumeTrendPct: -4.0, // softening into next quarter
      notes:
        "Diversified freight operator. Q2 freight volumes softening ~4% QoQ on weaker spot rates; management guides to stabilization in H2. Amortization pre-funded.",
    },
    seq: 100,
  };
}

const TX = ["A1F", "3C0", "9E1", "7B2", "5A9", "C4D", "0xE", "2Bd", "F08", "61C"];
function mkRecord(
  n: number,
  kind: SettlementKind,
  label: string,
  cashLeg: number,
  positionLeg: number,
  status: SettlementRecord["status"],
  date: string,
): SettlementRecord {
  return {
    id: `s${n}`,
    kind,
    label,
    cashLeg,
    positionLeg,
    date,
    txRef: `0x${TX[n % TX.length]}…${(n * 37 + 11).toString(16).slice(-2).toUpperCase()}`,
    status,
  };
}

// Single in-memory instance, preserved across hot requests within a warm lambda.
const g = globalThis as unknown as { __syndicateStore?: LedgerStore };
export function getStore(): LedgerStore {
  if (!g.__syndicateStore) g.__syndicateStore = seed();
  return g.__syndicateStore;
}

export function resetStore(): void {
  g.__syndicateStore = seed();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function append(
  s: LedgerStore,
  kind: SettlementKind,
  label: string,
  cashLeg: number,
  positionLeg: number,
  status: SettlementRecord["status"] = "settled",
): SettlementRecord {
  const rec = mkRecord(s.seq++, kind, label, cashLeg, positionLeg, status, today());
  s.history = [rec, ...s.history];
  return rec;
}

// ---- Atomic settlement mutations (both legs together, or throw) ----

export class SettlementError extends Error {}

/** Drawdown: a facility-level draw funds the viewer pro-rata. Cash − and drawn + together. */
export function applyDrawdown(s: LedgerStore, facilityAmount: number): SettlementRecord {
  if (!(facilityAmount > 0)) throw new SettlementError("Draw amount must be positive.");
  const share = round(facilityAmount * (s.position.holdPct / 100));
  if (s.position.drawn + share > s.position.commitment + 1)
    throw new SettlementError("Funding would exceed your committed amount — rejected, no legs moved.");
  // both legs in one step
  s.position.drawn = round(s.position.drawn + share);
  return append(s, "drawdown", `Drawdown · $${fmtM(facilityAmount)} facility`, -share, share);
}

/** Interest: distribute the accrued receivable. Cash + and accrual retired to 0 together. */
export function applyInterest(s: LedgerStore): SettlementRecord {
  const amt = s.position.accruedInterest;
  if (!(amt > 0)) throw new SettlementError("No accrued interest to distribute.");
  s.position.accruedInterest = 0;
  const rec = append(s, "interest", "Q2 accrual distribution", amt, 0);
  // mark the interest lifecycle node done
  const node = s.lifecycle.find((n) => n.key === "interest");
  if (node) {
    node.done = true;
    node.sub = "Q2 distributed";
  }
  return rec;
}

/** Repayment: principal returns to the viewer. Cash + and drawn − together. */
export function applyRepayment(s: LedgerStore, amount: number): SettlementRecord {
  if (!(amount > 0)) throw new SettlementError("Repayment must be positive.");
  if (amount > s.position.drawn + 1)
    throw new SettlementError("Repayment exceeds your drawn balance — rejected, no legs moved.");
  s.position.drawn = round(s.position.drawn - amount);
  return append(s, "repayment", "Scheduled amortization", amount, -amount);
}

/** Secondary DvP: sell a slice. Slice leaves (drawn −) and cash arrives (+ proceeds) together. */
export function applySecondary(s: LedgerStore, notional: number, price: number): SettlementRecord {
  if (!(notional > 0)) throw new SettlementError("Notional must be positive.");
  if (notional > s.position.drawn + 1)
    throw new SettlementError("Cannot sell more than your drawn slice — rejected, no legs moved.");
  if (!(price > 0 && price <= 105)) throw new SettlementError("Price out of range.");
  const proceeds = round(notional * (price / 100));
  s.position.drawn = round(s.position.drawn - notional);
  return append(
    s,
    "secondary",
    `Secondary sell · $${fmtM(notional)} @ ${price.toFixed(2)} · counterparty sealed`,
    proceeds,
    -notional,
  );
}

function round(n: number): number {
  return Math.round(n);
}
function fmtM(n: number): string {
  return (n / M).toFixed(n % M === 0 ? 1 : 2) + "M";
}
