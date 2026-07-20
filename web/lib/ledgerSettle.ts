// Server-only: exercise REAL Daml settlement choices on a Canton participant. The covenant gate
// (CovenantMonitor.AssessDrawdown, controller = co-pilot party) runs first and ABORTS on breach —
// the ledger, not the prompt, authorizes. A compliant drawdown then creates a DrawdownRequest and
// exercises SettleDrawdown (controller = agentBank), funding every lender pro-rata in one commit.
import { activeContracts, createCommand, exerciseCommand, LedgerError, submitForTree, templateId, withLedgerTimeout } from "./ledgerClient";
import { agentParty, facilityId, partyOf } from "./ledgerMode";

const dec = (n: number) => n.toFixed(1); // Numeric encoded as strings

interface Created {
  templateId: string;
  contractId: string;
  arg: Record<string, unknown>;
}

function parse(acs: unknown[]): Created[] {
  const out: Created[] = [];
  for (const item of acs) {
    const ce = (item as { contractEntry?: { JsActiveContract?: { createdEvent?: { templateId?: string; contractId?: string; createArgument?: Record<string, unknown> } } } })
      ?.contractEntry?.JsActiveContract?.createdEvent;
    if (ce?.templateId && ce.contractId && ce.createArgument) out.push({ templateId: ce.templateId, contractId: ce.contractId, arg: ce.createArgument });
  }
  return out;
}

async function contractsOf(party: string, suffix: string): Promise<Created[]> {
  const acs = await withLedgerTimeout((s) => activeContracts(party, s));
  // Filter to the CURRENT package id: earlier package versions of the same templates may still have
  // live contracts on the shared validator, and we must interpret only our own package's contracts.
  const pkg = process.env.DAML_PACKAGE_ID;
  return parse(acs).filter((e) => e.templateId.endsWith(suffix) && (!pkg || e.templateId.startsWith(`${pkg}:`)));
}

export interface AssessResult {
  ok: boolean;
  /** True ONLY for a genuine on-ledger covenant abort (the Daml assertMsg). False for any infra
   * failure (config missing, unseeded monitor, timeout, auth) — so callers can tell a real ledger
   * rejection from a blip and never present a network hiccup as "the ledger rejected this draw". */
  breach: boolean;
  projected?: number;
  error?: string;
}

// A genuine CovenantMonitor.AssessDrawdown abort surfaces (via damlErrorMessage) with the covenant
// assertMsg; an infra failure (timeout "security-sensitive", OIDC/401/5xx, abort) does not.
const isCovenantAbort = (e: unknown) =>
  e instanceof LedgerError && /covenant|leverage|breach|cap|assert/i.test(e.message);

/** Exercise CovenantMonitor.AssessDrawdown as the co-pilot party. Distinguishes a genuine covenant
 * abort (ok=false, breach=true) from any infrastructure failure (ok=false, breach=false). */
export async function assessDrawdown(amount: number): Promise<AssessResult> {
  const agent = agentParty();
  const ab = partyOf("agentBank");
  if (!agent || !ab) return { ok: false, breach: false, error: "co-pilot party not configured" };
  const mon = (await contractsOf(ab, ":CovenantMonitor"))[0];
  if (!mon) return { ok: false, breach: false, error: "no CovenantMonitor on-ledger" };
  try {
    await withLedgerTimeout((s) =>
      submitForTree([agent], [exerciseCommand(mon.templateId, mon.contractId, "AssessDrawdown", { proposedDraw: dec(amount) })], { signal: s }),
    );
    return { ok: true, breach: false };
  } catch (e) {
    return { ok: false, breach: isCovenantAbort(e), error: e instanceof Error ? e.message : String(e) };
  }
}

/** Real drawdown: covenant gate (AssessDrawdown) → DrawdownRequest → SettleDrawdown, all on-ledger.
 * Returns the ledger update id. Throws LedgerError (mapped to the UI's 400 "nothing moved") on a
 * covenant breach or any ledger rejection. */
