# Architecture

> Design rationale and the Canton/Daml decisions behind Syndicate.

## Repository layout

```
syndicate/
├── daml/
│   ├── daml.yaml                 # Daml project (source ".")
│   └── Syndicate/
│       ├── Roles.daml            # parties + AgentAuthorization (agent's scoped grant)
│       ├── Facility.daml         # shared spine (borrower + agentBank); NO per-lender data
│       ├── Lender.daml           # LenderPosition: one per lender — THE privacy partition
│       ├── Cash.daml             # payment leg (issuer-backed cash holding)
│       ├── Settlement.daml       # atomic drawdown / repayment orchestration
│       ├── Covenant.daml         # covenant monitoring for the Agent-Bank Co-Pilot
│       └── Tests/                # multi-party privacy + atomic-settlement Daml Script tests
├── agent/                        # Node/TS Agent-Bank Co-Pilot (separate process, own party)
├── web/                          # Next.js institutional dashboard + role-switcher
├── scripts/                      # ledger init, party allocation, DevNet deploy
└── docs/                         # this file + PRIVACY-MODEL
```

Test scripts are co-located at `daml/Syndicate/Tests/` because a Daml project has a single source
root; `daml test` runs every `Script` in the project.

## Daml on Canton

- The Daml language (templates, signatory/observer privacy, choices, Daml Script) is portable, so
  the model compiles for the Canton 3.x line that the live DevNet deployment targets.
- **Privacy** is modeled with signatory/observer scoping: the `Facility` is the shared spine
  (borrower + agentBank, no observers) and each `LenderPosition` is one contract visible only to
  its lender and the agent bank — see [PRIVACY-MODEL.md](PRIVACY-MODEL.md).
- **Atomicity** is modeled by composing the cash leg and the position leg inside a single
  Daml choice: a settlement either moves both or neither. A choice carries the authority of its
  contract's signatories, so the agent bank can settle against a lender's position without the
  lender co-signing each transaction.
- `// VERIFY:` Daml-LF compatibility for the DAR on Canton 3.x DevNet — confirm against
  docs.digitalasset.com and docs.global.canton.network.

## DevNet deployment runbook

Deploying to **Canton Network DevNet** (the live submission target). Verified against
docs.digitalasset.com, docs.sync.global, and the cn-quickstart repo (2026-07).

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

### JSON Ledger API v2 + auth
- Built into the Canton 3.x participant (no separate `daml json-api` process); endpoints under
  `/v2/*` (parties, packages, `commands/submit-and-wait`, `state/active-contracts`), default 7575.
- **JWT (HS256 dev tokens):** `sub` = ledger user id, `scope: daml_ledger_api` (or audience mode);
  the participant maps user → actAs/readAs parties, and the command body carries `actAs`. The
  `scripts/lib/jsonLedger.ts` client mints these. Source:
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

## Toolchain & LF version

- **Local dev/tests + the DevNet DAR: Daml SDK 3.4.x → Daml-LF 2.x.** Canton 3.x (DevNet) runs LF
  2.x; a 2.10.4/LF-1.x DAR is not accepted. (Earlier phases used 2.10.4 for a fast local loop; the
  model is written in the portable subset, so the migration is a retarget plus a few API fixes.)
- JDK 17 (Temurin), user-local. `source scripts/daml-env.sh`.

## Canton/Daml sharp edges (append as found)

- **`agreement` / `HasAgreement` removed in Daml 3.x.** The 2.x `HasAgreement` constraint (used on a
  test helper) does not exist under SDK 3.4.x — drop it; `queryContractId` needs only `Template t`.
- **Daml-LF major split.** No public single-page LF↔Canton matrix; LF 1.x (2.x SDKs) and LF 2.x
  (3.x SDKs) are different majors and not cross-compatible on a participant.
