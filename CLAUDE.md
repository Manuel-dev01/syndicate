# CLAUDE.md — Syndicate Operating Manual

> **You are the lead engineer on Syndicate.** This file governs every Claude Code session in this repo. Read it fully before acting. When in doubt, prefer the rule here over your default behavior. Update this file when an architectural decision is made — it is the single source of truth.

---

## 0. What we are building (one paragraph)

Syndicate is a **confidential syndicated-lending / private-credit operating system on the Canton Network**. Multiple competing lenders share a single loan facility, but each lender sees **only its own slice** (its commitment, fundings, interest, and trades). The borrower's financials and covenants are shared strictly **need-to-know**. Every cash-vs-position movement — drawdowns, interest accruals, repayments, and secondary lender-to-lender transfers — **settles atomically** on Canton, eliminating settlement risk and reconciliation. A real LLM agent (the "Agent-Bank Co-Pilot") monitors covenants against private borrower data and sequences atomic settlement, constrained at all times by on-ledger Daml authorization.

**This is a hackathon submission built to win #1.** Optimize relentlessly for the four judging criteria: **technical execution, originality, UX/design, real-world applicability.** Every decision serves the 3-minute demo video and the "this could only be built well on Canton" story.

---

## 1. Non-negotiable principles

1. **Privacy is the product.** The single most important thing the demo must *prove visually* is that Lender A cannot see Lender B's position even though they share one facility. If a change weakens or obscures per-party privacy, do not make it. Sub-transaction privacy via Daml signatory/observer/controller design is the core. Never put a party as an observer on data it shouldn't see "for convenience."
2. **Atomicity is non-negotiable.** Cash leg and position leg settle in a single Daml transaction or not at all. Never split settlement into "transfer cash, then update position" as two separate commits. If you cannot make it atomic, stop and flag it.
3. **The agent does real work, on-ledger-authorized.** The LLM agent reasons over private borrower data and *proposes* actions; it can only *execute* what its Daml party is authorized to execute. The ledger is the guardrail, not the prompt. Never let the agent be a chatbot bolted on. Never let the LLM's output bypass Daml authorization — the contract choices are the only way state changes.
4. **Enterprise-credible, not consumer-cute.** This is software a private-credit fund's operations desk would log into. Dense, precise, trustworthy, data-forward. No emojis in the product UI, no playful microcopy, no crypto-degen aesthetics. Think Bloomberg Terminal meets a clean modern fintech dashboard.
5. **Live on Canton DevNet.** The "live product" requirement is satisfied by a DevNet-hosted deployment. Build and test locally on LocalNet/sandbox first, but the architecture must promote cleanly to DevNet. Never hardcode `localhost`; use environment config.
6. **Ship narrow and deep.** One workflow done end-to-end beats five half-built ones. The MVP lifecycle is: syndicate formation → one drawdown → interest accrual → one repayment → one secondary lender-to-lender trade. Resist scope creep aggressively.
7. **No fabricated facts in deliverables.** Market-size figures, institution names, and Canton specifics in the deck and README must be verifiable. Flag anything uncertain with `// VERIFY:` rather than inventing it. (See `RESEARCH-VERIFY.md`.)

---

## 2. Tech stack (authoritative — do not substitute without updating this file)

| Layer | Choice | Notes |
|---|---|---|
| Smart contracts | **Daml** — local dev pinned to **2.10.4 (LTS)**, DevNet deploy targets the **Canton 3.x** line | Daml Script for tests + ledger init. See decision note below. |
| Ledger | **Canton** — LocalNet/sandbox for dev, **DevNet** for live | Global Synchronizer on DevNet |
| Ledger access | **JSON Ledger API** (primary for frontend) + gRPC Ledger API v2 where needed | |
| Codegen | **Daml TypeScript codegen** | generated types consumed by frontend + agent |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | `@daml/ledger` + `@daml/react` for ledger calls |
| Agent service | **Node/TypeScript service** calling **Anthropic API** (`claude-opus-4` class for reasoning) | reasons over private data, proposes Daml choices |
| Auth/identity | Canton parties + JWT for Ledger API; party-scoped tokens | keep token minting in a small auth helper |
| State/data fetching | TanStack Query over the JSON API; WebSocket/stream for live updates | |
| Hosting | Frontend on Vercel; agent service + Canton node on a VM/managed host reachable from DevNet | |

**Hard rules on the stack:**
- Frontend talks to the ledger **only** through generated types and the JSON API client. No raw, untyped contract payloads.
- The agent service is a **separate process** from the frontend. It has its own party credentials. It never shares the frontend's tokens.
- All secrets (Anthropic API key, party JWTs) come from environment variables. Never commit secrets. `.env.example` documents every variable.

