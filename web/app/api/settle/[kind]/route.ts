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

export const dynamic = "force-dynamic";

// POST /api/settle/{drawdown|interest|repayment|secondary}  body: { role, amount?, notional?, price? }
// Each maps 1:1 to a Daml settlement choice and moves BOTH legs together. An invariant breach — a
// covenant breach, insufficient capacity — throws before any mutation, so the cash leg can never
// move without the position leg. Who may authorize is role-scoped: lenders act on their own slice,
// the agent bank authorizes facility-wide, the borrower may only request (not settle).
export async function POST(req: Request, { params }: { params: { kind: string } }) {
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
