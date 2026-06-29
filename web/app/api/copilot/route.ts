import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { privateBorrowerData } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// POST /api/copilot { stage } — the Agent-Bank Co-Pilot. It reads the borrower's PRIVATE
// financials need-to-know and reasons about covenant health + the compliant settlement sequence
// for the lender's current lifecycle stage. It PROPOSES; the (sim) ledger executes only within
// rights. Real reasoning via DeepSeek when DEEPSEEK_API_KEY is set; otherwise a scripted fallback.

type Tone = "watch" | "info" | "propose";
interface Proposal {
  tag: string;
  tone: Tone;
  body: string;
  proposal?: string;
  source: "deepseek" | "scripted";
}

const SCRIPTED: Record<string, Omit<Proposal, "source">> = {
  origination: {
    tag: "⚠ Covenant watch",
    tone: "watch",
    body: "DSCR sits at 1.38× — healthy, but borrower freight volumes are softening ~4% QoQ. Monitoring the 1.15× floor into next quarter.",
  },
  drawdown: {
    tag: "Drawdown check",
    tone: "info",
    body: "A $4.0M draw keeps facility utilization near 65%, comfortably within limits. No covenant impact at this level.",
  },
  interest: {
    tag: "↳ Proposed sequence",
    tone: "propose",
    body: "Run the Q2 interest accrual, then distribute pro-rata to all 6 holders in a single atomic batch. To your slice: +$0.402M.",
    proposal: "Accrue Q2 → distribute pro-rata to 6 holders → one atomic batch",
  },
  secondary: {
    tag: "Trade safety",
    tone: "info",
    body: "Counterparty identity is sealed by Daml. DvP settlement guarantees no principal-at-risk window on the sell-down.",
  },
  repayment: {
    tag: "Amortization",
    tone: "info",
    body: "The $1.20M amortization is on track for 06-30 and is pre-funded by the borrower. No action needed.",
  },
  maturity: {
    tag: "Payoff projection",
    tone: "propose",
    body: "At the current trajectory the facility retires fully on 2031-06-30. Projected IRR to your slice is 11.8%.",
  },
};

function scripted(stage: string): Proposal {
  const base = SCRIPTED[stage] ?? SCRIPTED.origination;
  return { ...base, source: "scripted" };
}

const STAGE_ASK: Record<string, string> = {
  origination: "Assess overall covenant health and flag any trend worth watching.",
  drawdown: "Assess whether a $4.0M facility drawdown (the lender funds ~10% pro-rata) breaches any covenant or utilization limit.",
  interest: "Propose the compliant sequence to accrue and distribute this quarter's interest to all holders atomically.",
  secondary: "Comment on the safety of a lender-to-lender secondary sell-down under DvP with a sealed counterparty.",
  repayment: "Assess the upcoming scheduled amortization and whether any action is needed.",
  maturity: "Give a payoff/return projection to the lender's slice at maturity.",
};

export async function POST(req: Request) {
  const { stage = "origination" } = (await req.json().catch(() => ({}))) as { stage?: string };
  const key = STAGE_ASK[stage] ? stage : "origination";

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json(scripted(key));

  const s = getStore();
  const fin = privateBorrowerData(s); // need-to-know private data
  const pos = s.position;

  const system =
    "You are the Agent-Bank Co-Pilot for a confidential syndicated loan facility settled on the Canton Network. " +
    "You read the borrower's PRIVATE financials on a need-to-know basis and reason about covenant health and the " +
    "compliant, atomic settlement sequence for the lender's current lifecycle stage. You PROPOSE actions; the Daml " +
    "ledger executes only within signatory rights — never claim to have moved funds. Be precise, institutional, and brief. " +
    'Respond ONLY as JSON: {"tag": string (<=22 chars, may start with a glyph like ⚠ or ↳), "tone": "watch"|"info"|"propose", ' +
    '"body": string (1-2 sentences), "proposal": string (optional one-line settlement sequence when an action is warranted)}.';

  const user = JSON.stringify({
    stage: key,
    ask: STAGE_ASK[key],
    lenderPosition: {
      holdPct: pos.holdPct,
      committedUsd: pos.commitment,
      drawnUsd: pos.drawn,
      accruedInterestUsd: pos.accruedInterest,
    },
    covenants: s.covenants,
    borrowerPrivate: fin,
    rules: "Both legs of any settlement move in one Daml transaction or neither does.",
  });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(
      `${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
          max_tokens: 400,
          stream: false,
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json(scripted(key));

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json(scripted(key));

    const parsed = JSON.parse(content) as Partial<Proposal>;
    const tone: Tone =
      parsed.tone === "watch" || parsed.tone === "propose" ? parsed.tone : "info";
    return NextResponse.json({
      tag: (parsed.tag ?? scripted(key).tag).slice(0, 28),
      tone,
      body: parsed.body ?? scripted(key).body,
      proposal: parsed.proposal,
      source: "deepseek",
    } satisfies Proposal);
  } catch {
    return NextResponse.json(scripted(key)); // network/timeout/parse → scripted, never fail the UI
  }
}