**Decision note — Daml version pin (2026-06-24).** The manual originally specified Daml 3.x. On standing up the dev environment we found the 3.x toolchain deprecates the classic `daml` assistant and steers to a separate Canton Network Quickstart, making the local `daml build`/`daml test`/Daml Script loop fragile to stand up. Daml **2.10.4** (current LTS) ships a clean Windows installer and a battle-tested local loop. Because the Daml *language* (templates, signatory/observer privacy, choices, Daml Script) is portable across the 2.x and 3.x lines, we **pin local dev/test to 2.10.4** and keep the **DevNet deploy on the Canton 3.x line**. The Daml source is written in the portable subset. **// VERIFY:** Daml-LF compatibility when promoting the 2.10.4-compiled DAR onto Canton 3.x DevNet — confirm in Phase 3 against docs.digitalasset.com (may require recompiling with a 3.x SDK targeting the same LF version, which is a mechanical re-`daml build`).

---

## 3. Repository layout (target)

```
syndicate/
├── CLAUDE.md                  # this file
├── README.md                  # judge-facing: what, why-Canton, how to run, demo script
├── RESEARCH-VERIFY.md         # facts to confirm before the deck
├── daml/
│   ├── daml.yaml
│   └── Syndicate/
│       ├── Facility.daml       # core facility lifecycle templates
│       ├── Lender.daml         # lender position, commitment
│       ├── Cash.daml           # tokenized cash / payment leg
│       ├── Settlement.daml     # atomic DvP/transfer choices
│       ├── Covenant.daml       # covenant definitions + monitoring contracts
│       └── Roles.daml          # party roles, onboarding, agent authorization
├── daml-tests/
│   └── *.daml                  # Daml Script test scenarios (multi-party)
├── agent/
│   ├── src/
│   │   ├── index.ts
│   │   ├── covenantMonitor.ts   # LLM reasoning over private borrower data
│   │   ├── ledgerClient.ts      # authorized choice execution
│   │   └── guardrails.ts        # enforce: agent can only do what its party can
│   └── package.json
├── web/
│   ├── app/                    # Next.js App Router
│   │   ├── (roles)/borrower/...
│   │   ├── (roles)/agent-bank/...
│   │   └── (roles)/lender/[id]/...
│   ├── components/
│   ├── lib/ledger.ts           # JSON API client + codegen types
│   └── package.json
├── scripts/
│   ├── init-ledger.ts          # seed parties + a demo facility
│   ├── deploy-devnet.sh
│   └── allocate-parties.ts
└── docs/
    ├── ARCHITECTURE.md
    ├── PRIVACY-MODEL.md        # the only-on-Canton story, written out
    └── DEMO-SCRIPT.md          # the 3-minute video shot list
```

---

## 4. The Daml domain model (design intent)

The model must express **shared-but-partitioned** state. Key design decisions:

- **`Facility`** is the shared spine. Signatories: borrower + agent bank. Observers: only the syndicate members, and only on the *fields they're entitled to*. Per-lender data lives in **separate per-lender contracts**, NOT as a visible list on the Facility.
- **`LenderPosition`** is one contract per lender. Signatories: that lender + agent bank. **No other lender is a signatory or observer.** This is what makes Lender A blind to Lender B. This is the heart of the privacy proof.
- **`DrawdownRequest` / `Drawdown`**: borrower requests; agent bank (optionally via the agent) coordinates; each lender's pro-rata funding is a separate authorized transfer; the whole thing commits atomically.
- **`Cash`** (or a tokenized-deposit holding): the payment leg. Settlement choices move cash **and** update positions in one transaction.
- **`SecondaryTrade`**: a lender-to-lender transfer of a position slice. Atomic: position moves from seller to buyer **and** cash moves buyer→seller in one commit. The borrower and other lenders do **not** see the price or counterparties beyond what's strictly required.
- **`Covenant`**: definitions plus a monitoring contract the agent's party can read. The borrower's underlying financials are disclosed need-to-know to the agent bank/agent, never to lenders wholesale.

**When designing any template, ask: "Who are the signatories? Who are the observers? Does any party gain visibility they shouldn't have?" Write the answer in a comment above the template.**

---

## 5. The agent (Agent-Bank Co-Pilot) — how to build it right

The agent is a real LLM service, but the ledger is the source of truth and the authorization boundary.

