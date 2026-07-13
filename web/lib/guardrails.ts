// Agent guardrails — the ledger, not the prompt, is the authority (CLAUDE.md principle #3).
//
// The Agent-Bank Co-Pilot may PROPOSE a settlement, but its proposal is validated here before it
// can drive any action. Two independent checks bound it:
//   1. Authorization — the proposed choice must lie inside the agent party's on-ledger grant
//      (mirrors `AgentAuthorization` in daml/Syndicate/Roles.daml). Anything else is force-blocked.
//   2. Covenant truth — the leverage impact of a proposed draw is recomputed deterministically from
//      the borrower's financials. If the draw breaches the cap we force `block`, even when the LLM
//      said `allow`. The model can advise; it cannot wave through a breach.
//
// Pure module: imports TYPES only, no ledger/LLM/IO — so it is trivially testable and can be shared
// with the standalone agent/ service.
import type { BorrowerFinancials } from "./ledger-model";

export const LEVERAGE_CAP = 5.0; // net-debt / EBITDA cap; mirrors the facility's leverage covenant

// Net-leverage after an incremental facility draw. A draw raises the borrower's total debt against
// unchanged EBITDA — the single ratio a naive "is there undrawn capacity?" check would miss.
export function projectedLeverage(totalDebt: number, ebitda: number, incrementalDraw: number): number {
  if (ebitda <= 0) return Infinity;
  return (totalDebt + Math.max(0, incrementalDraw)) / ebitda;
}

export type Decision = "allow" | "block" | "escalate";
export type ProposableChoice = "drawdown" | "interest" | "repayment" | "secondary" | "none";

export interface CovenantImpact {
  key: string;
  projected: number;
  threshold: number;
  breaches: boolean;
}

// The typed proposal the co-pilot must emit — never free-form prose that mutates state.
export interface Assessment {
  decision: Decision;
  choice: ProposableChoice;
  args?: Record<string, number>;
  rationale: string;
  covenantImpact?: CovenantImpact;
}

export interface ValidatedDecision extends Assessment {
  overridden: boolean; // true when the guardrail overruled the model's decision
}

const DECISIONS: Decision[] = ["allow", "block", "escalate"];
const CHOICES: ProposableChoice[] = ["drawdown", "interest", "repayment", "secondary", "none"];

// The choices the agent party is authorized to propose. Kept in lock-step with the on-ledger
// AgentAuthorization scope; a proposal for anything outside this set can never execute.
const AUTHORIZED = new Set<ProposableChoice>(["drawdown", "interest", "repayment", "secondary", "none"]);

export function isAssessmentShape(v: unknown): v is Assessment {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    DECISIONS.includes(a.decision as Decision) &&
    CHOICES.includes(a.choice as ProposableChoice) &&
    typeof a.rationale === "string"
  );
}

// Validate the LLM's assessment. Returns null on malformed output (caller falls back to scripted
// reasoning), otherwise a decision that reflects authorization + covenant truth, not just the model.
export function validate(
  raw: unknown,
  ctx: { financials?: BorrowerFinancials; draw?: number },
): ValidatedDecision | null {
  if (!isAssessmentShape(raw)) return null;
  const a = raw;

  // (1) Authorization gate — outside the grant, nothing executes.
  if (!AUTHORIZED.has(a.choice)) {
    return {
      ...a,
      decision: "block",
      overridden: true,
      rationale: `Choice "${a.choice}" is outside the agent's on-ledger authorization.`,
    };
  }

  // (2) Deterministic covenant guard on drawdowns.
  let decision = a.decision;
  let overridden = false;
  let covenantImpact = a.covenantImpact;
  if (a.choice === "drawdown" && ctx.financials && typeof ctx.draw === "number") {
    const projected = round2(projectedLeverage(ctx.financials.totalDebt, ctx.financials.ebitda, ctx.draw));
    const breaches = projected > LEVERAGE_CAP + 1e-9;
    covenantImpact = { key: "leverage", projected, threshold: LEVERAGE_CAP, breaches };
    if (breaches && decision === "allow") {
      decision = "block";
      overridden = true;
    }
  }

  return { ...a, decision, covenantImpact, overridden };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
