/**
 * Agent-Bank Co-Pilot — service entrypoint.
 *
 * Implemented in Phase 4. This is a buildable stub establishing the separate-process
 * boundary: the agent has its OWN party credentials and never shares the frontend's tokens
 * (CLAUDE.md §2). The flow it will implement:
 *
 *   1. Stream covenant + borrower-financial contracts visible to the agent's party.
 *   2. On a trigger (drawdown request / periodic check), call the Anthropic API to reason
 *      over that PRIVATE, party-scoped data.
 *   3. Receive a STRUCTURED, TYPED proposal of which Daml choice to exercise.
 *   4. guardrails.ts validates authorization + preconditions; reject malformed output.
 *   5. ledgerClient.ts exercises the authorized choice — and ONLY that.
 *
 * The LLM never mutates ledger state directly and never bypasses Daml authorization.
 */

function main(): void {
  // eslint-disable-next-line no-console
  console.log("[syndicate-agent] stub — Co-Pilot service lands in Phase 4.");
}

main();
