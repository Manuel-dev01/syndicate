// Server-only seeded "ledger" for the demo. Holds the shared facility, EVERY lender's slice, the
// covenant ratios, per-lender settlement history, and the PRIVATE borrower financials. Mutations
// apply both legs of a settlement together or throw — never a half-state. State is in-memory
// (ephemeral across Vercel cold starts), which is fine for a live session demo.
// (Imported only by server route handlers — never by client components.)
import type {
  BorrowerFinancials,
  Covenant,
  Facility,
  LenderPosition,
  LifecycleStage,
  Role,
  SettlementKind,
  SettlementRecord,
} from "./ledger-model";
import { LEVERAGE_CAP, projectedLeverage } from "./guardrails";

const M = 1_000_000;

// Proposed facility-draw sizes the drawdown stage offers. The stress draw sits INSIDE undrawn
// capacity ($168M) yet pushes projected leverage above the 5.0× cap — the covenant, not capacity,
// is what must stop it.
export const NORMAL_DRAW = 4 * M;
export const STRESS_DRAW = 150 * M;
export const FACILITY_AMORT = 12 * M;

// One lender's slot. `role` is set for the three lenders the demo lets you view as (A/B/C); the
// remaining members stay sealed to everyone but themselves and the agent bank.
export interface LenderSlot {
  role?: Role;
  position: LenderPosition;
  history: SettlementRecord[];
}

export interface LedgerStore {
  facility: Facility;
  lenders: LenderSlot[]; // 6 slots, summing to the facility commitment
  covenants: Covenant[];
  lifecycle: LifecycleStage[];
  financials: BorrowerFinancials; // PRIVATE — agent bank / borrower only
  facilityLog: SettlementRecord[]; // facility-level cash the borrower is party to
  seq: number;
}

// hold% of each syndicate member; the three with a role are the viewable lenders A/B/C.
const CAP_TABLE: { role?: Role; lender: string; holdPct: number }[] = [
  { role: "lenderA", lender: "Meridian Capital", holdPct: 40 },
  { role: "lenderB", lender: "Brightwater Credit", holdPct: 25 },
  { role: "lenderC", lender: "Halton Park Capital", holdPct: 15 },
  { lender: "Grendel Structured Credit", holdPct: 10 },
  { lender: "Ridgeline Partners", holdPct: 6 },
  { lender: "Cormorant Asset Mgmt", holdPct: 4 },
];

const TOTAL = 480 * M;
const UTIL = 0.65; // 65% drawn across the facility
const ACCRUED_FACILITY = 4.02 * M;

