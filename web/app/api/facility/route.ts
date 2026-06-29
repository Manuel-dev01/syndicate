import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { viewAsLender } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// GET /api/facility — the viewer's privacy-filtered "your slice" view. Other lenders' amounts
// never appear here; only sealed placeholders do (the Daml partition, in the response shape).
export function GET() {
  return NextResponse.json(viewAsLender(getStore()));
}
