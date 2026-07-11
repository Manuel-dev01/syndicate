/**
 * allocate-parties.ts — allocate the six Syndicate parties on a Canton participant and grant the
 * app user actAs rights over each, then persist the `hint::fingerprint` ids for init-ledger.
 *
 * Works against any Canton 3.x participant's JSON Ledger API (LocalNet or DevNet) — the endpoint,
 * token secret, and app user all come from the environment. No hardcoded hosts.
 *
 * Run:  LEDGER_JSON_API_URL=… LEDGER_JWT_SECRET=… npx tsx scripts/allocate-parties.ts
 */
import { writeFile } from "node:fs/promises";
import { allocateParty, grantUserRights } from "./lib/jsonLedger";

const HINTS = {
  borrower: "syndicate-borrower-1",
  agentBank: "syndicate-agentbank-1",
  agent: "syndicate-copilot-1",
  lenderA: "syndicate-lenderA-1",
  lenderB: "syndicate-lenderB-1",
  lenderC: "syndicate-lenderC-1",
} as const;

async function main() {
  const parties: Record<string, string> = {};
  for (const [role, hint] of Object.entries(HINTS)) {
    const party = await allocateParty(hint);
    parties[role] = party;
    await grantUserRights(process.env.LEDGER_APP_USER ?? "syndicate-app", party);
    // eslint-disable-next-line no-console
    console.log(`${role.padEnd(10)} ${party}`);
  }
  await writeFile("scripts/.parties.json", JSON.stringify(parties, null, 2));
  // eslint-disable-next-line no-console
  console.log("\nWrote scripts/.parties.json — consumed by init-ledger.ts");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
