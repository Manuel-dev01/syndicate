/**
 * verify-settle.ts — prove a REAL atomic drawdown settlement on the Canton ledger, and TIME each
 * ledger round-trip (so we know whether the web app's 8s budget is safe on DevNet). Mirrors
 * web/lib/ledgerSettle.ts: covenant gate → DrawdownRequest → SettleDrawdown, funding every lender
 * pro-rata in one commit. Reads parties from scripts/.parties.json + DAML_PACKAGE_ID from env.
 *
 * Run: DAML_PACKAGE_ID=… LEDGER_JSON_API_URL=… (OIDC…) npx tsx scripts/verify-settle.ts [amount]
 */
import { readFile } from "node:fs/promises";
import { activeContracts, createCommand, exerciseCommand, submitAndWaitForTree } from "./lib/jsonLedger";

const PKG = () => process.env.DAML_PACKAGE_ID!;
const tid = (m: string) => `${PKG()}:${m}`;
const dec = (n: number) => n.toFixed(1);
const FACILITY_ID = process.env.LEDGER_FACILITY_ID ?? "MER-2031-B";

interface Created { templateId: string; contractId: string; arg: Record<string, unknown> }
function parse(acs: unknown[]): Created[] {
  const out: Created[] = [];
  for (const item of acs) {
    const ce = (item as any)?.contractEntry?.JsActiveContract?.createdEvent;
    if (ce?.templateId && ce.contractId && ce.createArgument)
      out.push({ templateId: ce.templateId, contractId: ce.contractId, arg: ce.createArgument });
  }
  return out;
}
async function of(party: string, suffix: string): Promise<Created[]> {
  const pkg = process.env.DAML_PACKAGE_ID;
  return parse(await activeContracts(party)).filter(
    (e) => e.templateId.endsWith(suffix) && (!pkg || e.templateId.startsWith(`${pkg}:`)),
  );
}
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  // eslint-disable-next-line no-console
  console.log(`  ${label.padEnd(28)} ${Date.now() - t0} ms`);
  return r;
}

async function main() {
  const amount = Number(process.argv[2] ?? 4_000_000);
  const p = JSON.parse(await readFile("scripts/.parties.json", "utf8")) as Record<string, string>;

  const drawnBefore = (await of(p.agentBank, ":LenderPosition")).reduce((s, c) => s + Number(c.arg.drawn), 0);
  // eslint-disable-next-line no-console
  console.log(`Drawdown $${(amount / 1e6).toFixed(1)}M — total drawn before: $${(drawnBefore / 1e6).toFixed(1)}M\n`);

  // 1. Covenant gate (co-pilot party) — aborts on breach.
  const mon = (await of(p.agentBank, ":CovenantMonitor"))[0];
  await timed("AssessDrawdown (gate)", () =>
    submitAndWaitForTree([p.agent], [exerciseCommand(mon.templateId, mon.contractId, "AssessDrawdown", { proposedDraw: dec(amount) })]));

  // 2. Borrower requests the draw.
  await timed("DrawdownRequest (borrower)", () =>
    submitAndWaitForTree([p.borrower], [createCommand(tid("Syndicate.Settlement:DrawdownRequest"),
      { facilityId: FACILITY_ID, borrower: p.borrower, agentBank: p.agentBank, amount: dec(amount) })]));

  // 3. Agent bank settles: fund every lender pro-rata, one commit.
  const [req, fac, positions, cash] = await Promise.all([
    of(p.agentBank, ":DrawdownRequest"), of(p.agentBank, ":Facility"),
    of(p.agentBank, ":LenderPosition"), of(p.agentBank, ":Cash"),
  ]);
  const fundings = positions
    .map((pos) => { const c = cash.find((x) => x.arg.owner === pos.arg.lender); return c ? { _1: pos.contractId, _2: c.contractId } : null; })
    .filter((f): f is { _1: string; _2: string } => f !== null);

  const settleMon = (await of(p.agentBank, ":CovenantMonitor"))[0];
  const res = await timed("SettleDrawdown (agentBank)", () =>
    submitAndWaitForTree([p.agentBank], [exerciseCommand(req[0].templateId, req[0].contractId,
      "SettleDrawdown", { facilityCid: fac[0].contractId, fundings, monitorCid: settleMon.contractId })]));

  const drawnAfter = (await of(p.agentBank, ":LenderPosition")).reduce((s, c) => s + Number(c.arg.drawn), 0);
  const upd = (res as any).updateId ?? (res as any).transactionTree?.updateId;
  // eslint-disable-next-line no-console
  console.log(`\n✓ Settled on Canton DevNet. updateId=${String(upd).slice(0, 24)}…`);
  // eslint-disable-next-line no-console
  console.log(`  total drawn: $${(drawnBefore / 1e6).toFixed(1)}M → $${(drawnAfter / 1e6).toFixed(1)}M (Δ $${((drawnAfter - drawnBefore) / 1e6).toFixed(1)}M, atomic pro-rata)`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