export async function settleDrawdown(amount: number): Promise<{ updateId?: string }> {
  const borrower = partyOf("borrower");
  const ab = partyOf("agentBank");
  // Pre-commit failures throw a PLAIN Error (not LedgerError): the settle route treats only
  // LedgerError as a "rejected — nothing moved" 400 and lets everything else fall back to the sim.
  // Nothing has moved on-ledger at these points, so the sim fallback is safe (never break the demo).
  if (!borrower || !ab) throw new Error("settlement parties not configured");

  // 1. On-ledger covenant gate. A GENUINE covenant abort → LedgerError (→ 400, the ledger's own
  // rejection). An infra failure (timeout, unseeded monitor, auth) → plain Error → sim fallback,
  // never a phantom "the ledger rejected this draw".
  const assess = await assessDrawdown(amount);
  if (!assess.ok) {
    if (assess.breach) throw new LedgerError(assess.error ?? "covenant breach");
    throw new Error(assess.error ?? "covenant assessment unavailable");
  }

  // 2. Ensure a DrawdownRequest for this facility + amount exists. Reuse an existing one (e.g. an
  // orphan left by a prior interrupted settle) rather than creating a duplicate that would accumulate.
  const fid = facilityId();
  const already = (await contractsOf(ab, ":DrawdownRequest")).find((r) => r.arg.facilityId === fid && r.arg.amount === dec(amount));
  if (!already) {
    await withLedgerTimeout((s) =>
      submitForTree(
        [borrower],
        [createCommand(templateId("Syndicate.Settlement:DrawdownRequest"), { facilityId: fid, borrower, agentBank: ab, amount: dec(amount) })],
        { signal: s },
      ),
    );
  }

  // 3. Agent bank settles: enforce the covenant (in-transaction), fund every lender pro-rata
  // (position + that lender's cash), and hand the borrower cash — one atomic commit.
  const [req, fac, positions, cash, monitors] = await Promise.all([
    contractsOf(ab, ":DrawdownRequest"),
    contractsOf(ab, ":Facility"),
    contractsOf(ab, ":LenderPosition"),
    contractsOf(ab, ":Cash"),
    contractsOf(ab, ":CovenantMonitor"),
  ]);
  // Correlate to THE request for this facility + amount, not an arbitrary [0]: a stale/orphaned
  // request with a different amount would otherwise settle the wrong figure.
  const drawReq = req.find((r) => r.arg.facilityId === fid && r.arg.amount === dec(amount)) ?? req[0];
  const monitor = monitors.find((m) => m.arg.facilityId === fid) ?? monitors[0];
  if (!drawReq || !fac[0] || !monitor) throw new Error("could not resolve drawdown contracts on-ledger");
  // Daml tuples (ContractId LenderPosition, ContractId Cash) encode as {_1, _2} objects.
  const fundings = positions
    .map((p) => {
      const c = cash.find((x) => x.arg.owner === p.arg.lender);
      return c ? { _1: p.contractId, _2: c.contractId } : null;
    })
    .filter((f): f is { _1: string; _2: string } => f !== null);
  if (!fundings.length) throw new Error("no fundable lender positions on-ledger");

  // The settlement itself moves money AND enforces the covenant in the same transaction (monitorCid;
  // an Optional field encodes as the value for Some). If it fails here (a real covenant breach, or
  // contention/timeout/auth) the ledger state is uncertain, so we must NOT fall back to the sim and
  // re-apply the draw — surface a LedgerError (→ 400 "nothing moved").
  let res;
  try {
    res = await withLedgerTimeout((s) =>
      submitForTree(
        [ab],
        [exerciseCommand(drawReq.templateId, drawReq.contractId, "SettleDrawdown", { facilityCid: fac[0].contractId, fundings, monitorCid: monitor.contractId })],
        { signal: s },
      ),
    );
  } catch (e) {
    if (e instanceof LedgerError) throw e; // a real ledger rejection (covenant breach etc.) — surface as-is
    throw new LedgerError("drawdown settlement did not confirm on-ledger — nothing moved");
  }
  return { updateId: res.updateId };
}
