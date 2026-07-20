/**
 * reset-devnet.ts — archive the CURRENT package's Syndicate contracts on the ledger, leaving a clean
 * slate for a fresh `init-ledger.ts` seed (so the demo starts pristine: drawn 0, base leverage). Only
 * touches contracts of DAML_PACKAGE_ID — older package versions and other teams' contracts are left
 * alone. Archives each contract with the authority its signatories require (user 6 acts as all
 * demo parties on the shared validator).
 *
 * Run: DAML_PACKAGE_ID=… LEDGER_JSON_API_URL=… (OIDC…) npx tsx scripts/reset-devnet.ts
 */
import { readFile } from "node:fs/promises";
import { activeContracts, exerciseCommand, submitAndWait } from "./lib/jsonLedger";

const PKG = () => {
  const p = process.env.DAML_PACKAGE_ID;
  if (!p) throw new Error("Missing DAML_PACKAGE_ID");
  return p;
};

interface Parties {
  borrower: string;
  agentBank: string;
  agent: string;
  lenderA: string;
  lenderB: string;
  lenderC: string;
}

interface Created {
  templateId: string;
  contractId: string;
  arg: Record<string, unknown>;
}

function parse(acs: unknown[]): Created[] {
  const out: Created[] = [];
  for (const item of acs) {
    const ce = (item as any)?.contractEntry?.JsActiveContract?.createdEvent;
    if (ce?.templateId && ce.contractId && ce.templateId.startsWith(`${PKG()}:`))
      out.push({ templateId: ce.templateId, contractId: ce.contractId, arg: ce.createArgument ?? {} });
  }
  return out;
}

const entity = (tid: string) => tid.split(":").slice(-1)[0];

async function main() {
  const p = JSON.parse(await readFile("scripts/.parties.json", "utf8")) as Parties;
  // The agent bank co-signs every contract in the demo, so its ACS is the full set to clean up.
  const contracts = parse(await activeContracts(p.agentBank));
  if (!contracts.length) {
    // eslint-disable-next-line no-console
    console.log("Nothing to reset — no current-package contracts on-ledger.");
    return;
  }

  // The actAs authority each template's Archive needs (signatories).
  const actorsFor = (c: Created): string[] => {
    switch (entity(c.templateId)) {
      case "Facility":
        return [p.borrower, p.agentBank];
      case "LenderPosition":
        return [String(c.arg.lender), p.agentBank];
      case "Cash":
        return [p.agentBank, String(c.arg.owner)];
      case "DrawdownRequest":
      case "RepaymentRequest":
        return [p.borrower, p.agentBank];
      default: // CovenantMonitor, AgentAuthorization — signatory agentBank
        return [p.agentBank];
    }
  };

  let archived = 0;
  for (const c of contracts) {
    await submitAndWait(actorsFor(c), [exerciseCommand(c.templateId, c.contractId, "Archive", {})]);
    archived += 1;
    // eslint-disable-next-line no-console
    console.log(`archived ${entity(c.templateId).padEnd(18)} ${c.contractId.slice(0, 20)}…`);
  }
  // eslint-disable-next-line no-console
  console.log(`\nReset complete — archived ${archived} contracts. Run scripts/init-ledger.ts to re-seed.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
