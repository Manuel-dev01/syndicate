# Syndicate

**A confidential syndicated-lending operating system on the Canton Network.**

Multiple competing lenders share a single loan facility, but each lender sees **only its own slice**.
The borrower's financials stay need-to-know. Every cash-vs-position movement — drawdowns, interest,
repayments, and secondary lender-to-lender trades — **settles atomically** on Canton, eliminating
settlement risk and reconciliation breaks. An LLM **Agent-Bank Co-Pilot** monitors covenants against
private borrower data and sequences settlement, constrained at all times by on-ledger Daml
authorization.

> **Status:** Daml model green (privacy + atomicity + covenant guardrail); real contracts **live on
> Canton DevNet**; product deployed at **https://syndicate-delta.vercel.app**.
> The full demo runs locally with **no configuration**.

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

The product is the demo. It ships with an in-memory ledger typed to the Daml model, so **it runs with
zero configuration**:

```bash
git clone <this-repo> && cd syndicate
cd web && npm install && npm run dev
# open http://localhost:3000  →  click "Enter the product"  (/app)
```

That's the whole demo — role-switcher, atomic settlement, the covenant-breach agent, and the
confidential secondary trade all work offline.

**Optional — light up the two "live" signals:** copy [`.env.example`](.env.example) to `web/.env.local`
and set:
- `DEEPSEEK_API_KEY` — the Agent-Bank Co-Pilot reasons with a real LLM (rail shows **live · deepseek**);
  without it, a scripted fallback still computes the real covenant projection, so the breach beat is
  identical.
- `DEVNET_*` — the green **Live on Canton DevNet** banner reads the real validator; without it the
  banner self-hides.

Then walk it beat-by-beat with **[docs/DEMO.md](docs/DEMO.md)**.

---

## The demo path

Open `/app` and use the **View as** switcher (top-right). It re-renders the *same* $480M facility from
each party's point of view — the partition is real and **enforced server-side**, not hidden on screen.

| View as | Sees | Can settle? |
|---|---|---|
| **Agent Bank** | Whole facility: full loan tape (all 6 lenders) + private borrower financials | Yes — facility-wide |
| **Lender A / B / C** | Only its own slice + sealed placeholders + covenant ratios | Yes — its own slice; secondary trades |
| **Borrower** | Facility terms + aggregate + its own financials; **no** per-lender identities | No — requests only |

The five beats — prove the partition → drawdown settles atomically → the agent catches a covenant
breach and the ledger blocks it → confidential secondary trade → live-on-DevNet proof — are written
out click-by-click in **[docs/DEMO.md](docs/DEMO.md)**.

---

## The MVP lifecycle

1. **Syndicate formation** — borrower + agent bank stand up a facility; lenders take pro-rata
   commitments, each an invisible-to-the-others contract.
2. **Drawdown** — borrower draws; each lender funds pro-rata; cash + positions settle atomically.
3. **Interest accrual** — accrues per lender on drawn balances.
4. **Repayment** — borrower repays; cash returns to lenders; positions update atomically.
5. **Secondary trade** — Lender A sells a slice to Lender B via DvP; price and counterparties stay
   confidential from everyone else; position + cash settle atomically.

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
| `Settlement` | (choices) | atomic drawdown / repayment + secondary **DvP** — both legs in one transaction |
| `CovenantMonitor` | agent bank (observer: co-pilot) | on-ledger covenant guardrail — a breaching draw **aborts** |
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
daml test                           # 13 Daml Script tests — all green
```

`daml test` runs the privacy-partition assertions, atomic-settlement checks, secondary-trade
confidentiality + rollback, and the on-ledger covenant block. If `daml` is already on your PATH you
can skip the `source` step.

---

## Architecture

```
Browser (Next.js, role-switcher)
   │  TanStack Query
   ▼
/api/facility   /api/settle/[kind]   /api/copilot            /api/devnet
   │  viewAs(role)   │ atomic          │ DeepSeek + guardrail   │ OIDC → JSON Ledger API v2
   ▼  (server)       ▼  mutation       ▼  (server-side)         ▼  (server-side)
web/lib/store.ts (in-memory ledger, typed to the Daml model)   Canton DevNet validator (live)
   ▲                                                              ▲
   └──────────── same view/settlement interfaces ────────────────┘
                (swaps to the JSON Ledger API on DevNet, no UI change)
```

The privacy partition is enforced **server-side** in `web/lib/privacy.ts` (`viewAs(role)`): a
lender-role API payload carries only that lender's slice — no other-lender amounts, no borrower
financials. The Agent-Bank Co-Pilot (`web/app/api/copilot/route.ts`) emits a **typed proposal**;
`web/lib/guardrails.ts` validates it and recomputes covenant truth, overriding the model if it
disagrees — the same guarantee the Daml `CovenantMonitor` enforces on-ledger.

Full rationale, the Canton/Daml decisions, and the DevNet runbook:
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## What's real vs. simulated

Honest by design, because it matters for evaluation:

- **Real and live on Canton DevNet:** the Daml model (LF-2, SDK 3.4.11) is uploaded to the shared
  validator and real contracts run on-ledger (`Facility`, `Cash`, `DrawdownRequest`), created and
  queried over the JSON Ledger API v2. The deployed product proves it with a server-side live-read
  banner.
- **Simulated for the interactive demo:** the `/app` product is backed by an in-memory ledger
  (`web/lib/store.ts`) **typed to the exact Daml shapes** (`Facility` / `LenderPosition` / `Cash` /
  `Settlement`). This lets the full five-role demo run with no infrastructure. The data layer swaps to
  the DevNet JSON Ledger API behind the same interfaces — the UI never changes.
- **Gated (external):** the full 5-party seed on DevNet needs a few more `actAs` grants than the
  shared M2M user allows (`TOO_MANY_USER_RIGHTS`); the seed scripts run it end-to-end the moment a
  dedicated ledger user / org grant is available. Locally, all five lifecycle stages + the
  privacy/atomicity/covenant assertions pass on a real Canton participant (`daml test`).

---

## Project structure

```
syndicate/
├── daml/Syndicate/          # the Daml model (Facility, Lender, Cash, Settlement, Covenant, Roles)
│   └── Tests/               # multi-party Daml Script tests (privacy, atomicity, covenant block)
├── web/                     # Next.js product — the role-switcher demo (this is what you run)
│   ├── app/                 #   /(landing) + /app (deal-spine) + /api/{facility,settle,copilot,devnet}
│   └── lib/                 #   store.ts (sim ledger), privacy.ts (viewAs), guardrails.ts, api.ts
├── agent/                   # design-reference stub for a standalone co-pilot process (live one is in web/)
├── scripts/                 # DevNet deploy + JSON Ledger API v2 seeding (allocate, init, verify, deploy)
├── docs/                    # ARCHITECTURE.md · PRIVACY-MODEL.md · DEMO.md
├── .env.example             # every environment variable, documented
└── README.md                # you are here
```

---

## Live deployment

**Live on Canton DevNet.** The LF-2 DAR is uploaded to the hackathon's shared Canton DevNet validator
and **real contracts are running on-ledger** — created and queried over the JSON Ledger API v2
(`https://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/*`, OIDC auth). Reproduce on the shared
validator with `bash scripts/deploy-shared.sh`, or on a self-hosted sponsored node with
`bash scripts/deploy-devnet.sh` (both read config from `.env`; see the runbook in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#devnet-deployment-runbook)).

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
