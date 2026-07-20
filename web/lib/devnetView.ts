// Server-only: build the role-scoped FacilityView from REAL Canton ledger contracts (the sim's
// viewAs, but the partition is enforced by the ledger itself — a lender's active-contracts query
// returns only its own LenderPosition + Cash, so there is nothing to filter out). Public deal chrome
// (name, tranche, seniority, disclosed covenant ratios) comes from constants matching the seed; the
// private, partition-critical data comes from the ledger. Decimals arrive as 10-dp strings.
import type { BorrowerFinancials, Covenant, Facility, FacilityView, LenderPosition, LifecycleStage, Role, SealedLender } from "./ledger-model";
import { activeContracts, withLedgerTimeout } from "./ledgerClient";
import { partyOf } from "./ledgerMode";

const num = (v: unknown): number => (typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0);

interface Created {
  templateId: string;
  contractId: string;
  arg: Record<string, unknown>;
}

function createdEvents(acs: unknown[]): Created[] {
  const out: Created[] = [];
  for (const item of acs) {
    const ce = (item as { contractEntry?: { JsActiveContract?: { createdEvent?: { templateId?: string; contractId?: string; createArgument?: Record<string, unknown> } } } })
      ?.contractEntry?.JsActiveContract?.createdEvent;
    if (ce?.templateId && ce.contractId && ce.createArgument) out.push({ templateId: ce.templateId, contractId: ce.contractId, arg: ce.createArgument });
  }
  return out;
}
const byTemplate = (evs: Created[], suffix: string) => evs.filter((e) => e.templateId.endsWith(suffix));

// Public deal terms (not lender-private — these live on the borrower/agent-bank Facility contract or
// in the loan agreement). Matches scripts/init-ledger.ts.
const TOTAL_COMMITMENT = 480_000_000;
const PUBLIC = {
  facilityId: "MER-2031-B",
  borrower: "Meridian Logistics",
  agentBank: "Agent Bank",
  name: "Meridian Logistics",
  tranche: "Tranche B",
  currency: "USD",
  totalCommitment: TOTAL_COMMITMENT,
  seniority: "Senior secured",
  maturityDate: "2031-06-30",
  nextInterestDate: "2026-07-15",
};

// Disclosed covenant ratios (shared with lenders in compliance certificates); leverage is refined
// from the CovenantMonitor snapshot when the viewer (agent bank) can see it.
const COVENANTS: Covenant[] = [
  { key: "dscr", label: "DSCR", value: 1.38, threshold: 1.15, kind: "floor", ok: true },
  { key: "leverage", label: "Net leverage", value: 4.1, threshold: 5.0, kind: "cap", ok: true },
  { key: "icr", label: "Interest cover", value: 2.6, threshold: 2.0, kind: "floor", ok: true },
];

const LIFECYCLE: LifecycleStage[] = [
  { key: "origination", label: "Origination", sub: "on-ledger · seeded", done: true },
  { key: "drawdown", label: "Drawdown", sub: "ready", done: false },
  { key: "interest", label: "Interest", sub: "Q2 accrual", done: false },
  { key: "secondary", label: "Secondary", sub: "book open", done: false },
  { key: "repayment", label: "Repayment", sub: "amortizing", done: false },
  { key: "maturity", label: "Maturity", sub: "2031-06-30", done: false },
];

// party id → display name (by hint prefix; the seed uses synMerLenderA/B/C).
function lenderName(party: string): string {
  if (party.startsWith("synMerLenderA")) return "Meridian Capital";
  if (party.startsWith("synMerLenderB")) return "Brightwater Credit";
  if (party.startsWith("synMerLenderC")) return "Halton Park Capital";
  return party.split("::")[0];
}

function facilityChrome(bps: number, lenderCount: number): Facility {
  return { ...PUBLIC, couponLabel: `SOFR + ${bps}bps`, lenderCount };
}

function positionOf(arg: Record<string, unknown>, label: string): LenderPosition {
  const commitment = num(arg.commitment);
  return {
    lender: label,
    holdPct: TOTAL_COMMITMENT > 0 ? Math.round((commitment / TOTAL_COMMITMENT) * 1000) / 10 : 0,
    commitment,
    drawn: num(arg.drawn),
    accruedInterest: num(arg.accruedInterest),
  };
}

