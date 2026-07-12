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
import { allocateParty, grantActAs } from "./lib/jsonLedger";

// Distinctive hints so they don't clash with other teams on the shared validator.
const HINTS = {
  borrower: "synMerBorrower",
  agentBank: "synMerAgentBank",
  agent: "synMerCoPilot",
  lenderA: "synMerLenderA",
  lenderB: "synMerLenderB",
  lenderC: "synMerLenderC",
} as const;

async function main() {
  const appUser = process.env.LEDGER_APP_USER ?? "syndicate-app";
  const parties: Record<string, string> = {};
  for (const [role, hint] of Object.entries(HINTS)) {
    const party = await allocateParty(hint);
    parties[role] = party;
    // Grant the shared ledger user actAs (and thus readAs) over this party.
    await grantActAs(appUser, party);
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