**Flow:**
1. Agent's Daml party is an observer/reader on the borrower's covenant + financial data (need-to-know).
2. Agent service streams relevant contracts from the Ledger API.
3. On a trigger (drawdown request, periodic covenant check), it calls the **Anthropic API** with the *private* data to reason: "Does this drawdown breach the leverage covenant? What's the compliant funding sequence?"
4. The LLM returns a **structured proposal** (which Daml choice to exercise, with what arguments) — never free-form prose that mutates state.
5. `guardrails.ts` validates the proposal against the agent's authorization and the contract's preconditions, then `ledgerClient.ts` exercises the choice. **If the agent's party isn't authorized, it cannot execute — full stop.**
6. Every agent action is itself an on-ledger event with a clear provenance trail.

**Demo-critical:** the agent must visibly catch a covenant breach in the video. Build a scenario where a drawdown *would* breach leverage, the agent flags it with reasoning, and either blocks or escalates. That single moment proves "real agent, not wrapper."

**Guardrail rules:**
- The LLM never sees private data it isn't entitled to on-ledger. Its inputs are scoped to its party's visibility.
- The LLM's output is parsed into a typed proposal; reject and retry on malformed output.
- No autonomous action without the corresponding Daml authorization existing first.

---

## 6. Frontend — what "blow the judges away" means here

- **Role-switcher is the hero feature.** A single deployment where you can switch between Borrower / Agent Bank / Lender A / Lender B / Lender C, and each view shows a *demonstrably different* slice of the same facility. The 3-minute video lives or dies on this.
- **Make privacy visible.** Show, side by side, that Lender A's screen has no trace of Lender B's position. Consider a "what others can see" inspector that proves the partition.
- **Settlement is instant and atomic in the UI.** When a drawdown or trade settles, both legs update together, live, with no intermediate inconsistent state.
- **Aesthetic:** dark, dense, institutional. Real numbers, real loan-tape columns (commitment, drawn, undrawn, accrued interest, yield). Tailwind; no component-library default look — design intentional, data-forward screens (consult the frontend-design skill).
- **No browser storage APIs** in any artifact-style component. State comes from the ledger via TanStack Query.

---

## 7. Workflow & session discipline for Claude Code

- **Start every session by re-reading this file and `docs/DEMO-SCRIPT.md`.** Build toward the demo.
- **Daml first, then agent, then UI.** Get the model and atomic settlement passing Daml Script tests before touching the frontend. A green multi-party test suite is the foundation.
- **Test multi-party privacy explicitly.** Write Daml Script tests that assert Lender A *cannot* see Lender B's `LenderPosition`. Privacy is a test target, not a hope.
- **Commit in small, labeled increments.** Conventional commits. Each commit should leave tests green.
- **Deploy to DevNet early** (end of week 1) to de-risk the "live product" requirement. Don't discover DevNet problems the night before.
- **Keep `README.md` judge-ready at all times:** what it is, the only-on-Canton story, run instructions, and the demo script. Judges read the README first.
- **When you hit a Canton/Daml sharp edge, write it into `docs/ARCHITECTURE.md`** so the next session doesn't re-learn it.
- **Verify Canton/Daml specifics against primary docs** (docs.daml.com, docs.global.canton.network, sync.global) rather than memory — versions and APIs move. Mark anything unconfirmed with `// VERIFY:`.

---

## 8. Definition of done (MVP for submission)

- [ ] Daml model compiles; multi-party Daml Script tests pass, including explicit privacy-partition assertions.
- [ ] Syndicate formation, one drawdown, interest accrual, one repayment, and one secondary trade all work end-to-end with **atomic** settlement.
- [ ] Agent service catches a covenant breach using real Anthropic-API reasoning over private data, constrained by on-ledger authorization.
- [ ] Next.js app with working role-switcher proving per-party privacy; institutional UX.
- [ ] Deployed live on Canton **DevNet**; frontend on a public URL.
- [ ] `README.md`, `docs/PRIVACY-MODEL.md`, and `docs/DEMO-SCRIPT.md` complete and judge-ready.
- [ ] 3-minute demo recorded; deck drafted with verified facts.

---

## 9. What NOT to do

- Do not put parties as observers "to make the UI easier." Privacy first.
- Do not split settlement into multiple commits.
- Do not let the LLM mutate ledger state directly or bypass Daml authorization.
- Do not build a broad shallow platform; build one deep workflow.
- Do not use a generic component-library look; design intentional institutional screens.
- Do not invent figures or institution claims; flag with `// VERIFY:`.
- Do not hardcode `localhost` or secrets.
- Do not add features that don't serve the 3-minute demo or one of the four judging criteria.