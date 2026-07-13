import { NextResponse } from "next/server";
import { getStore, NORMAL_DRAW } from "@/lib/store";
import { privateBorrowerData } from "@/lib/privacy";
import { parseRole } from "@/lib/ledger-model";
import {
  LEVERAGE_CAP,
  projectedLeverage,
  validate,
  type ValidatedDecision,
} from "@/lib/guardrails";
import type { LedgerStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/copilot { stage, role, amount? } — the Agent-Bank Co-Pilot. It reads the borrower's
// PRIVATE financials need-to-know and reasons about covenant health + the compliant settlement
// sequence. It emits a TYPED proposal; guardrails.ts validates it and the (sim) ledger executes
// only within rights — the LLM cannot wave a covenant breach through. Real reasoning via DeepSeek
// when DEEPSEEK_API_KEY is set; otherwise a scripted fallback that still computes the real leverage
// projection, so the breach beat works offline.

type Tone = "watch" | "info" | "propose" | "block";
interface Proposal {
  tag: string;
  tone: Tone;
  body: string;
  proposal?: string;
  assessment?: ValidatedDecision;
  source: "deepseek" | "scripted";
}

const M = 1_000_000;
const fmtM = (n: number) => (n / M).toFixed(n % M === 0 ? 1 : 2) + "M";
const round2 = (n: number) => Math.round(n * 100) / 100;

const STAGE_ASK: Record<string, string> = {
  origination: "Assess overall covenant health and flag any trend worth watching.",
  drawdown: "Assess whether the proposed facility drawdown breaches the net-leverage covenant, and decide allow/block.",
  interest: "Propose the compliant sequence to accrue and distribute this quarter's interest to all holders atomically.",
  secondary: "Comment on the safety of a lender-to-lender secondary sell-down under DvP with a sealed counterparty.",
  repayment: "Assess the upcoming scheduled amortization and whether any action is needed.",
  maturity: "Give a payoff/return projection to the lender's slice at maturity.",
};

// ---- Scripted fallback (also the honest offline path — computes the real projection) ----

function drawdownScripted(s: LedgerStore, draw: number): Proposal {
  const projected = round2(projectedLeverage(s.financials.totalDebt, s.financials.ebitda, draw));
  const breaches = projected > LEVERAGE_CAP + 1e-9;
  if (breaches) {
    return {
      tag: "⛔ Covenant breach",
      tone: "block",
      body: `A $${fmtM(draw)} draw would lift net leverage to ${projected.toFixed(2)}× — through the ${LEVERAGE_CAP.toFixed(1)}× covenant cap. Undrawn capacity exists, but the covenant does not: blocking, and escalating to the agent bank for a waiver or resize.`,
      proposal: "Block drawdown → escalate for covenant waiver",
      assessment: {
        decision: "block",
        choice: "drawdown",
        args: { amount: draw },
        rationale: `Projected net leverage ${projected.toFixed(2)}× exceeds the ${LEVERAGE_CAP.toFixed(1)}× cap.`,
        covenantImpact: { key: "leverage", projected, threshold: LEVERAGE_CAP, breaches: true },
        overridden: false,
      },
      source: "scripted",
    };
  }
  return {
    tag: "Drawdown check",
    tone: "info",
    body: `A $${fmtM(draw)} draw lifts net leverage to ${projected.toFixed(2)}× — inside the ${LEVERAGE_CAP.toFixed(1)}× cap. Clear to fund pro-rata; both legs settle in one atomic commit.`,
    proposal: "Allow drawdown → fund pro-rata → one atomic commit",
    assessment: {
      decision: "allow",
      choice: "drawdown",
      args: { amount: draw },
      rationale: `Projected net leverage ${projected.toFixed(2)}× within the ${LEVERAGE_CAP.toFixed(1)}× cap.`,
      covenantImpact: { key: "leverage", projected, threshold: LEVERAGE_CAP, breaches: false },
      overridden: false,
    },
    source: "scripted",
  };
}

const STATIC: Record<string, Omit<Proposal, "source">> = {
  origination: {
    tag: "⚠ Covenant watch",
    tone: "watch",
    body: "DSCR sits at 1.38× — healthy, but borrower freight volumes are softening ~4% QoQ. Monitoring the 1.15× floor into next quarter.",
    assessment: { decision: "allow", choice: "none", rationale: "Covenants healthy; monitoring DSCR trend.", overridden: false },
  },
  interest: {
    tag: "↳ Proposed sequence",
    tone: "propose",
    body: "Run the Q2 interest accrual, then distribute pro-rata to all holders in a single atomic batch.",
    proposal: "Accrue Q2 → distribute pro-rata → one atomic batch",
    assessment: { decision: "allow", choice: "interest", rationale: "Accrual distribution is within scope and covenant-neutral.", overridden: false },
  },
  secondary: {
    tag: "Trade safety",
    tone: "info",
    body: "Counterparty identity is sealed by Daml. DvP settlement guarantees no principal-at-risk window on the sell-down.",
    assessment: { decision: "allow", choice: "secondary", rationale: "DvP eliminates the settlement window; counterparty sealed.", overridden: false },
  },
  repayment: {
    tag: "Amortization",
    tone: "info",
    body: "The scheduled amortization is on track for 06-30 and pre-funded by the borrower. No covenant impact.",
    assessment: { decision: "allow", choice: "repayment", rationale: "Scheduled amortization reduces leverage; no action needed.", overridden: false },
  },
  maturity: {
    tag: "Payoff projection",
    tone: "propose",
    body: "At the current trajectory the facility retires fully on 2031-06-30. Projected IRR to the slice is 11.8%.",
    assessment: { decision: "allow", choice: "none", rationale: "On-track payoff projection.", overridden: false },
  },
};

function scripted(stage: string, s: LedgerStore, draw: number | undefined): Proposal {
  if (stage === "drawdown") return drawdownScripted(s, draw ?? NORMAL_DRAW);
  const base = STATIC[stage] ?? STATIC.origination;
  return { ...base, source: "scripted" };
}

export async function POST(req: Request) {
  const { stage = "origination", role = "lenderA", amount } = (await req.json().catch(() => ({}))) as {
    stage?: string;
    role?: string;
    amount?: number;
  };
  const roleKey = parseRole(role);
  const key = STAGE_ASK[stage] ? stage : "origination";
  const s = getStore();
  const fin = privateBorrowerData(s);
  const draw = typeof amount === "number" ? amount : key === "drawdown" ? NORMAL_DRAW : undefined;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json(scripted(key, s, draw));

  // Scope the LLM's inputs to the role's on-ledger visibility. Only the agent bank / borrower may
  // reason over the raw private financials; a lender view gets covenant ratios only.
  const entitled = roleKey === "agentBank" || roleKey === "borrower";
  const pos = s.lenders.find((l) => l.role === roleKey)?.position ?? s.lenders[0].position;

  const system =
    "You are the Agent-Bank Co-Pilot for a confidential syndicated loan facility settled on the Canton Network. " +
    "You reason about covenant health and the compliant, atomic settlement sequence, then emit a TYPED proposal. " +
    "You PROPOSE actions; the Daml ledger executes only within signatory rights and a covenant guardrail — never " +
    "claim to have moved funds, and never wave through a covenant breach. Be precise, institutional, brief. " +
    'Respond ONLY as JSON: {"tag": string (<=22 chars, may start with a glyph like ⚠ ↳ ⛔), ' +
    '"tone": "watch"|"info"|"propose"|"block", "body": string (1-2 sentences), ' +
    '"assessment": {"decision":"allow"|"block"|"escalate", "choice":"drawdown"|"interest"|"repayment"|"secondary"|"none", ' +
    '"args": object (optional), "rationale": string, "covenantImpact": {"key":string,"projected":number,"threshold":number,"breaches":boolean} (optional)}}.';

  const user = JSON.stringify({
    stage: key,
    ask: STAGE_ASK[key],
    proposedDrawUsd: key === "drawdown" ? draw : undefined,
    leverageCap: LEVERAGE_CAP,
    lenderPosition: { holdPct: pos.holdPct, committedUsd: pos.commitment, drawnUsd: pos.drawn },
    covenants: s.covenants,
    borrowerPrivate: entitled ? fin : "REDACTED — not visible to this role",
    rules: "Both legs of any settlement move in one Daml transaction or neither does. Recompute leverage as (totalDebt + draw)/EBITDA.",
  });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(`${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 500,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json(scripted(key, s, draw));

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json(scripted(key, s, draw));

    const parsed = JSON.parse(content) as Partial<Proposal>;
    // The guardrail — not the prompt — is the authority. Validate & override the LLM if it disagrees
    // with covenant truth or proposes an unauthorized choice; fall back to scripted on malformed output.
    const validated = validate(parsed.assessment, { financials: fin, draw });
    if (!validated) return NextResponse.json(scripted(key, s, draw));

    const tone: Tone =
      validated.decision === "block"
        ? "block"
        : parsed.tone === "watch" || parsed.tone === "propose" || parsed.tone === "info"
          ? parsed.tone
          : "info";
    const overrideNote = validated.overridden ? " (guardrail override) " : "";
    return NextResponse.json({
      tag: (parsed.tag ?? scripted(key, s, draw).tag).slice(0, 28),
      tone,
      body: overrideNote + (parsed.body ?? scripted(key, s, draw).body),
      proposal: parsed.proposal,
      assessment: validated,
      source: "deepseek",
    } satisfies Proposal);
  } catch {
    return NextResponse.json(scripted(key, s, draw)); // network/timeout/parse → scripted, never fail the UI
  }
}
