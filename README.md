# Syndicate

**A confidential syndicated-lending operating system on the Canton Network.**

Multiple competing lenders share a single loan facility, but each lender sees **only its own
slice**. The borrower's financials stay need-to-know. Every cash-vs-position movement —
drawdowns, interest, repayments, and secondary lender-to-lender trades — **settles atomically**
on Canton, eliminating settlement risk and reconciliation breaks. An LLM **Agent-Bank Co-Pilot**
monitors covenants against private borrower data and sequences settlement, constrained at all
times by on-ledger Daml authorization.

> Status: **early build.** Daml privacy partition + multi-party tests landing first
> (see [BUILD-ROADMAP.md](BUILD-ROADMAP.md)). This README is kept judge-ready as we go.

---

## Why this can only be built well on Canton

Private credit is a multi-trillion-dollar market still run on spreadsheets, email, and manual
agent banks. The hard constraints are *privacy* and *atomicity*, and they pull against each other
on every other infrastructure:

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
| Smart contracts | Daml (local dev on **2.10.4 LTS**; DevNet deploy on the **Canton 3.x** line) |
| Ledger | Canton — LocalNet for dev, **DevNet** for the live deployment |
| Ledger access | JSON Ledger API (frontend) + gRPC Ledger API v2 |
| Frontend | Next.js (App Router) + TypeScript + Tailwind |
| Agent service | Node/TypeScript calling the Anthropic API (separate process, own party) |

Repository layout and design rationale: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## How to run

> Full instructions land as each phase completes. The Daml core builds today.

### Prerequisites
- **Daml SDK 2.10.4** and a **JDK 17** (see `docs/ARCHITECTURE.md` for setup).
- Node.js 20+ and npm.

### Build & test the Daml model
```bash
cd daml
daml build      # compile the model to a DAR
daml test       # run the multi-party Daml Script tests, incl. the privacy partition
```

### Frontend & agent (later phases)
```bash
cd web   && npm install && npm run dev     # institutional dashboard + role-switcher
cd agent && npm install && npm run dev     # Agent-Bank Co-Pilot service
```

Copy [.env.example](.env.example) to `.env` and fill in. No host is hardcoded; everything is
configured via environment variables.

---

## Live deployment

DevNet URL: _coming in Phase 3._ The architecture is built DevNet-ready from day one.

---

## Demo

The 3-minute shot list lives in [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md). The money shot is the
**role-switcher**: switch between Borrower / Agent Bank / Lender A / B / C on one live deployment
and watch each role render a demonstrably different slice of the same facility — with Lender A's
screen showing zero trace of Lender B.
