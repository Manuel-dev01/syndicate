/**
 * init-ledger.ts — seed the demo facility on a Canton participant via the JSON Ledger API v2.
 *
 * Creates the shared Facility (borrower + agent bank), one LenderPosition per lender, and starting
 * cash — each with the correct `actAs` parties, so the privacy partition holds on the real ledger
 * exactly as in the Daml Script tests. Reads party ids from scripts/.parties.json (written by
 * allocate-parties.ts) and the uploaded package id from DAML_PACKAGE_ID.
 *
 * Run:  DAML_PACKAGE_ID=… LEDGER_JSON_API_URL=… LEDGER_JWT_SECRET=… npx tsx scripts/init-ledger.ts
 */
import { readFile } from "node:fs/promises";
import { createCommand, submitAndWait } from "./lib/jsonLedger";

const PKG = () => {
  const p = process.env.DAML_PACKAGE_ID;
  if (!p) throw new Error("Missing DAML_PACKAGE_ID (the uploaded syndicate package id)");
  return p;
};
const tid = (moduleEntity: string) => `${PKG()}:${moduleEntity}`;

const FACILITY_ID = "MER-2031-B";
const RATE_BPS = 850;
const MATURITY = "2031-06-30";
const CURRENCY = "USD";
const dec = (n: number) => n.toFixed(1); // Daml Numeric encodes as a string on the JSON API

interface Parties {
  borrower: string;
  agentBank: string;
  lenderA: string;
  lenderB: string;
  lenderC: string;
}

async function main() {
  const p = JSON.parse(await readFile("scripts/.parties.json", "utf8")) as Parties;

  // Facility — signatories borrower + agentBank.
  await submitAndWait(
    [p.borrower, p.agentBank],
    [
      createCommand(tid("Syndicate.Facility:Facility"), {
        facilityId: FACILITY_ID,
        borrower: p.borrower,
        agentBank: p.agentBank,
        totalCommitment: dec(480_000_000),
        currency: CURRENCY,
        interestRateBps: RATE_BPS,
        maturityDate: MATURITY,
      }),
    ],
  );

  // Per-lender positions (40 / 35 / 25 % of a $480M facility) — signatories lender + agentBank.
  const lenders: [string, number][] = [
    [p.lenderA, 192_000_000],
    [p.lenderB, 168_000_000],
    [p.lenderC, 120_000_000],
  ];
  for (const [lender, commitment] of lenders) {
    await submitAndWait(
      [lender, p.agentBank],
      [
        createCommand(tid("Syndicate.Lender:LenderPosition"), {
          facilityId: FACILITY_ID,
          lender,
          agentBank: p.agentBank,
          commitment: dec(commitment),
          drawn: dec(0),
          accruedInterest: dec(0),
          currency: CURRENCY,
          interestRateBps: RATE_BPS,
          maturityDate: MATURITY,
        }),
      ],
    );
    // Starting cash equal to the commitment — signatories agentBank (issuer) + lender.
    await submitAndWait(
      [p.agentBank, lender],
      [
        createCommand(tid("Syndicate.Cash:Cash"), {
          issuer: p.agentBank,
          owner: lender,
          amount: dec(commitment),
        }),
      ],
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded facility ${FACILITY_ID}: 1 Facility, 3 LenderPositions, 3 Cash holdings.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
