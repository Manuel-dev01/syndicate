/**
 * covenantMonitor.ts — LLM reasoning over private borrower data.
 * Streams the covenant/financial contracts visible to the agent's
 * party, calls the DeepSeek API to assess whether a proposed drawdown breaches the leverage
 * covenant, and returns a STRUCTURED TYPED proposal (validated, never free-form prose that
 * mutates state). The live implementation ships in the web app
 * (web/app/api/copilot/route.ts + web/lib/guardrails.ts); this module mirrors it for the
 * standalone agent process that runs against the Ledger API directly.
 */
export {};