function financialsFrom(arg: Record<string, unknown>): BorrowerFinancials {
  const ebitda = num(arg.ebitda);
  const totalDebt = num(arg.totalDebt);
  return {
    sector: "Freight & logistics",
    revenue: 612_000_000,
    ebitda,
    totalDebt,
    dscr: 1.38,
    netLeverage: ebitda > 0 ? Math.round((totalDebt / ebitda) * 100) / 100 : 0,
    interestCover: 2.6,
    freightVolumeTrendPct: -4.0,
    notes: "On-ledger CovenantMonitor snapshot. Q2 freight volumes softening ~4% QoQ; H2 stabilization guided.",
  };
}

/** Build a role's view from the REAL ledger. The partition is enforced by the query party. */
export async function devnetView(role: Role): Promise<FacilityView> {
  const party = partyOf(role);
  if (!party) throw new Error(`no configured party for role ${role}`);
  const evs = createdEvents(await withLedgerTimeout((s) => activeContracts(party, s)));
  const positions = byTemplate(evs, ":LenderPosition");
  const monitor = byTemplate(evs, ":CovenantMonitor")[0];
  const cashEvts = byTemplate(evs, ":Cash");

  // A properly-seeded party always sees at least its own Facility/LenderPosition. An empty result
  // means real mode is misconfigured or the ledger is unreachable — THROW so the caller falls back
  // to the sim, rather than rendering a hollow all-zero "facility" that masks the failure.
  if (positions.length === 0 && byTemplate(evs, ":Facility").length === 0) {
    throw new Error("empty active-contract set — real ledger unseeded/unreachable; fall back to sim");
  }
  const bps = num(positions[0]?.arg.interestRateBps ?? 850);

  const covenants = COVENANTS.map((c) =>
    c.key === "leverage" && monitor
      ? { ...c, value: num(monitor.arg.ebitda) > 0 ? Math.round((num(monitor.arg.totalDebt) / num(monitor.arg.ebitda)) * 100) / 100 : c.value }
      : { ...c },
  );

  if (role === "agentBank") {
    const tape = positions.map((e) => positionOf(e.arg, lenderName(String(e.arg.lender))));
    const facility = facilityChrome(bps, tape.length);
    const agg: LenderPosition = {
      lender: "Facility · all lenders",
      holdPct: 100,
      commitment: tape.reduce((a, p) => a + p.commitment, 0),
      drawn: tape.reduce((a, p) => a + p.drawn, 0),
      accruedInterest: tape.reduce((a, p) => a + p.accruedInterest, 0),
    };
    return { role, viewerLabel: "Agent Bank", canSettle: true, facility, position: agg, covenants, sealedLenders: [], lifecycle: LIFECYCLE, history: [], loanTape: tape, financials: monitor ? financialsFrom(monitor.arg) : undefined };
  }

  if (role === "borrower") {
    const facilityC = byTemplate(evs, ":Facility")[0];
    const totalCommitment = facilityC ? num(facilityC.arg.totalCommitment) : TOTAL_COMMITMENT;
    const drawn = cashEvts.reduce((a, c) => a + num(c.arg.amount), 0); // borrower's drawdown proceeds
    const facility = facilityChrome(num(facilityC?.arg.interestRateBps ?? 850), 3);
    const agg: LenderPosition = { lender: "Facility", holdPct: 100, commitment: totalCommitment, drawn, accruedInterest: 0 };
    return {
      role,
      viewerLabel: "Borrower · Meridian Logistics",
      canSettle: false,
      facility,
      position: agg,
      covenants,
      sealedLenders: Array.from({ length: 3 }, (_, i) => ({ index: i, sealed: true }) as SealedLender),
      lifecycle: LIFECYCLE,
      history: [],
      financials: monitor ? financialsFrom(monitor.arg) : financialsFrom({ ebitda: "138000000", totalDebt: "566000000" }),
    };
  }

  // lender role — the ledger returns ONLY its own position + cash
  const own = positions[0];
  const facility = facilityChrome(bps, 3);
  const pos: LenderPosition = own ? positionOf(own.arg, lenderName(party)) : { lender: lenderName(party), holdPct: 0, commitment: 0, drawn: 0, accruedInterest: 0 };
  return {
    role,
    viewerLabel: lenderName(party),
    canSettle: true,
    facility,
    position: pos,
    covenants,
    sealedLenders: Array.from({ length: 2 }, (_, i) => ({ index: i + 1, sealed: true }) as SealedLender),
    lifecycle: LIFECYCLE,
    history: [],
  };
}
