import { NextResponse } from "next/server";
import {
  applyDrawdown,
  applyFacilityDrawdown,
  applyFacilityInterest,
  applyFacilityRepayment,
  applyInterest,
  applyRepayment,
  applySecondary,
  FACILITY_AMORT,
  getStore,
  NORMAL_DRAW,
  SettlementError,
  slotForRole,
} from "@/lib/store";
import { viewAs } from "@/lib/privacy";
import { parseRole } from "@/lib/ledger-model";
import { isRealLedger } from "@/lib/ledgerMode";
import { devnetView } from "@/lib/devnetView";
import { settleDrawdown } from "@/lib/ledgerSettle";
import { LedgerError } from "@/lib/ledgerClient";
import { guard } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";
// Real-ledger settlement chains several Canton round-trips (~2-3s each). Lift the function budget
// above Vercel's 10s Hobby default so a real settle can complete instead of 504-ing before its own
// graceful sim fallback runs. Harmless in sim mode (returns in ms).
export const maxDuration = 60;

// POST /api/settle/{drawdown|interest|repayment|secondary}  body: { role, amount?, notional?, price? }
// Each maps 1:1 to a Daml settlement choice and moves BOTH legs together. An invariant breach — a
// covenant breach, insufficient capacity — throws before any mutation, so the cash leg can never
// move without the position leg. Who may authorize is role-scoped: lenders act on their own slice,
// the agent bank authorizes facility-wide, the borrower may only request (not settle).
export async function POST(req: Request, { params }: { params: { kind: string } }) {
  // Settlement can drive REAL on-ledger writes — refuse cross-origin callers and rate-limit per IP.
  const g = guard(req, "settle", 20);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const s = getStore();
  const body = (await req.json().catch(() => ({}))) as {
    role?: string;
    amount?: number;
    notional?: number;
    price?: number;
  };
  const role = parseRole(body.role);

  if (role === "borrower") {
    return NextResponse.json(
      { error: "The borrower requests settlement; the agent bank authorizes it." },
      { status: 403 },
    );
  }
  const isAgent = role === "agentBank";
  const slot = slotForRole(s, role);
  if (!isAgent && !slot) {
    return NextResponse.json({ error: "No position for this role." }, { status: 400 });
  }

  // Real-ledger mode: a drawdown is EXERCISED ON CANTON — the covenant gate
  // (CovenantMonitor.AssessDrawdown) aborts a breach on-ledger, else DrawdownRequest + SettleDrawdown
  // fund every lender pro-rata in one commit. A ledger rejection → 400 (nothing moved). Other kinds
  // fall through to the sim. Any non-covenant ledger failure also falls back to the sim (never break).
  if (isRealLedger() && params.kind === "drawdown") {
    const amount = body.amount ?? NORMAL_DRAW;
    try {
      const { updateId } = await settleDrawdown(amount);
      const view = await devnetView(role).catch(() => viewAs(s, role));
      return NextResponse.json({
        view,
        record: {
          id: `dl-${Date.now()}`,
          kind: "drawdown" as const,
          label: "Facility drawdown · on-ledger",
          cashLeg: -amount,
          positionLeg: amount,
          date: new Date().toISOString().slice(0, 10),
          txRef: `ledger:${updateId ?? "committed"}`,
          status: "settled" as const,
        },
      });
    } catch (e) {
      if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: 400 });
      // non-covenant failure (e.g. unreachable) → fall through to the sim below
    }
  }

  // Real-ledger mode, non-drawdown legs: this build settles DRAWDOWNS on Canton. Interest / repayment
  // / secondary are shown against the REAL facility as clearly-labeled PROJECTIONS — we return the
  // live ledger view (unchanged) so the screen never diverges into the sim's separate state, and mark
  // the record `projection` so the UI is honest about what did (and didn't) hit the ledger.
  if (isRealLedger() && params.kind !== "drawdown") {
    if (params.kind === "secondary" && isAgent) {
      return NextResponse.json({ error: "Secondary trades are executed by lenders, not the agent bank." }, { status: 400 });
    }
    const view = await devnetView(role).catch(() => viewAs(s, role));
    const p = view.position;
    const base = { id: `pj-${Date.now()}`, date: new Date().toISOString().slice(0, 10), txRef: "projection", status: "settled" as const };
    let record;
    if (params.kind === "interest") {
      record = { ...base, kind: "interest" as const, label: "Interest distribution · projection", cashLeg: p.accruedInterest, positionLeg: 0 };
    } else if (params.kind === "repayment") {
      const amt = body.amount ?? FACILITY_AMORT;
      const share = isAgent ? amt : Math.round(amt * (p.holdPct / 100));
      record = { ...base, kind: "repayment" as const, label: "Amortization · projection", cashLeg: share, positionLeg: -share };
    } else if (params.kind === "secondary") {
      const notional = body.notional ?? 8_000_000;
      const proceeds = Math.round((notional * (body.price ?? 99.25)) / 100);
      record = { ...base, kind: "secondary" as const, label: "Secondary DvP · projection", cashLeg: proceeds, positionLeg: -notional };
    } else {
      return NextResponse.json({ error: "Unknown settlement kind." }, { status: 404 });
    }
    return NextResponse.json({ view, record });
  }

  try {
    let record;
    switch (params.kind) {
      case "drawdown":
        record = isAgent
          ? applyFacilityDrawdown(s, body.amount ?? NORMAL_DRAW)
          : applyDrawdown(s, slot!, body.amount ?? NORMAL_DRAW);
        break;
      case "interest":
        record = isAgent ? applyFacilityInterest(s) : applyInterest(s, slot!);
        break;
      case "repayment":
        record = isAgent
          ? applyFacilityRepayment(s, body.amount ?? FACILITY_AMORT)
          : applyRepayment(s, slot!, body.amount ?? FACILITY_AMORT);
        break;
      case "secondary":
        if (isAgent) {
          return NextResponse.json(
            { error: "Secondary trades are executed by lenders, not the agent bank." },
            { status: 400 },
          );
        }
        record = applySecondary(s, slot!, body.notional ?? 8_000_000, body.price ?? 99.25);
        break;
      default:
        return NextResponse.json({ error: "Unknown settlement kind." }, { status: 404 });
    }
    return NextResponse.json({ view: viewAs(s, role), record });
  } catch (e) {
    if (e instanceof SettlementError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Settlement failed." }, { status: 500 });
  }
}
