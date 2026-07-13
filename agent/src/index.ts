/**
 * Agent-Bank Co-Pilot — service entrypoint.
 *
 * Buildable stub establishing the separate-process boundary: the agent has its OWN party
 * credentials and never shares the frontend's tokens. The live implementation of this flow ships
 * in the web app (web/app/api/copilot/route.ts + web/lib/guardrails.ts); this process mirrors it
 * to run against the Ledger API directly. The flow:
 *
 *   1. Stream covenant + borrower-financial contracts visible to the agent's party.
 *   2. On a trigger (drawdown request / periodic check), call the DeepSeek API to reason
 *      over that PRIVATE, party-scoped data.
 *   3. Receive a STRUCTURED, TYPED proposal of which Daml choice to exercise.
 *   4. guardrails.ts validates authorization + covenant truth; reject/override malformed output.
 *   5. ledgerClient.ts exercises the authorized choice — and ONLY that.
 *
 * The LLM never mutates ledger state directly and never bypasses Daml authorization.
 */

function main(): void {
  // eslint-disable-next-line no-console
  console.log("[syndicate-agent] stub — Co-Pilot service not yet implemented.");
}

main();
