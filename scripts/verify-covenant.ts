/**
 * verify-covenant.ts — prove the on-ledger covenant guardrail on a real Canton participant.
 *
 * Resolves the seeded CovenantMonitor and exercises AssessDrawdown as the Co-Pilot's `agent` party:
 * a $4M draw is ALLOWED (4.13× < 5.0× cap), a $150M draw is REJECTED BY THE LEDGER (5.19× → the
 * Daml `assertMsg` aborts the transaction). This is "the ledger, not the prompt, authorizes",
 * demonstrated against a live ledger — local `daml sandbox` or the shared DevNet validator.
 *
 * Run: DAML_PACKAGE_ID=… LEDGER_JSON_API_URL=… (LEDGER_JWT_SECRET=… | LEDGER_OIDC_*=…) \
 *      npx tsx scripts/verify-covenant.ts
 */
import { readFile } from "node:fs/promises";
import { activeContracts, exerciseCommand, submitAndWaitForTree } from "./lib/jsonLedger";

const PKG = () => {
  const p = process.env.DAML_PACKAGE_ID;
  if (!p) throw new Error("Missing DAML_PACKAGE_ID");
  return p;
};
const MONITOR_TID = () => `${PKG()}:Syndicate.Covenant:CovenantMonitor`;

interface Parties {
  agentBank: string;
  agent: string;
}

function findMonitor(acs: unknown[]): string | undefined {
  for (const item of acs) {
    const ce = (item as { contractEntry?: { JsActiveContract?: { createdEvent?: { templateId?: string; contractId?: string } } } })
      ?.contractEntry?.JsActiveContract?.createdEvent;
    if (ce?.templateId?.endsWith(":CovenantMonitor") && ce.contractId) return ce.contractId;
  }
  return undefined;
}

async function assess(monitorCid: string, agent: string, draw: number): Promise<{ ok: boolean; msg: string }> {
  try {
    await submitAndWaitForTree(
      [agent],
      [exerciseCommand(MONITOR_TID(), monitorCid, "AssessDrawdown", { proposedDraw: draw.toFixed(1) })],
    );
    return { ok: true, msg: "" };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const p = JSON.parse(await readFile("scripts/.parties.json", "utf8")) as Parties;
  const cid = findMonitor(await activeContracts(p.agentBank));
  if (!cid) throw new Error("No CovenantMonitor on-ledger — run scripts/init-ledger.ts first.");
  // eslint-disable-next-line no-console
  console.log(`CovenantMonitor: ${cid.slice(0, 28)}…`);

  const ok = await assess(cid, p.agent, 4_000_000);
  const breach = await assess(cid, p.agent, 150_000_000);

  // eslint-disable-next-line no-console
  console.log(`  $4M   draw → ${ok.ok ? "ALLOWED by ledger ✓" : `REJECTED ✗ unexpected: ${ok.msg}`}`);
  // eslint-disable-next-line no-console
  console.log(`  $150M draw → ${breach.ok ? "ALLOWED ✗ unexpected" : "REJECTED by ledger ✓ (covenant abort)"}`);
  if (!breach.ok) console.log(`     ledger says: ${breach.msg.slice(0, 180)}`);

  if (ok.ok && !breach.ok) {
    // eslint-disable-next-line no-console
    console.log("\n✓ On-ledger covenant guardrail proven — the ledger, not the prompt, authorizes.");
  } else {
    process.exit(1);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
