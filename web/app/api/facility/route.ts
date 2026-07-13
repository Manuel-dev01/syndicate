import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { viewAs } from "@/lib/privacy";
import { parseRole } from "@/lib/ledger-model";

export const dynamic = "force-dynamic";

// GET /api/facility?role=lenderA — the role's privacy-filtered view of the ONE shared facility.
// A lender-role response carries only that lender's slice + sealed placeholders; other lenders'
// amounts and the borrower's financials never appear in it. That is the Daml partition, in the
// response shape — switch the role and you get a demonstrably different slice.
export function GET(req: Request) {
  const role = parseRole(new URL(req.url).searchParams.get("role"));
  return NextResponse.json(viewAs(getStore(), role));
}
