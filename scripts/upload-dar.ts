/**
 * upload-dar.ts — upload the LF-2 DAR to the Canton participant over the JSON Ledger API v2.
 * Run:  DAR_PATH=daml/.daml/dist/syndicatev3-0.3.0.dar npx tsx scripts/upload-dar.ts
 */
import { uploadDar } from "./lib/jsonLedger";

async function main() {
  const dar = process.env.DAR_PATH ?? "daml/.daml/dist/syndicatev3-0.3.0.dar";
  await uploadDar(dar);
  // eslint-disable-next-line no-console
  console.log(`Uploaded ${dar} to ${process.env.LEDGER_JSON_API_URL}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
