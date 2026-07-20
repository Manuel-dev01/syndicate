# Demo — drive & follow

A guided click-path through Syndicate. Runs entirely on your machine with **no configuration** — the
product is backed by an in-memory ledger typed to the Daml model, so every action works offline.
Takes about four minutes to walk end-to-end.

- **Live version:** https://syndicate-delta.vercel.app → **Enter the product** (`/app`)
- **Local version:** `cd web && npm install && npm run dev` → http://localhost:3000 → `/app`

Optional, to light up the two "live" signals: set `DEEPSEEK_API_KEY` (co-pilot reasons with a real
LLM and the rail shows **live · deepseek**) and the `DEVNET_*` vars (the green **Live on Canton
DevNet** banner reads the real validator). Both self-hide/fallback gracefully when unset — see
[.env.example](../.env.example).

---

## The one control that matters: **View as**

Top-right of `/app` is a **View as** switcher — Agent Bank / Lender A / Lender B / Lender C /
Borrower. It re-renders the *same* $480M facility from each party's point of view. This is the whole
thesis in one control: the partition is real, and it's enforced on the server, not hidden on screen.

---

## Walkthrough (5 beats)

### 1 · Prove the privacy partition — *the money shot*
1. The product opens as **Lender A (Meridian Capital)** — you see one slice and five **sealed** tiles.
2. **View as → Agent Bank.** The center becomes the full **loan tape**: all six lenders, with
   commitment / drawn / undrawn / accrued. The agent bank co-signs every position, so it alone sees
   the whole book.
3. **View as → Lender B**, then back to **Lender A.** Each lender sees a *different* slice — and
   **Lender A's screen has zero trace of Lender B.**
4. Click **What others see.** A visibility matrix opens. Look at the **"Other lenders' positions"**
   row (✕ for every lender, ✓ only Agent Bank) and **"Borrower private financials"** (✕ for every
   lender). Each ✕ is a Daml signatory/observer boundary.

   > **What to verify:** a lender never receives another lender's numbers. Open dev-tools → Network →
   > `GET /api/facility?role=lenderA`: the payload contains only Meridian's slice — no `loanTape`,
   > no `financials`, no other-lender amounts. The partition is in the data, not the CSS.

### 2 · Settle a drawdown atomically — *technical execution*
1. Left spine → **Drawdown.** Keep **$4.0M · routine.** The card shows two legs — cash out, position up.
2. Click **Authorize drawdown.** The banner confirms **"Settled atomically · cash − · position + · tx"** —
   both legs in one indivisible commit. There is no intermediate state where cash moved but the
   position didn't.

### 3 · Watch the agent catch a covenant breach — *originality + technical execution*
1. Still on **Drawdown**, toggle to **$150M · capex III.**
2. Instantly: the projected-leverage bar turns **red — 5.19× vs 5.0× cap · BREACH**, and the
   co-pilot rail flips to **"⛔ Covenant breach — blocked"** with reasoning over the borrower's
   *private* financials.
3. The **Authorize** button is disabled ("Blocked by covenant guardrail"). Try to force it → the
   banner reads **"Rejected — would breach net-leverage covenant 5.0× … nothing moved."**

   > **The point:** there *is* undrawn capacity for this draw — a naive system would allow it. The
   > guardrail, not the prompt, is the authority. And it is the *ledger's*: `CovenantMonitor`
   > `AssessDrawdown` gives the co-pilot's read-only verdict, and `RecordDrawdown` — exercised
   > **inside** `SettleDrawdown`, in the same transaction as the money legs — aborts a breaching draw
   > so no cash or position can move (it also tracks debt cumulatively, so a run of small compliant
   > draws that together cross the cap is caught). See
   > [daml/Syndicate/Covenant.daml](../daml/Syndicate/Covenant.daml),
   > [Settlement.daml](../daml/Syndicate/Settlement.daml), and their tests.

   > In **real-ledger mode** (deployed on Canton DevNet) this beat is the ledger's own rejection: the
   > banner reads **"Rejected on-ledger"** and the co-pilot rail is badged **verified · on Canton**.

### 4 · Run a confidential secondary trade — *originality*
1. **View as → Lender A**; spine → **Secondary.**
2. Sell **$8.0M @ 99.25.** The counterparty shows as **████ (sealed).** Click **Execute DvP.**
3. Both legs settle together — the slice leaves your book and cash arrives — with price and
   counterparty hidden from everyone else. Switch to **Agent Bank → Origination**: the loan tape
   reconciles (the seller's hold % and commitment both moved).

### 5 · Close on the live proof — *real-world applicability*
Scroll to the green **Live on Canton DevNet** banner (when `DEVNET_*` is set): it reads the real
shared validator's JSON Ledger API and shows the current ledger offset + the Syndicate contracts
on-ledger (`Facility`, `Cash`, `DrawdownRequest`). The Daml model isn't a mock — it's live on Canton
DevNet right now.

---

## Roles cheat-sheet

| View as | Sees | Can settle? |
|---|---|---|
| **Agent Bank** | Whole facility: full loan tape (all 6 lenders) + private borrower financials | Yes — facility-wide |
| **Lender A / B / C** | Only its own slice + sealed placeholders + covenant ratios | Yes — its own slice; secondary trades |
| **Borrower** | Facility terms + aggregate drawn/undrawn + its own financials; **no** per-lender identities | No — requests only; the agent bank authorizes |

---

## Verify it deeper (optional)

```bash
# Daml model: multi-party privacy + atomic settlement + on-ledger covenant guardrail — all green
source scripts/daml-env.sh          # puts Daml SDK 3.4.11 + JDK 17 on PATH (adjust paths inside)
cd daml && daml build && daml test  # 13 scripts: privacy partition, atomic legs, secondary DvP, covenant block
```

The full DevNet seed (all 5 parties) is documented in
[ARCHITECTURE.md → DevNet deployment runbook](ARCHITECTURE.md#devnet-deployment-runbook).
