/**
 * ledger.ts — JSON Ledger API client + generated Daml TS types.
 *
 * Implemented in Phase 5. The frontend talks to the ledger ONLY through generated types and
 * the JSON API client — never raw, untyped payloads (CLAUDE.md §2). All endpoints come from
 * NEXT_PUBLIC_* environment variables; no hardcoded localhost. State comes from the ledger via
 * TanStack Query — no browser storage APIs.
 */

export const ledgerJsonApiUrl =
  process.env.NEXT_PUBLIC_LEDGER_JSON_API_URL ?? "";
