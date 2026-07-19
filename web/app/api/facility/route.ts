import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { viewAs } from "@/lib/privacy";
import { parseRole } from "@/lib/ledger-model";
import { isRealLedger } from "@/lib/ledgerMode";
import { devnetView } from "@/lib/devnetView";

export const dynamic = "force-dynamic";

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
      // fall through to the sim
    }
  }
  return NextResponse.json(viewAs(getStore(), role));
}