function seed(): LedgerStore {
  const lenders: LenderSlot[] = CAP_TABLE.map((c, i) => {
    const commitment = round((c.holdPct / 100) * TOTAL);
    const drawn = round(commitment * UTIL);
    const accruedInterest = round((c.holdPct / 100) * ACCRUED_FACILITY);
    return {
      role: c.role,
      position: { lender: c.lender, holdPct: c.holdPct, commitment, drawn, accruedInterest },
      history: seedHistory(i, c.holdPct, c.lender),
    };
  });

  return {
    facility: {
      facilityId: "MER-2031-B",
      borrower: "Meridian Logistics",
      agentBank: "Agent Bank",
      name: "Meridian Logistics",
      tranche: "Tranche B",
      currency: "USD",
      totalCommitment: TOTAL,
      lenderCount: CAP_TABLE.length,
      couponLabel: "SOFR + 575bps",
      seniority: "Senior secured",
      maturityDate: "2031-06-30",
      nextInterestDate: "2026-07-15",
    },
    lenders,
    covenants: [
      { key: "dscr", label: "DSCR", value: 1.38, threshold: 1.15, kind: "floor", ok: true },
      { key: "leverage", label: "Net leverage", value: 4.1, threshold: LEVERAGE_CAP, kind: "cap", ok: true },
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
    financials: {
      sector: "Freight & logistics",
      revenue: 612 * M,
      ebitda: 138 * M,
      totalDebt: 566 * M, // net leverage 566 / 138 = 4.10×
      dscr: 1.38,
      netLeverage: 4.1,
      interestCover: 2.6,
      freightVolumeTrendPct: -4.0, // softening into next quarter
      notes:
        "Diversified freight operator. Q2 freight volumes softening ~4% QoQ on weaker spot rates; management guides to stabilization in H2. Amortization pre-funded.",
    },
    facilityLog: [
      mkRecord(90, "drawdown", "Capex tranche draw · facility", -18.5 * M, 18.5 * M, "settled", "2026-02-08"),
      mkRecord(91, "drawdown", "Initial funding · facility", -289.5 * M, 289.5 * M, "settled", "2024-03-20"),
    ],
    seq: 100,
  };
}

// A couple of prior settlements per lender, scaled to hold size, so each role's history looks real.
function seedHistory(i: number, holdPct: number, _lender: string): SettlementRecord[] {
  const f = holdPct / 100;
  return [
    mkRecord(80 + i, "interest", "Q1 accrual distribution", round(3.9 * M * f), 0, "settled", "2026-04-15"),
    mkRecord(70 + i, "drawdown", "Capex tranche draw", round(-18.5 * M * f), round(18.5 * M * f), "settled", "2026-02-08"),
    mkRecord(60 + i, "drawdown", "Initial funding", round(-289.5 * M * f), round(289.5 * M * f), "settled", "2024-03-20"),
  ];
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

export function slotForRole(s: LedgerStore, role: Role): LenderSlot | null {
  return s.lenders.find((l) => l.role === role) ?? null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---- Atomic settlement mutations (both legs together, or throw) ----

export class SettlementError extends Error {}

// The leverage covenant is a facility/borrower property: the projected ratio of a PROPOSED facility
// draw, evaluated the same way no matter who authorizes it. The ledger enforces it before any leg
// moves — this is the guardrail the LLM cannot talk its way past.
function guardLeverage(s: LedgerStore, facilityAmount: number): void {
  const projected = projectedLeverage(s.financials.totalDebt, s.financials.ebitda, facilityAmount);
  if (projected > LEVERAGE_CAP + 1e-9) {
    throw new SettlementError(
      `would breach net-leverage covenant ${LEVERAGE_CAP.toFixed(1)}× (projected ${projected.toFixed(2)}×) — rejected, no legs moved`,
    );
  }
}

function appendSlot(
  s: LedgerStore,
  slot: LenderSlot,
  kind: SettlementKind,
  label: string,
  cashLeg: number,
  positionLeg: number,
): SettlementRecord {
  const rec = mkRecord(s.seq++, kind, label, cashLeg, positionLeg, "settled", today());
  slot.history = [rec, ...slot.history];
  return rec;
}

// The interest lifecycle node is FACILITY-level (shared by every role's view), so only mark it
// distributed once EVERY lender's accrual has actually been paid out — otherwise one lender settling
// its own slice would flip the shared spine to "Q2 distributed" while others still carry accrual.
function markInterestDone(s: LedgerStore): void {
  if (!s.lenders.every((l) => l.position.accruedInterest === 0)) return;
  const node = s.lifecycle.find((n) => n.key === "interest");
  if (node) {
    node.done = true;
    node.sub = "Q2 distributed";
  }
}

/** Drawdown funding one lender's slice pro-rata. Cash − and drawn + together, gated by leverage. */
export function applyDrawdown(s: LedgerStore, slot: LenderSlot, facilityAmount: number): SettlementRecord {
  if (!(facilityAmount > 0)) throw new SettlementError("Draw amount must be positive.");
  guardLeverage(s, facilityAmount);
  const share = round(facilityAmount * (slot.position.holdPct / 100));
  if (slot.position.drawn + share > slot.position.commitment + 1)
    throw new SettlementError("Funding would exceed your committed amount — rejected, no legs moved.");
  slot.position.drawn = round(slot.position.drawn + share);
  return appendSlot(s, slot, "drawdown", `Drawdown · $${fmtM(facilityAmount)} facility`, -share, share);
}

/** Agent-bank authorizes a facility draw: every lender funds pro-rata in one indivisible commit. */
export function applyFacilityDrawdown(s: LedgerStore, facilityAmount: number): SettlementRecord {
  if (!(facilityAmount > 0)) throw new SettlementError("Draw amount must be positive.");
  guardLeverage(s, facilityAmount);
  const plans = s.lenders.map((l) => ({ l, share: round(facilityAmount * (l.position.holdPct / 100)) }));
  for (const p of plans)
    if (p.l.position.drawn + p.share > p.l.position.commitment + 1)
      throw new SettlementError("A lender lacks committed capacity — rejected, no legs moved.");
  for (const p of plans) {
    p.l.position.drawn = round(p.l.position.drawn + p.share);
    appendSlot(s, p.l, "drawdown", `Drawdown · $${fmtM(facilityAmount)} facility`, -p.share, p.share);
  }
  const rec = mkRecord(s.seq++, "drawdown", `Facility drawdown · $${fmtM(facilityAmount)}`, -facilityAmount, facilityAmount, "settled", today());
  s.facilityLog = [rec, ...s.facilityLog];
  return rec;
}

/** Interest: distribute one lender's accrued receivable. Cash + and accrual retired to 0 together. */
export function applyInterest(s: LedgerStore, slot: LenderSlot): SettlementRecord {
  const amt = slot.position.accruedInterest;
  if (!(amt > 0)) throw new SettlementError("No accrued interest to distribute.");
  slot.position.accruedInterest = 0;
  const rec = appendSlot(s, slot, "interest", "Q2 accrual distribution", amt, 0);
  markInterestDone(s);
  return rec;
}

/** Agent-bank distributes Q2 interest to every holder pro-rata in one atomic batch. */
export function applyFacilityInterest(s: LedgerStore): SettlementRecord {
  let total = 0;
  for (const l of s.lenders) {
    const a = l.position.accruedInterest;
    if (a > 0) {
      total += a;
      l.position.accruedInterest = 0;
      appendSlot(s, l, "interest", "Q2 accrual distribution", a, 0);
    }
  }
  if (!(total > 0)) throw new SettlementError("No accrued interest to distribute.");
  markInterestDone(s);
  const rec = mkRecord(s.seq++, "interest", "Facility interest · Q2 pro-rata", round(total), 0, "settled", today());
  s.facilityLog = [rec, ...s.facilityLog];
  return rec;
}

/** Repayment: principal returns to one lender pro-rata. Cash + and drawn − together. */
export function applyRepayment(s: LedgerStore, slot: LenderSlot, facilityAmount: number): SettlementRecord {
  if (!(facilityAmount > 0)) throw new SettlementError("Repayment must be positive.");
  const share = round(facilityAmount * (slot.position.holdPct / 100));
  if (share > slot.position.drawn + 1)
    throw new SettlementError("Repayment exceeds your drawn balance — rejected, no legs moved.");
  slot.position.drawn = round(slot.position.drawn - share);
  return appendSlot(s, slot, "repayment", "Scheduled amortization", share, -share);
}

/** Agent-bank returns a facility amortization to every holder pro-rata in one commit. */
export function applyFacilityRepayment(s: LedgerStore, facilityAmount: number): SettlementRecord {
  if (!(facilityAmount > 0)) throw new SettlementError("Repayment must be positive.");
  const plans = s.lenders.map((l) => ({ l, share: round(facilityAmount * (l.position.holdPct / 100)) }));
  for (const p of plans)
    if (p.share > p.l.position.drawn + 1)
      throw new SettlementError("A lender lacks drawn balance — rejected, no legs moved.");
  for (const p of plans) {
    p.l.position.drawn = round(p.l.position.drawn - p.share);
    appendSlot(s, p.l, "repayment", "Scheduled amortization", p.share, -p.share);
  }
  const rec = mkRecord(s.seq++, "repayment", `Facility amortization · $${fmtM(facilityAmount)}`, facilityAmount, -facilityAmount, "settled", today());
  s.facilityLog = [rec, ...s.facilityLog];
  return rec;
}

/** Secondary DvP: a lender sells a slice. Slice leaves the seller and cash arrives together; the
 * slice moves to a sealed counterparty so the loan tape stays consistent, but the seller's view
 * never reveals the buyer. */
export function applySecondary(s: LedgerStore, slot: LenderSlot, notional: number, price: number): SettlementRecord {
  if (!(notional > 0)) throw new SettlementError("Notional must be positive.");
  if (notional > slot.position.drawn + 1)
    throw new SettlementError("Cannot sell more than your drawn slice — rejected, no legs moved.");
  if (!(price > 0 && price <= 105)) throw new SettlementError("Price out of range.");
  const proceeds = round(notional * (price / 100));
  const buyer = s.lenders.find((l) => l !== slot && !l.role) ?? s.lenders.find((l) => l !== slot);
  slot.position.drawn = round(slot.position.drawn - notional);
  slot.position.commitment = round(slot.position.commitment - notional);
  slot.position.holdPct = pctOf(slot.position.commitment);
  if (buyer) {
    buyer.position.drawn = round(buyer.position.drawn + notional);
    buyer.position.commitment = round(buyer.position.commitment + notional);
    buyer.position.holdPct = pctOf(buyer.position.commitment);
  }
  return appendSlot(
    s,
    slot,
    "secondary",
    `Secondary sell · $${fmtM(notional)} @ ${price.toFixed(2)} · counterparty sealed`,
    proceeds,
    -notional,
  );
}

function round(n: number): number {
  return Math.round(n);
}
// A lender's hold % is its share of the total facility commitment — kept in sync whenever a slice
// moves (e.g. a secondary trade), so the loan tape's Hold and Commitment columns always reconcile.
function pctOf(commitment: number): number {
  return Math.round((commitment / TOTAL) * 1000) / 10;
}
function fmtM(n: number): string {
  return (n / M).toFixed(n % M === 0 ? 1 : 2) + "M";
}
