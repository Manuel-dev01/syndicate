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

## Canton/Daml sharp edges (append as found)

_(none yet)_
