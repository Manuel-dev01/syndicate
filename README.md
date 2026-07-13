# Syndicate

**A confidential syndicated-lending operating system on the Canton Network.**

Multiple competing lenders share a single loan facility, but each lender sees **only its own
slice**. The borrower's financials stay need-to-know. Every cash-vs-position movement —
drawdowns, interest, repayments, and secondary lender-to-lender trades — **settles atomically**
on Canton, eliminating settlement risk and reconciliation breaks. An LLM **Agent-Bank Co-Pilot**
monitors covenants against private borrower data and sequences settlement, constrained at all
times by on-ledger Daml authorization.

---

## Why this can only be built well on Canton

Private credit reached **~$2.1 trillion** globally in 2023 and is still run on spreadsheets, email,
and manual agent banks (IMF, *Global Financial Stability Report*, Apr 2024; projected to ~$2.8T by
2028 per Morgan Stanley). A secondary syndicated-loan trade settles on a **T+7 (par) to T+20
(distressed)** business-day standard — versus **T+2** for bonds — and in practice frequently runs
longer, with manual reconciliation the whole way (LSTA / LMA). The two hard constraints are
*privacy* and *atomicity*, and they pull against each other on every other infrastructure:

- **Sub-transaction privacy.** Competing lenders co-invest in one facility yet must never see
  each other's positions. Canton enforces this at the ledger level through Daml
  signatory/observer design — each lender's position is a contract only it and the agent bank can
  see. On a public or shared-state chain this leaks; bolt-on ZK/FHE cannot cleanly model
  multi-party need-to-know over a shared deal.
- **Atomic multi-party settlement.** Cash and position move in one indivisible transaction across
  parties who don't trust each other and don't share a database. Canton's atomic composition is
  the unlock; today this is weeks of reconciliation.

See [docs/PRIVACY-MODEL.md](docs/PRIVACY-MODEL.md) for the written-out argument.

---

## The MVP lifecycle (narrow & deep)

1. **Syndicate formation** — borrower + agent bank stand up a facility; three lenders take
   pro-rata commitments, each an invisible-to-the-others contract.
2. **Drawdown** — borrower draws; each lender funds pro-rata; cash + positions settle atomically.
3. **Interest accrual** — accrues per lender on drawn balances.
4. **Repayment** — borrower repays; cash returns to lenders; positions update atomically.
5. **Secondary trade** — Lender A sells a slice to Lender B; price and counterparties stay
   confidential from everyone else; position + cash settle atomically.

Plus the **Agent-Bank Co-Pilot**, which catches a covenant breach using real reasoning over
private borrower data — and can execute only what its Daml party is authorized to.

---

## Architecture at a glance

| Layer | Tech |
|---|---|
| Smart contracts | Daml |
| Ledger | Canton — **DevNet** for the live deployment |
| Ledger access | JSON Ledger API (frontend) + gRPC Ledger API v2 |
| Frontend | Next.js (App Router) + TypeScript + Tailwind |
| Agent service | Node/TypeScript calling the DeepSeek API (separate process, own party) |

Repository layout and design rationale: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## How to run

### Prerequisites
- **Daml SDK** and a **JDK 17+**.
- Node.js 20+ and npm.

### Build & test the Daml model
```bash
cd daml
daml build      # compile the model to a DAR
daml test       # run the multi-party Daml Script tests, incl. the privacy partition
```

### Frontend & agent
```bash
cd web   && npm install && npm run dev     # institutional dashboard + role-switcher
cd agent && npm install && npm run dev     # Agent-Bank Co-Pilot service
```

Copy [.env.example](.env.example) to `.env` and fill in. No host is hardcoded; everything is
configured via environment variables.

---

## Live deployment

**Live on Canton DevNet.** The Daml model (LF-2, SDK 3.4.11) is uploaded to the hackathon's shared
Canton DevNet validator and **real contracts are running on-ledger** — created and queried over the
JSON Ledger API v2 (`https://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/*`, OIDC auth).
Reproduce on the shared validator with `bash scripts/deploy-shared.sh`, or on a self-hosted
sponsored node with `bash scripts/deploy-devnet.sh` (both read config from `.env`), or verify
directly:

```bash
# active contracts our agent-bank party is a stakeholder of, on DevNet
curl $LEDGER_JSON_API_URL/v2/state/active-contracts -H "Authorization: Bearer $TOKEN" ...
# → Facility, Cash, DrawdownRequest (live)
```

**Frontend:** https://syndicate-delta.vercel.app — landing + the **deal-spine product** (`/app`),
typed to the same Daml model (`Facility` / `LenderPosition` / `Cash` / `Settlement`). It ships the
**role-switcher** (Agent Bank / Lender A / B / C / Borrower over one facility, each a demonstrably
different slice), a **"what others can see"** inspector that renders the signatory/observer partition
as a matrix, atomic both-legs settlement, and the DeepSeek **Agent-Bank Co-Pilot** — which catches a
leverage-covenant breach on a proposed drawdown and **blocks it** via a typed proposal + guardrail
(the ledger, not the prompt, is the authority). The partition is enforced server-side: a lender's
API payload carries no other-lender amounts and no borrower financials. The data layer swaps to the
DevNet JSON Ledger API with no UI change.

> The full multi-lender lifecycle on DevNet needs a few more `actAs` grants than the shared M2M
> user currently allows (`TOO_MANY_USER_RIGHTS`); the seed scripts run it end-to-end the moment a
> dedicated ledger user / org grant is available. Locally, all five lifecycle stages + the
> privacy/atomicity assertions pass on a real Canton participant (`daml test`, sandbox dry-run).

---

## Demo

The money shot is the
**role-switcher**: switch between Borrower / Agent Bank / Lender A / B / C on one live deployment
and watch each role render a demonstrably different slice of the same facility — with Lender A's
screen showing zero trace of Lender B.
