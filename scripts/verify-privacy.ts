/**
 * verify-privacy.ts — prove the privacy partition on a REAL Canton participant (not Daml Script).
 *
 * Reads active contracts as the agent bank (sees everything) and as Lender A (sees only its own
 * slice), and asserts Lender A cannot see any other lender's position or cash. This is the Daml
 * signatory/observer partition, demonstrated over the JSON Ledger API v2.
 *
 * Run (after allocate-parties + init-ledger):
 *   LEDGER_JSON_API_URL=… LEDGER_JWT_SECRET=… npx tsx scripts/verify-privacy.ts
 */
import { readFile } from "node:fs/promises";
import { activeContracts } from "./lib/jsonLedger";

interface Created {
  templateId: string;
  createArgument: Record<string, unknown>;
}
function creates(acs: unknown): Created[] {
  // Scope to the CURRENT package — older package versions of these templates may still be live on
  // the shared validator and would otherwise double-count the partition check.
  const pkg = process.env.DAML_PACKAGE_ID;
  const arr = Array.isArray(acs) ? acs : [];
  const out: Created[] = [];
  for (const item of arr) {
    const ce = (item as any)?.contractEntry?.JsActiveContract?.createdEvent;
    if (ce?.templateId && (!pkg || ce.templateId.startsWith(`${pkg}:`))) {
      out.push({ templateId: ce.templateId, createArgument: ce.createArgument ?? {} });
    }
  }
  return out;
}
const entity = (tid: string) => tid.split(":").slice(-1)[0];
function countByEntity(cs: Created[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const x of cs) c[entity(x.templateId)] = (c[entity(x.templateId)] ?? 0) + 1;
  return c;
}

async function main() {
  const p = JSON.parse(await readFile("scripts/.parties.json", "utf8")) as Record<string, string>;

  const agentCs = creates(await activeContracts(p.agentBank));
  const aCs = creates(await activeContracts(p.lenderA));

  // eslint-disable-next-line no-console
  console.log("Agent bank sees:", countByEntity(agentCs));
  // eslint-disable-next-line no-console
  console.log("Lender A sees:  ", countByEntity(aCs));

  const aPositions = aCs.filter((c) => entity(c.templateId) === "LenderPosition");
  const aCash = aCs.filter((c) => entity(c.templateId) === "Cash");

  const fail = (m: string) => {
    // eslint-disable-next-line no-console
    console.error("PRIVACY VIOLATION: " + m);
    process.exit(1);
  };

  // Lender A must see exactly one position — its own — and no other lender's.
  if (aPositions.length !== 1) fail(`Lender A sees ${aPositions.length} positions, expected 1`);
  if (aPositions[0].createArgument.lender !== p.lenderA) fail("Lender A's visible position is not its own");
  for (const c of aCash) if (c.createArgument.owner !== p.lenderA) fail("Lender A sees cash it does not own");
  // Lenders are not observers of the Facility.
  if (aCs.some((c) => entity(c.templateId) === "Facility")) fail("Lender A can see the Facility");

  // eslint-disable-next-line no-console
  console.log(
    "\n✓ Privacy partition holds on the real ledger: Lender A sees only its own position + cash;\n" +
      "  it has zero trace of Lender B or Lender C, and cannot see the shared Facility.",
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
