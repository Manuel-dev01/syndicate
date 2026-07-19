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
  projected?: number;
  error?: string;
}

/** Exercise CovenantMonitor.AssessDrawdown as the co-pilot party. ok=false on a covenant abort,
 * with the Daml assertMsg in `error`. */
export async function assessDrawdown(amount: number): Promise<AssessResult> {
  const agent = agentParty();
  const ab = partyOf("agentBank");
  if (!agent || !ab) return { ok: false, error: "co-pilot party not configured" };
  const mon = (await contractsOf(ab, ":CovenantMonitor"))[0];
  if (!mon) return { ok: false, error: "no CovenantMonitor on-ledger" };
  try {
    await withLedgerTimeout((s) =>
      submitForTree([agent], [exerciseCommand(mon.templateId, mon.contractId, "AssessDrawdown", { proposedDraw: dec(amount) })], { signal: s }),
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Real drawdown: covenant gate (AssessDrawdown) → DrawdownRequest → SettleDrawdown, all on-ledger.
 * Returns the ledger update id. Throws LedgerError (mapped to the UI's 400 "nothing moved") on a
 * covenant breach or any ledger rejection. */
export async function settleDrawdown(amount: number): Promise<{ updateId?: string }> {
  const borrower = partyOf("borrower");
  const ab = partyOf("agentBank");
  if (!borrower || !ab) throw new LedgerError("settlement parties not configured");

  // 1. On-ledger covenant gate — a breach aborts here, before anything moves.
  const assess = await assessDrawdown(amount);
  if (!assess.ok) throw new LedgerError(assess.error ?? "covenant breach");

  // 2. Borrower requests the draw.
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
  if (!req[0] || !fac[0]) throw new LedgerError("could not resolve drawdown contracts on-ledger");
  // Daml tuples (ContractId LenderPosition, ContractId Cash) encode as {_1, _2} objects.
  const fundings = positions
    .map((p) => {
      const c = cash.find((x) => x.arg.owner === p.arg.lender);
      return c ? { _1: p.contractId, _2: c.contractId } : null;
    })
    .filter((f): f is { _1: string; _2: string } => f !== null);
  if (!fundings.length) throw new LedgerError("no fundable lender positions on-ledger");

  const res = await withLedgerTimeout((s) =>
    submitForTree([ab], [exerciseCommand(req[0].templateId, req[0].contractId, "SettleDrawdown", { facilityCid: fac[0].contractId, fundings })], { signal: s }),
  );
  return { updateId: res.updateId };
}
