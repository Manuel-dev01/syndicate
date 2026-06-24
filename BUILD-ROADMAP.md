# BUILD-ROADMAP.md — Syndicate Phased Build Plan

> Drive the build phase by phase. Each phase has a goal, exit criteria, and a copy-paste prompt for Claude Code. **Do not advance until exit criteria are green.** Re-read `CLAUDE.md` at the start of every phase.

---

## Phase 0 — Foundations & scaffolding
**Goal:** a valid, buildable, judge-readable empty skeleton.
**Exit criteria:** repo matches `CLAUDE.md` §3; `daml build` succeeds; `web` and `agent` install; `README.md` skeleton + `docs/` stubs exist; `.env.example` documents every variable; secrets gitignored.

> **Prompt:** "Phase 0. Scaffold the repo exactly per `CLAUDE.md` §3. Create `daml.yaml` targeting Daml 3.x with empty-but-valid modules so `daml build` passes. Init the `web` Next.js (App Router, TS, Tailwind) app and the `agent` Node/TS service with their `package.json`s. Add `.env.example`, `.gitignore` (secrets, build artifacts, node_modules, `.daml`), and a judge-facing `README.md` skeleton (What it is / Why only on Canton / How to run / Demo script placeholder). Stub `docs/ARCHITECTURE.md`, `docs/PRIVACY-MODEL.md`, `docs/DEMO-SCRIPT.md`, and `RESEARCH-VERIFY.md`. Verify Daml/Canton specifics against primary docs. Commit. Report and stop."

---

## Phase 1 — Daml core: the privacy partition
**Goal:** the shared-but-partitioned model exists and is provably private.
**Exit criteria:** `Roles.daml`, `Facility.daml`, `Lender.daml` compile; each template has a signatory/observer comment block; a Daml Script test creates a facility with 3 lenders and **asserts Lender A cannot see Lender B's `LenderPosition`**; tests green.

> **Prompt:** "Phase 1. Implement `Roles.daml` (Borrower, AgentBank, Lender parties; an AgentAuthorization contract granting the co-pilot's party scoped read on covenant data). Implement `Facility.daml` (shared spine: signatories Borrower + AgentBank; NO visible per-lender list) and `Lender.daml` (`LenderPosition`: one contract per lender; signatories that Lender + AgentBank; no other lender as observer). Comment block above each template stating signatories/observers and confirming no improper visibility. Write a Daml Script test: form a facility with 3 lenders, then assert Lender A's visible contracts exclude Lender B's `LenderPosition`. Make it green. Commit. Report and stop."

---

## Phase 2 — Atomic settlement: drawdown, interest, repayment
**Goal:** the cash leg and position leg move together, atomically, across the lifecycle.
**Exit criteria:** `Cash.daml` (or tokenized holding) + `Settlement.daml` implement drawdown (pro-rata, one transaction), interest accrual, and repayment; Daml Script tests prove each settles atomically (no intermediate inconsistent state) and preserves the privacy partition; tests green.

> **Prompt:** "Phase 2. Implement `Cash.daml` (a simple tokenized cash/deposit holding) and `Settlement.daml`. Build: (a) `DrawdownRequest` by Borrower → pro-rata funding where each Lender's cash and `LenderPosition` update in ONE Daml transaction; (b) interest accrual per Lender on drawn amounts; (c) repayment returning cash to Lenders with atomic position updates. Write Daml Script tests proving atomicity (assert no state where cash moved but position didn't, or vice versa) and that the privacy partition still holds after settlement. Green tests. Commit. Report and stop."

---

## Phase 3 — Secondary trade + DevNet deployment
**Goal:** confidential lender-to-lender trade works; the whole thing runs live on DevNet.
**Exit criteria:** `SecondaryTrade` moves a position slice seller→buyer and cash buyer→seller atomically, with price/counterparties confidential from non-parties; `scripts/init-ledger.ts` seeds a demo facility; deployed and reachable on **Canton DevNet**; frontend env points to DevNet.

> **Prompt:** "Phase 3. Implement `SecondaryTrade` in `Settlement.daml`: Lender A sells a slice of its `LenderPosition` to Lender B — position moves A→B and cash moves B→A in ONE transaction; Borrower and other Lenders cannot see price or counterparties. Daml Script test proving atomicity + confidentiality. Then: write `scripts/init-ledger.ts` to seed parties + a demo facility, `scripts/allocate-parties.ts`, and `scripts/deploy-devnet.sh`. Deploy the DAR to Canton DevNet and confirm it's reachable; document the exact steps in `docs/ARCHITECTURE.md`. Verify the DevNet onboarding/faucet flow against primary docs. Commit. Report and stop."

