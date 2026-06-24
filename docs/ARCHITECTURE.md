# Architecture

> Living document. When we hit a Canton/Daml sharp edge, it gets written here so the next
> session doesn't re-learn it (CLAUDE.md §7).

## Repository layout

```
syndicate/
├── daml/
│   ├── daml.yaml                 # Daml project (sdk 2.10.4, source ".")
│   └── Syndicate/
│       ├── Roles.daml            # parties + AgentAuthorization (agent's scoped grant)
│       ├── Facility.daml         # shared spine (borrower + agentBank); NO per-lender data
│       ├── Lender.daml           # LenderPosition: one per lender — THE privacy partition
│       ├── Cash.daml             # payment leg            (Phase 2 — stub)
│       ├── Settlement.daml       # atomic DvP choices     (Phase 2/3 — stub)
│       ├── Covenant.daml         # covenant monitoring    (Phase 4 — stub)
│       └── Tests/
│           └── PrivacyTest.daml  # multi-party privacy-partition assertions
├── agent/                        # Node/TS Agent-Bank Co-Pilot (separate process, own party)
├── web/                          # Next.js institutional dashboard + role-switcher
├── scripts/                      # ledger init, party allocation, DevNet deploy
└── docs/                         # this file + PRIVACY-MODEL + DEMO-SCRIPT
```

### Deviation from CLAUDE.md §3 (test location)
CLAUDE.md §3 sketches a top-level `daml-tests/` sibling of `daml/`. A single Daml 2.x project
has **one** source root, so test scripts are co-located at `daml/Syndicate/Tests/` instead and
build with the project. `daml test` runs every `Script` in the project. Functionally identical;
keeps the build clean. Noted here so the layout doesn't read as a mistake.

## Toolchain & versions

- **Daml SDK 2.10.4 (LTS)** for local dev/test. Chosen over the 3.x line because the 3.x
  toolchain deprecates the classic `daml` assistant and steers to a separate Canton Network
  Quickstart, making the local `daml build`/`daml test` loop fragile to stand up. The Daml
  *language* is portable across 2.x/3.x, so the source re-compiles under a 3.x SDK. See the
  CLAUDE.md §2 decision note.
- **JDK 17** (Eclipse Temurin) — Daml/Canton needs Java 11+.
- Install reference (Windows, this machine — both **no-admin / user-local**):
  - **JDK:** the winget MSI failed headlessly (errors 1618 then 1602 — it needs a UAC
    elevation prompt). Worked around by downloading the **Temurin 17 ZIP** and extracting to
    `~/toolchain/jdk-17.0.19+10` (no admin). `JAVA_HOME` points there.
  - **Daml SDK:** the `daml-sdk-2.10.4-windows.tar.gz` release tarball
    (github.com/digital-asset/daml/releases/tag/v2.10.4), extracted to `~/toolchain/sdk-2.10.4`
    and installed with its bundled `install.sh`, which placed the assistant under
    `%APPDATA%\daml` (the real binary is `…/daml/sdk/2.10.4/daml/daml.exe`; the PATH wrapper is
    `…/daml/bin/daml.cmd`).
  - **Convenience:** `source scripts/daml-env.sh` puts both on PATH for a shell.
- **Verified:** `daml build` → `syndicate-0.1.0.dar`; `daml test` → `testPrivacyPartition: ok`
  (4 active contracts, 4 transactions). Daml 2.10.4, JDK 17.0.19.

## DevNet promotion (Phase 3)

`// VERIFY:` Daml-LF compatibility when moving the 2.10.4-compiled DAR onto Canton 3.x DevNet.
Expectation: a mechanical re-`daml build` under a 3.x SDK targeting the matching LF version.
Confirm against docs.digitalasset.com and docs.global.canton.network when we reach Phase 3.

## Canton/Daml sharp edges (append as found)

_(none yet)_
