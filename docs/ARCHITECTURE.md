# Architecture

Design rationale and the Canton/Daml decisions behind Syndicate — how the pieces fit, why they're
shaped this way, and how the demo maps onto the real ledger.

## Contents

- [System overview](#system-overview)
- [Component responsibilities](#component-responsibilities)
- [The Daml domain model](#the-daml-domain-model)
- [Privacy: signatory/observer](#privacy-signatoryobserver)
- [Atomic settlement](#atomic-settlement)
- [The agent & the guardrail](#the-agent--the-guardrail)
- [Frontend & data layer](#frontend--data-layer)
- [Request flow](#request-flow)
- [DevNet deployment runbook](#devnet-deployment-runbook)
- [Toolchain & LF version](#toolchain--lf-version)
- [Canton/Daml sharp edges](#cantondaml-sharp-edges)

---

## System overview

Syndicate is a Next.js product in front of a data layer that is **interface-compatible with the Daml
model**. In the demo, that data layer is an in-memory ledger (`web/lib/store.ts`) typed to the exact
Daml shapes; on DevNet, the same interfaces are served by the Canton JSON Ledger API. The UI, the
privacy filter, and the settlement semantics do not change between the two.

```
                         ┌─────────────────────────────────────────────┐
                         │  Browser — Next.js (App Router)              │
                         │  landing  ·  /app deal-spine + role-switcher │
                         └───────────────┬─────────────────────────────┘
                                         │  TanStack Query (typed client, web/lib/api.ts)
        ┌────────────────┬───────────────┼─────────────────────┬──────────────────────┐
        ▼                ▼               ▼                     ▼                      ▼
 GET /api/facility  POST /api/settle  POST /api/copilot   GET /api/devnet         (static)
   viewAs(role)       /[kind]           DeepSeek +           OIDC →
   server-enforced    atomic legs       guardrails.ts        JSON Ledger API v2
   partition          or SettlementErr  (server-side)        (server-side)
        │                │               │                     │
        └────────────────┴───────┬───────┘                     │
                                 ▼                              ▼
                web/lib/store.ts (in-memory ledger,   Canton DevNet validator (LIVE)
                typed to the Daml model)               Facility · Cash · DrawdownRequest
                                 ▲                              on-ledger
                                 └──── same view/settlement interfaces ────┐
                                       swap to the JSON Ledger API on DevNet │
                                       with no UI change ◄────────────────────┘

  Daml model (source of truth) ── daml/Syndicate/*.daml ── LF-2 DAR ── uploaded to DevNet
  Facility · LenderPosition · Cash · Settlement · CovenantMonitor · AgentAuthorization
```

---

## Component responsibilities

| Path | Responsibility |
|---|---|
| `daml/Syndicate/*.daml` | The source-of-truth model: templates, signatory/observer privacy, atomic settlement choices, the on-ledger covenant guardrail. Compiles to the LF-2 DAR deployed on DevNet. |
| `daml/Syndicate/Tests/` | Multi-party Daml Script tests — privacy partition, atomic legs, secondary-trade confidentiality/rollback, covenant block. `daml test` runs all of them. |
| `web/app/(landing) page.tsx` | Marketing front page (presentational) + the live-DevNet banner. |
| `web/app/app/page.tsx` | The deal-spine product: role-switcher, lifecycle stages, atomic-settlement UI, the "what others can see" inspector, the co-pilot rail. |
| `web/app/api/facility` | Returns the **role-scoped** `FacilityView` (`viewAs`). The partition lives here. |
| `web/app/api/settle/[kind]` | Applies a settlement — both legs or neither; throws `SettlementError` before mutating. |
| `web/app/api/copilot` | The Agent-Bank Co-Pilot: DeepSeek reasoning → typed proposal → `guardrails.ts` validation. |
| `web/app/api/devnet` | Reads the real Canton DevNet validator (OIDC → JSON Ledger API v2) for the live-proof banner. |
| `web/lib/store.ts` · `privacy.ts` · `guardrails.ts` | The sim ledger, the `viewAs(role)` partition, and the covenant guardrail. |
| `agent/` | A design-reference **stub** for a standalone co-pilot process (own party, own credentials). The live co-pilot ships inside `web/`; this documents the separate-process boundary. |
| `scripts/` | DevNet deploy + JSON Ledger API v2 seeding: `allocate-parties`, `init-ledger`, `upload-dar`, `verify-privacy`, `deploy-shared.sh`, `deploy-devnet.sh`. |

---

## The Daml domain model

The model expresses **shared-but-partitioned** state. Every template's stakeholder set is a
deliberate privacy decision, documented in a comment block above the template.

| Template (`daml/Syndicate/`) | Signatories | Observers | Purpose |
|---|---|---|---|
| `Facility` (`Facility.daml`) | borrower, agentBank | — | the shared spine; facility terms, **no per-lender data** |
| `LenderPosition` (`Lender.daml`) | that lender, agentBank | **none** | one contract per lender — **the partition** |
| `Cash` (`Cash.daml`) | issuer, owner | — | the payment leg; issuer-mediated transfers |
| `Settlement.daml` | (choices carry {signatory ∪ controller} authority) | — | `DrawdownRequest`/`RepaymentRequest` + secondary `TradeProposal → Accept → SettleTrade` |
| `CovenantMonitor` (`Covenant.daml`) | agentBank | co-pilot `agent` party | on-ledger covenant guardrail; `AssessDrawdown` aborts a breach |
| `AgentAuthorization` (`Roles.daml`) | agentBank | co-pilot `agent` party | scoped, revocable grant bounding the co-pilot |

The Daml language (templates, signatory/observer privacy, choices, Daml Script) is portable, so the
model compiles for the Canton 3.x line the live deployment targets.

---

## Privacy: signatory/observer

Privacy is modeled with signatory/observer scoping, not application logic:

- `Facility` is signed by the borrower + agent bank with **no observers** — it carries no per-lender
  breakdown, so there is nothing for a lender to over-see.
- Each `LenderPosition` is one contract whose only stakeholders are **that lender and the agent
  bank**. No other lender is a signatory or observer, so Lender A cannot fetch, query, or observe
  Lender B's position — not its amounts, not its membership.
- The agent bank co-signs every position and is therefore the one legitimate aggregator; the
  borrower's private financials are disclosed need-to-know to the agent bank / co-pilot, never to
  lenders wholesale.

The full argument (and why a public/EVM chain or bolt-on ZK/FHE can't model this cleanly) is in
[PRIVACY-MODEL.md](PRIVACY-MODEL.md). The partition is a **test target** — see
`daml/Syndicate/Tests/PrivacyTest.daml`.

---

## Atomic settlement

Atomicity is modeled by composing the cash leg and the position leg inside a **single Daml choice**:
a settlement moves both or neither. A choice carries the authority of its contract's signatories, so
the agent bank can settle against a lender's position without the lender co-signing each transaction
(the lender's consent was frozen in when the position was created). The secondary trade is
**delivery-versus-payment**: the position slice moves seller→buyer and cash moves buyer→seller in one
transaction, with price and counterparties confidential from non-parties. Rollback is a test target:
an invalid settlement `submitMustFail`s and nothing moves.

---

## The agent & the guardrail

**The ledger, not the prompt, is the authority.** The co-pilot may *propose*; three layers make sure
it can only ever execute what it's authorized to:

1. **Typed proposal.** `web/app/api/copilot/route.ts` (DeepSeek, server-side) reasons over the
   borrower's private financials need-to-know and emits a typed
   `assessment {decision, choice, args, rationale, covenantImpact}` — never free-form prose that
   mutates state. Without an API key, a scripted fallback still computes the real covenant
   projection, so the breach behaviour is identical.
2. **Guardrail validation.** `web/lib/guardrails.ts` validates the proposal: malformed → fall back to
   scripted; a choice outside the agent's authorization (mirrors `AgentAuthorization`) → force-block;
   and the leverage impact of a proposed draw is recomputed deterministically — if it breaches the
   cap, the guardrail forces `block` **even when the model said `allow`**.
3. **On-ledger enforcement.** `daml/Syndicate/Covenant.daml` `CovenantMonitor` (signatory agentBank,
   observer the co-pilot's `agent` party) carries the financial snapshot + the leverage cap and
   exposes a `nonconsuming AssessDrawdown` choice controlled by the agent: a compliant draw returns
   the projected leverage; a **breaching draw aborts the transaction**, and only the authorized agent
   party can exercise it. This is the Daml analogue of `guardrails.ts` (`projectedLeverage` /
   `LEVERAGE_CAP`), proved by `daml/Syndicate/Tests/CovenantTest.daml`.

The sim ledger (`web/lib/store.ts`) also independently rejects a breaching draw before any leg moves,
so the "both legs or neither" invariant holds regardless of the model — and the frontend swaps onto
the on-ledger choice on DevNet with the same semantics.

---

## Frontend & data layer

**The partition is enforced server-side, not styled client-side.** `web/lib/privacy.ts`
`viewAs(store, role)` returns a role-scoped `FacilityView`:

- a **lender** gets only its own slice + sealed placeholders — no `loanTape`, no `financials`;
- the **agent bank** alone gets the full loan tape + private financials;
- the **borrower** gets facility aggregates + its own financials but no per-lender identities.

So a lender's `GET /api/facility?role=…` payload contains **zero** other-lender amounts — the Daml
signatory/observer boundary, reproduced in the response shape. The "what others can see" inspector
renders this as a visibility matrix.

The data layer is deliberately interface-compatible with Canton: `store.ts` serves the same
`FacilityView` / settlement shapes the JSON Ledger API returns, so the swap to DevNet is a data-layer
change behind unchanged `web/app/api/*` and UI (`web/lib/ledger.ts` holds the JSON API base URL).

---

## Request flow

- **View a role.** `GET /api/facility?role=lenderB` → `viewAs` filters the store to Lender B's slice
  → TanStack Query renders it. Switching roles re-queries; nothing sensitive is fetched then hidden.
- **Settle.** `POST /api/settle/drawdown {role, amount}` → the store applies both legs atomically (or
  throws `SettlementError`, surfaced as "Rejected — nothing moved"). A drawdown is guarded by the
  covenant check first.
- **Ask the co-pilot.** `POST /api/copilot {stage, role, amount}` → DeepSeek → typed proposal →
  `guardrails.validate` (deterministic covenant + authorization) → the rail renders allow/block and
  gates the Authorize button.
- **Prove it's live.** `GET /api/devnet` → OIDC client-credentials token → `/v2/state/ledger-end` +
  `/v2/state/active-contracts` (8s timeout) → the banner shows the offset + on-ledger contracts, or
  self-hides on any failure.

---

## DevNet deployment runbook

Deploying to **Canton Network DevNet** (the live submission target). Verified against
docs.digitalasset.com, docs.sync.global, and the cn-quickstart repo (2026-07).

**Status (achieved, partially gated).** The LF-2 DAR is uploaded to the hackathon's shared Seaport
validator (fivenorth) and **real contracts run on-ledger** (`Facility`, `Cash`, `DrawdownRequest`),
created + queried over the JSON Ledger API v2 and surfaced live in the deployed product's "Live on
Canton DevNet" banner (`web/app/api/devnet/route.ts`). The **full 5-party seed** (3 `LenderPosition`
+ per-lender `Cash`) is blocked externally: the shared M2M ledger user is at its per-user rights cap
(`TOO_MANY_USER_RIGHTS`), so it cannot `actAs` all six demo parties at once. The seed scripts
(`scripts/deploy-shared.sh`) run to completion the moment a dedicated ledger user / org grant lands;
nothing in the code is waiting.

### Two hard prerequisites
1. **LF-2 DAR.** The model must be built with an **SDK 3.4.x** toolchain (Daml-LF **2.x**); a
   2.10.4/LF-1.x DAR is not accepted by a Canton 3.x participant. See "Toolchain & LF version".
2. **A sponsored validator node.** DevNet runs a **validator** (participant + validator app +
   Canton Coin wallet + Postgres) on a **hosted Linux VM with a stable egress IP**. A sponsoring
   **Super Validator (SV)** must **allowlist that IP** before the node can join — **2–7 day lead
   time** (allowlist resets ~quarterly). The onboarding *secret* is self-serve (1-hour TTL).
   - VM sizing: Docker Compose ≥ 2.26, ~8–16 GB RAM.
   - Canton Coin for synchronizer traffic is **auto-tapped** on DevNet — no manual purchase to
     upload a DAR / allocate parties / submit basic transactions.
   - Sources: [Validator onboarding](https://docs.sync.global/validator_operator/validator_onboarding.html),
     [Docker-compose validator](https://docs.sync.global/validator_operator/validator_compose.html),
     migration ids at [sync.global/sv-network](https://sync.global/sv-network/).

### Steps (all scripted in `scripts/deploy-devnet.sh`; run on the allowlisted VM)
1. `cp .env.example .env` and fill `SPONSOR_SV_URL`, `MIGRATION_ID`, `IMAGE_TAG`, `PARTY_HINT`,
   `LEDGER_JSON_API_URL`, `LEDGER_JWT_SECRET`, `DAR_PATH`.
2. `bash scripts/deploy-devnet.sh` — fetches the onboarding secret
   (`POST $SPONSOR_SV_URL/api/sv/v0/devnet/onboard/validator/prepare`), starts the validator
   (`./start.sh -s … -o … -p … -m <migrationId> -w`), waits for the JSON API, uploads the DAR
   (`POST /v2/packages`), then allocates parties + seeds the facility.
3. Export `DAML_PACKAGE_ID` (`daml damlc inspect-dar --json $DAR_PATH | jq -r .main_package_id`)
   before the seed step so `init-ledger.ts` targets the uploaded package.

For the **shared hackathon validator** (no self-hosting), `bash scripts/deploy-shared.sh` uploads the
DAR, allocates + grants the demo parties, seeds the facility, and runs the privacy check against the
fivenorth validator's JSON API (config in `.env`).

### JSON Ledger API v2 + auth
- Built into the Canton 3.x participant (no separate `daml json-api` process); endpoints under
  `/v2/*` (parties, packages, `commands/submit-and-wait`, `state/active-contracts`), default 7575.
- **JWT (HS256 dev tokens):** `sub` = ledger user id, `scope: daml_ledger_api` (or audience mode);
  the participant maps user → actAs/readAs parties, and the command body carries `actAs`. The
  `scripts/lib/jsonLedger.ts` client mints these (or does OIDC client-credentials on the shared
  validator). Source:
  [JWT auth (3.5)](https://docs.digitalasset.com/operate/3.5/howtos/secure/apis/jwt.html),
  [JSON Ledger API tutorial (3.5)](https://docs.digitalasset.com/build/3.5/tutorials/json-api/canton_and_the_json_ledger_api.html).

### Verification (on DevNet)
- `curl $LEDGER_JSON_API_URL/v2/packages` lists the syndicate package.
- Active contracts as AgentBank show the facility + 3 positions; a **lender token sees only its own
  position** — the privacy partition, on the real network.

### Local Canton dry-run (proven — do this before DevNet)
The whole seed + verify pipeline is validated against a **real Canton 3.x participant** locally with
`daml sandbox` (no Docker, no sponsor):
```bash
source scripts/daml-env.sh
cd daml && daml build && \
  daml sandbox --dar .daml/dist/syndicate-0.1.0.dar --json-api-port 7575 &   # JSON API v2, dev auth off
cd .. && ( cd scripts && npm install )
export LEDGER_JSON_API_URL=http://127.0.0.1:7575 LEDGER_JWT_SECRET=dev LEDGER_APP_USER=syndicate-app
export DAML_PACKAGE_ID=$(daml damlc inspect-dar --json daml/.daml/dist/syndicate-0.1.0.dar | jq -r .main_package_id)
scripts/node_modules/.bin/tsx scripts/allocate-parties.ts
scripts/node_modules/.bin/tsx scripts/init-ledger.ts
scripts/node_modules/.bin/tsx scripts/verify-privacy.ts   # asserts Lender A sees only its own slice
```
Verified result: agent bank sees `{Facility:1, LenderPosition:3, Cash:3}`; Lender A sees only
`{LenderPosition:1, Cash:1}` — the partition holds on a real ledger, not just in Daml Script.
DevNet reuses the exact same scripts against the sponsored validator's JSON API.

For the **full Canton Network stack** locally (SV, wallet, Scan, Canton Coin `tap`) use Splice
**LocalNet** / **cn-quickstart** (Docker ~8 GB) — same JSON API v2 and LF-2 DAR.
Source: [LocalNet](https://docs.sync.global/app_dev/localnet.html),
[cn-quickstart](https://github.com/digital-asset/cn-quickstart) (LocalNet-only since Jul 2025).

---

## Toolchain & LF version

- **Local dev/tests + the DevNet DAR: Daml SDK 3.4.11 → Daml-LF 2.x.** Canton 3.x (DevNet) runs LF
  2.x; a 2.10.4/LF-1.x DAR is not accepted. (Earlier phases used 2.10.4 for a fast local loop; the
  model is written in the portable subset, so the migration was a retarget plus a few API fixes.)
- JDK 17 (Temurin), user-local. `source scripts/daml-env.sh` puts both on PATH.

---

## Canton/Daml sharp edges

Recorded so the next session doesn't re-learn them:

- **`agreement` / `HasAgreement` removed in Daml 3.x.** The 2.x `HasAgreement` constraint (used on a
  test helper) does not exist under SDK 3.4.x — drop it; `queryContractId` needs only `Template t`.
- **Daml-LF major split.** No public single-page LF↔Canton matrix; LF 1.x (2.x SDKs) and LF 2.x
  (3.x SDKs) are different majors and not cross-compatible on a participant.
- **The shared M2M ledger user is rights-capped.** Granting `actAs` over all six demo parties trips
  `TOO_MANY_USER_RIGHTS`; the full multi-lender seed needs a dedicated user or org grant.
- **This validator encodes `Int`/`Numeric` as JSON strings** on the JSON Ledger API — the seed
  scripts send numeric fields as strings accordingly.
