# Syndicate

**A confidential syndicated-lending operating system on the Canton Network.**

Multiple competing lenders share a single loan facility, but each lender sees **only its own slice**.
The borrower's financials stay need-to-know. Every cash-vs-position movement — drawdowns, interest,
repayments, and secondary lender-to-lender trades — **settles atomically** on Canton, eliminating
settlement risk and reconciliation breaks. An LLM **Agent-Bank Co-Pilot** monitors covenants against
private borrower data and sequences settlement, constrained at all times by on-ledger Daml
authorization.

> **Status:** Live on **Canton DevNet** — the deployed product **reads *and* writes** real on-ledger
> contracts (package `syndicatev3` v0.3.0). Daml model green (privacy + atomicity + covenant
> guardrail, 14 Script tests). Product at **https://syndicate-delta.vercel.app**; the offline
> `npm run dev` demo **mirrors the same 3-lender facility** with **no configuration**.

---

## Contents

- [Why this can only be built well on Canton](#why-this-can-only-be-built-well-on-canton)
- [Quickstart — run the demo in 2 minutes](#quickstart--run-the-demo-in-2-minutes)
- [The demo path](#the-demo-path)
- [The MVP lifecycle](#the-mvp-lifecycle)
- [The Daml model](#the-daml-model)
- [Build & test the Daml model](#build--test-the-daml-model)
- [Architecture](#architecture)
- [What's real vs. simulated](#whats-real-vs-simulated)
- [Project structure](#project-structure)
- [Live deployment](#live-deployment)
- [Tech stack](#tech-stack)
- [Documentation](#documentation)

---

## Why this can only be built well on Canton

Private credit reached **~$2.1 trillion** globally in 2023 and is still run on spreadsheets, email,
and manual agent banks (IMF, *Global Financial Stability Report*, Apr 2024; projected to ~$2.8T by
2028 per Morgan Stanley). A secondary syndicated-loan trade settles on a **T+7 (par) to T+20
(distressed)** business-day standard — versus **T+2** for bonds — and in practice frequently runs
longer, reconciled by hand (LSTA / LMA). The two hard constraints are *privacy* and *atomicity*, and
they pull against each other on every other infrastructure:

- **Sub-transaction privacy.** Competing lenders co-invest in one facility yet must never see each
  other's positions. Canton enforces this at the ledger level through Daml signatory/observer design
  — each lender's position is a contract only it and the agent bank can see. On a public or
  shared-state chain this leaks; bolt-on ZK/FHE cannot cleanly model multi-party need-to-know over a
  shared deal.
- **Atomic multi-party settlement.** Cash and position move in one indivisible transaction across
  parties who don't trust each other and don't share a database. Canton's atomic composition is the
  unlock; today this is weeks of reconciliation.

See [docs/PRIVACY-MODEL.md](docs/PRIVACY-MODEL.md) for the written-out argument.

---

## Quickstart — run the demo in 2 minutes

**Drive it now — live on Canton DevNet:** **https://syndicate-delta.vercel.app** → *Enter the
product* (`/app`). This runs in real-ledger mode: each role's view is read from the ledger, a drawdown
settles as a **real Canton transaction**, and a breaching draw is **rejected by the ledger**.

**Or run it locally — zero configuration.** The offline build ships with an in-memory ledger typed to
the Daml model that **mirrors the exact same 3-lender facility** as the live URL, so it runs with no
setup:

```bash
git clone <this-repo> && cd syndicate
cd web && npm install && npm run dev
# open http://localhost:3000  →  click "Enter the product"  (/app)
```

Same deal, same numbers — role-switcher, atomic settlement, the covenant-breach agent, and the
confidential secondary market all work offline (the live URL additionally settles the drawdown *on*
Canton; see [What's real vs. simulated](#whats-real-vs-simulated)).

**Optional — light up the two "live" signals locally:** copy [`.env.example`](.env.example) to
`web/.env.local` and set:
- `DEEPSEEK_API_KEY` — the Agent-Bank Co-Pilot reasons with a real LLM (rail shows **live · deepseek**);
  without it, a scripted fallback still computes the real covenant projection, so the breach beat is
  identical.
- `DEVNET_*` — the green **Live on Canton DevNet** banner reads the real validator; without it the
  banner self-hides. (Full real-ledger mode needs `LEDGER_MODE=real` + party ids — see `.env.example`.)

Then walk it beat-by-beat with **[docs/DEMO.md](docs/DEMO.md)**.

---

## The demo path

Open `/app` and use the **View as** switcher (top-right). It re-renders the *same* $480M facility from
each party's point of view — **the partition is enforced by the ledger** (a lender's on-ledger query
returns only its own position; offline, the same partition is enforced server-side).

| View as | Sees | Can settle? |
|---|---|---|
| **Agent Bank** | Whole facility: full loan tape (all 3 lenders) + private borrower financials | Yes — facility-wide |
| **Lender A / B / C** | Only its own slice + sealed placeholders + covenant ratios | Yes — its own slice; secondary market |
| **Borrower** | Facility terms + aggregate + its own financials; **no** per-lender identities | No — requests only |

The facility is a **3-lender, $480M** deal seeded mid-life (~65% drawn): Meridian Capital (40%),
Brightwater Credit (35%), Halton Park Capital (25%). The live URL and `npm run dev` show the identical
deal. The five beats — prove the partition → drawdown settles atomically (on Canton) → the agent
catches a covenant breach and the ledger blocks it → confidential secondary market → live-on-DevNet
proof — are written out click-by-click in **[docs/DEMO.md](docs/DEMO.md)**.

---

## The MVP lifecycle

1. **Syndicate formation** — borrower + agent bank stand up a facility; lenders take pro-rata
   commitments, each an invisible-to-the-others contract.
2. **Drawdown** — borrower draws; each lender funds pro-rata; cash + positions settle atomically.
3. **Interest accrual** — accrues per lender on drawn balances.
4. **Repayment** — borrower repays; cash returns to lenders; positions update atomically.
5. **Secondary trade** — Lender A sells a slice to Lender B via DvP; price and counterparties stay
   confidential from everyone else; position + cash settle atomically.

All five are modeled in Daml and proven atomic in the Script suite. On the **live URL**, the
**drawdown settles on Canton** (covenant-gated, both legs in one real transaction) and interest /
repayment / secondary are shown as clearly-labeled projections against the real facility; the
**offline sim** settles all five in-memory. See [What's real vs. simulated](#whats-real-vs-simulated).

Plus the **Agent-Bank Co-Pilot**, which catches a covenant breach using real reasoning over private
borrower data — and can execute only what its Daml party is authorized to.

---

## The Daml model

The model expresses **shared-but-partitioned** state ([daml/Syndicate/](daml/Syndicate/)):

| Template | Signatories | What it does |
|---|---|---|
| `Facility` | borrower + agent bank | the shared spine — facility terms, **no per-lender data** |
| `LenderPosition` | that lender + agent bank | one contract per lender — **the privacy partition** |
| `Cash` | issuer + owner | the payment leg |
| `Settlement` | (choices) | atomic drawdown / repayment + secondary **DvP** — both legs in one transaction; the drawdown enforces the covenant **in the same transaction** |
| `CovenantMonitor` | agent bank (observer: co-pilot) | on-ledger covenant guardrail — a breaching draw **aborts**. `AssessDrawdown` is the co-pilot's read-only pre-check; `RecordDrawdown`, exercised **inside** `SettleDrawdown`, is the authoritative gate and tracks debt **cumulatively** |
| `AgentAuthorization` | agent bank (observer: co-pilot) | the scoped, revocable grant that bounds the agent |

Privacy and atomicity are **test targets**, not hopes: the Daml Script suite asserts Lender A cannot
see Lender B, that both legs of every settlement move together, that a secondary trade's price stays
confidential, and that a covenant breach aborts on-ledger.

---

## Build & test the Daml model

Requires the **Daml SDK 3.4.11** and a **JDK 17+**.

```bash
source scripts/daml-env.sh          # puts Daml SDK 3.4.11 + JDK 17 on PATH (edit the paths inside)
cd daml
daml build                          # compiles to an LF-2 DAR (Canton 3.x / DevNet compatible)
daml test                           # 14 Daml Script tests — all green
```

`daml test` runs the privacy-partition assertions, atomic-settlement checks, secondary-trade
confidentiality + rollback, and the on-ledger covenant block. If `daml` is already on your PATH you
can skip the `source` step.

---

## Architecture

The same routes serve **two interchangeable back ends** behind one interface — the real Canton ledger
or an in-memory sim — chosen per request by `ledgerMode.isRealLedger()`, with a graceful fallback so
the demo never breaks:

```
Browser (Next.js, role-switcher) ── TanStack Query ──▶ /api/{facility, settle/[kind], copilot, devnet}
                                                              │
                    isRealLedger()?  ┌───────────────────────┴───────────────────────┐
                              REAL   ▼                                          SIM   ▼
              web/lib/ledgerClient.ts (JSON Ledger API v2, OIDC)      web/lib/store.ts (in-memory,
                 · devnetView.ts  — reads active-contracts AS the        typed to the Daml shapes)
                   role's party → partition enforced by Canton         · privacy.ts (viewAs) — same
                 · ledgerSettle.ts — drawdown: covenant gate +            partition, server-side
                   pro-rata fund, one atomic on-ledger commit          · guardrails.ts — covenant truth
                 · apiGuard.ts — origin + rate-limit on writes
                              │                                                        │
                              ▼                                                        ▼
                   Canton DevNet validator (live)                       (any real-mode failure ─┐
                              └──────────────── same FacilityView / SettlementRecord ───────────┘ falls back)
```

- **Privacy** is enforced by the *ledger* in real mode (`devnetView.ts` queries active-contracts as
  the role's party, so a lender only ever receives its own `LenderPosition`), and by `privacy.ts`
  (`viewAs`) offline — same guarantee, same payloads.
- **The Agent-Bank Co-Pilot** (`web/app/api/copilot/route.ts`) emits a **typed proposal**;
  `guardrails.ts` recomputes covenant truth and overrides the model if it disagrees — and in real
  mode the verdict is the ledger's own (`CovenantMonitor.AssessDrawdown`), badged *verified · on
  Canton*.
- All real-ledger reads/writes are scoped to the current `DAML_PACKAGE_ID`.

Full rationale, the real-ledger data path, the Canton/Daml decisions, and the DevNet runbook:
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## What's real vs. simulated

Honest by design, because it matters for evaluation:

- **Live on Canton DevNet — real reads *and* writes.** The Daml model (`syndicatev3` v0.3.0, LF-2,
  SDK 3.4.11) is uploaded to the shared validator, the full facility is seeded (`Facility`, 3
  `LenderPosition`, per-lender `Cash`, `AgentAuthorization`, `CovenantMonitor`), and the **deployed
  product runs against it**: each role's view is read from the ledger (the partition enforced by the
  participant), a drawdown **settles as a real on-ledger transaction**, and a breaching draw is
  **rejected by the ledger** (`CovenantMonitor` aborts). The co-pilot badges *verified · on Canton*
  and settlements read *Settled on Canton DevNet* with the real update id.
- **The sim is the safety net, not the demo.** Real-ledger mode is opt-in via env; on any real-mode
  failure (or an unconfigured preview) the app falls back to the in-memory ledger (`web/lib/store.ts`),
  **typed to the exact Daml shapes**, so the live demo can never break. Same interfaces, same UI.
- **Reproducible on a real participant.** All five lifecycle stages + the privacy / atomicity /
  covenant assertions pass on a real Canton ledger — `daml test` (14 Daml Script tests) and the
  `scripts/verify-*.ts` checks (covenant abort, atomic settle, per-role privacy) against the JSON
  Ledger API v2.

---

## Project structure

```
syndicate/
├── daml/Syndicate/          # the Daml model (Facility, Lender, Cash, Settlement, Covenant, Roles)
│   └── Tests/               # multi-party Daml Script tests (privacy, atomicity, covenant block)
├── web/                     # Next.js product — the role-switcher demo (this is what you run)
│   ├── app/                 #   /(landing) + /app (deal-spine) + /api/{facility,settle,copilot,devnet}
│   └── lib/
│       ├── store.ts privacy.ts guardrails.ts     #   the in-memory sim back end (offline)
│       ├── ledgerClient.ts devnetView.ts         #   the real-ledger back end: JSON Ledger API v2 +
│       ├── ledgerSettle.ts ledgerMode.ts         #     on-ledger reads/writes, gated by isRealLedger()
│       ├── apiGuard.ts                            #   origin + rate-limit + optional secret on writes
│       └── api.ts ledger-model.ts                 #   client-safe fetchers + shared types
├── agent/                   # design-reference stub for a standalone co-pilot process (live one is in web/)
├── scripts/                 # JSON Ledger API v2 tooling: allocate-parties · init-ledger · upload-dar ·
│                            #   reset-devnet · verify-{covenant,settle,privacy} · deploy-{shared,devnet}.sh
├── docs/                    # ARCHITECTURE.md · PRIVACY-MODEL.md · DEMO.md
├── .env.example             # every environment variable, documented
└── README.md                # you are here
```

---

## Live deployment

**Live on Canton DevNet.** The LF-2 DAR (`syndicatev3` v0.3.0) is uploaded to the hackathon's shared
Canton DevNet validator, the full facility is seeded, and the **deployed product reads *and* writes**
it over the JSON Ledger API v2 (`https://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/*`, OIDC
auth) — a drawdown is a real on-ledger transaction and a breaching draw is rejected by the ledger.

Reproduce on the shared validator with `bash scripts/deploy-shared.sh` (upload DAR → allocate + grant
parties → seed → verify the partition); reset and re-seed a pristine facility with
`scripts/reset-devnet.ts` then `scripts/init-ledger.ts`; and prove the on-ledger behavior with the
`scripts/verify-{covenant,settle,privacy}.ts` checks (covenant abort · atomic settle · per-role
privacy). All read config from `.env`; see the runbook in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#devnet-deployment-runbook).

**Frontend:** https://syndicate-delta.vercel.app — the landing page + the deal-spine product (`/app`).

---

## Tech stack

| Layer | Tech |
|---|---|
| Smart contracts | Daml — **SDK 3.4.11 → Daml-LF 2.x** (Canton 3.x) |
| Ledger | Canton — **DevNet** for the live deployment |
| Ledger access | JSON Ledger API v2 (`/v2/*`) + OIDC client-credentials auth |
| Frontend | Next.js (App Router) + TypeScript + Tailwind + TanStack Query |
| Agent co-pilot | DeepSeek (server-side), bounded by a typed proposal + on-ledger guardrail |
| Hosting | Vercel (frontend) · shared Canton DevNet validator (ledger) |

---

## Documentation

| Doc | What it covers |
|---|---|
| [docs/DEMO.md](docs/DEMO.md) | Drive & follow the demo — the click-path, beat by beat |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, the Daml model, the agent guardrail, the DevNet runbook |
| [docs/PRIVACY-MODEL.md](docs/PRIVACY-MODEL.md) | The "only-on-Canton" privacy argument, written out |
| [.env.example](.env.example) | Every environment variable, documented |
