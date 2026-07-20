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
  return parse(acs).filter((e) => e.templateId.endsWith(suffix));
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

  // 2. Borrower requests the draw (a DrawdownRequest is just a request — no cash/position moves).
  await withLedgerTimeout((s) =>
    submitForTree(
      [borrower],
      [createCommand(templateId("Syndicate.Settlement:DrawdownRequest"), { facilityId: facilityId(), borrower, agentBank: ab, amount: dec(amount) })],
      { signal: s },
    ),
  );

  // 3. Agent bank settles: fund every lender pro-rata (position + that lender's cash), one commit.
  const [req, fac, positions, cash] = await Promise.all([
    contractsOf(ab, ":DrawdownRequest"),
    contractsOf(ab, ":Facility"),
    contractsOf(ab, ":LenderPosition"),
    contractsOf(ab, ":Cash"),
  ]);
  // Correlate to THE request we just created (this facility + this amount), not an arbitrary [0]:
  // a stale/orphaned request from a prior failed settle would otherwise settle the wrong amount.
  const fid = facilityId();
  const drawReq = req.find((r) => r.arg.facilityId === fid && r.arg.amount === dec(amount)) ?? req[0];
  if (!drawReq || !fac[0]) throw new Error("could not resolve drawdown contracts on-ledger");
  // Daml tuples (ContractId LenderPosition, ContractId Cash) encode as {_1, _2} objects.
  const fundings = positions
    .map((p) => {
      const c = cash.find((x) => x.arg.owner === p.arg.lender);
      return c ? { _1: p.contractId, _2: c.contractId } : null;
    })
    .filter((f): f is { _1: string; _2: string } => f !== null);
  if (!fundings.length) throw new Error("no fundable lender positions on-ledger");

  // The settlement itself moves money. If it fails here (contention, timeout, auth) the ledger state
  // is uncertain, so we must NOT fall back to the sim and re-apply the draw — surface a LedgerError
  // (→ 400 "nothing moved") rather than risk a double count divergent from the ledger.
  let res;
  try {
    res = await withLedgerTimeout((s) =>
      submitForTree([ab], [exerciseCommand(drawReq.templateId, drawReq.contractId, "SettleDrawdown", { facilityCid: fac[0].contractId, fundings })], { signal: s }),
    );
  } catch (e) {
    if (e instanceof LedgerError) throw e; // a real ledger rejection — surface as-is
    throw new LedgerError("drawdown settlement did not confirm on-ledger — nothing moved");
  }
  return { updateId: res.updateId };
}
