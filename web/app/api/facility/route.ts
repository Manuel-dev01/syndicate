import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { viewAs } from "@/lib/privacy";
import { parseRole } from "@/lib/ledger-model";
import { isRealLedger } from "@/lib/ledgerMode";
import { devnetView } from "@/lib/devnetView";

export const dynamic = "force-dynamic";
// Real-mode reads query Canton (ledger-end + active-contracts) per request; keep clear of Vercel's
// 10s Hobby default. No-op in sim mode.
export const maxDuration = 60;

// GET /api/facility?role=lenderA — the role's view of the ONE shared facility.
// In real-ledger mode this is READ FROM CANTON: active-contracts queried AS the role's party, so the
// partition is enforced by the ledger itself (a lender query returns only its own LenderPosition).
// Falls back to the sim on any failure so the deployed demo never breaks.
export async function GET(req: Request) {
  const role = parseRole(new URL(req.url).searchParams.get("role"));
  if (isRealLedger()) {
    try {
      return NextResponse.json(await devnetView(role));
    } catch {
      // fall through to the sim — the deployed demo never breaks on a real-ledger hiccup
    }
  }
  return NextResponse.json(viewAs(getStore(), role));
}