---

## Phase 4 — Agent-Bank Co-Pilot (real LLM, on-ledger-authorized)
**Goal:** a substantive agent that catches a covenant breach using real reasoning, bounded by Daml authorization.
**Exit criteria:** `Covenant.daml` defines covenants + a monitoring contract the agent's party reads need-to-know; `agent/` service streams contracts, calls the Anthropic API to reason over private data, returns a **typed proposal**, validates it through `guardrails.ts`, and exercises the authorized Daml choice; a scripted scenario shows the agent flagging a leverage-covenant breach; the agent cannot execute anything its party isn't authorized to.

> **Prompt:** "Phase 4. Implement `Covenant.daml` (covenant definitions + a `CovenantMonitor` contract readable need-to-know by the AgentBank/agent party; borrower financials NOT disclosed wholesale to lenders). Build the `agent/` service: `ledgerClient.ts` (authorized choice execution via Ledger API), `covenantMonitor.ts` (stream relevant contracts, call the Anthropic API with party-scoped private data to assess whether a proposed drawdown breaches the leverage covenant, return a STRUCTURED TYPED proposal of which Daml choice to exercise), and `guardrails.ts` (reject proposals the party isn't authorized for or that fail contract preconditions; reject malformed LLM output). Create a demo scenario where a drawdown WOULD breach leverage so the agent visibly catches it. Prove the agent cannot bypass Daml authorization. Commit. Report and stop."

---

## Phase 5 — Institutional frontend + the role-switcher money shot
**Goal:** a data-forward dashboard whose role-switcher visually proves per-party privacy.
**Exit criteria:** Next.js app with role switching (Borrower / AgentBank / Lender A / Lender B / Lender C); each role shows a demonstrably different slice; a "what others can see" inspector proves the partition; settlement updates both legs live; institutional aesthetic; reads live from DevNet via JSON API + TanStack Query; no browser storage APIs.

> **Prompt:** "Phase 5. Consult the frontend-design skill first. Build the Next.js dashboard reading live from DevNet via the JSON Ledger API (generated TS types, TanStack Query, streaming for live updates). Implement the role-switcher (Borrower / AgentBank / Lender A / B / C) where each view shows a genuinely different slice of the same facility — Lender A's screen has zero trace of Lender B. Add a 'what others can see' privacy inspector. Loan-tape columns: commitment, drawn, undrawn, accrued interest, yield. Show drawdowns and trades settling atomically and live. Dark, dense, institutional aesthetic — no default component-library look, no emojis, no browser storage. Wire the agent's covenant-breach flag into the AgentBank view. Commit. Report and stop."

---

## Phase 6 — Submission assets
**Goal:** everything a winning submission needs.
**Exit criteria:** judge-ready `README.md` (what / only-on-Canton story / run instructions / live URL); `docs/PRIVACY-MODEL.md` written out; `docs/DEMO-SCRIPT.md` as a shot list hitting all four judging criteria in 3 minutes; deck drafted with **verified** facts (clear `RESEARCH-VERIFY.md`); design-partner narrative with quantified pain; public repo clean.

> **Prompt:** "Phase 6. Finalize `README.md` for judges (lead with the only-on-Canton story and the live DevNet URL). Write `docs/PRIVACY-MODEL.md` fully (signatory/observer design → sub-transaction privacy → why a public/EVM chain leaks and ZK/FHE can't cleanly model this). Write `docs/DEMO-SCRIPT.md` as a 3-minute shot list: (1) the problem, (2) form syndicate + role-switch to prove privacy, (3) drawdown settling atomically, (4) agent catching the covenant breach, (5) confidential secondary trade, (6) the design-partner + market line. Resolve every `// VERIFY:` in `RESEARCH-VERIFY.md` against primary sources or cut the claim. Draft the deck outline. Commit. Report."

---

## Cross-phase guardrails
- Privacy partition is a **test target** in every phase that touches Daml — never regress it.
- Atomicity assertions live in the test suite — never split settlement.
- The agent never bypasses Daml authorization.
- DevNet by end of Phase 3 — don't discover deployment problems late.
- Keep `README.md` and `DEMO-SCRIPT.md` current as you go.
- Verify Canton/Daml specifics against primary docs; mark unconfirmed with `// VERIFY:`.

## Pivot triggers (from strategy)
- If DevNet access proves unreliable: fall back to a sandbox-hosted live demo, disclose it, but keep the architecture DevNet-ready.
- If you discover a prior strong private-credit Canton entry: sharpen the agentic + secondary-trade confidentiality angle to re-establish originality, or escalate to me before pivoting to the "Mesh" intercompany-netting idea.