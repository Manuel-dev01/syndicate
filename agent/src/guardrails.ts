/**
 * guardrails.ts — the authorization boundary in code.
 * Validates an LLM proposal against (a) the agent party's on-ledger
 * authorization and (b) the target choice's preconditions; rejects malformed LLM output and
 * any action the party isn't authorized to take. The ledger remains the ultimate guardrail —
 * this layer fails fast before ever touching it.
 */
export {};
