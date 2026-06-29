import { NextResponse } from "next/server";
import {
  applyDrawdown,
  applyInterest,
  applyRepayment,
  applySecondary,
  getStore,
  SettlementError,
} from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/settle/{drawdown|interest|repayment|secondary}
// Each maps 1:1 to a Daml settlement choice and moves BOTH legs together. An invariant breach
// throws before any mutation — the cash leg can never move without the position leg.
export async function POST(
  req: Request,
  { params }: { params: { kind: string } },
) {
  const s = getStore();
  const args = (await req.json().catch(() => ({}))) as Record<string, number>;
  try {
    let record;
    switch (params.kind) {
      case "drawdown":
        record = applyDrawdown(s, args.amount ?? 4_000_000);
        break;
      case "interest":
        record = applyInterest(s);
        break;
      case "repayment":
        record = applyRepayment(s, args.amount ?? 1_200_000);
        break;
      case "secondary":
        record = applySecondary(s, args.notional ?? 8_000_000, args.price ?? 99.25);
        break;
      default:
        return NextResponse.json({ error: "Unknown settlement kind." }, { status: 404 });
    }
    return NextResponse.json({ position: s.position, record });
  } catch (e) {
    if (e instanceof SettlementError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Settlement failed." }, { status: 500 });
  }
}
