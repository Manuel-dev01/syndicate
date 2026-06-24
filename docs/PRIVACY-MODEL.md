# The Privacy Model — why this is a Canton-native product

> Stub — written out fully in Phase 6. This captures the spine of the argument now so the
> design stays honest as we build.

## The guarantee

In a syndicated facility, competing lenders co-invest in one deal but must never see each
other's positions, and the borrower's financials are shared strictly need-to-know. Syndicate
enforces this **at the ledger**, not in application code:

- **`Facility`** (the shared spine) is signed by the borrower and agent bank only. It carries
  facility-level terms and **no per-lender breakdown**.
- **`LenderPosition`** is **one contract per lender**, signed by that lender and the agent bank,
  with **no other lender as signatory or observer**. A lender's only on-ledger window is its own
  position. Lenders never co-observe a shared contract, so **Lender A has zero trace of Lender B**
  — not its amounts, not even its membership.
- The **agent bank** co-signs every position and is therefore the one legitimate aggregator.
- Settlement choices move the **cash leg and the position leg in a single Daml transaction** —
  never two commits — so no observer ever sees an inconsistent intermediate state.

This is asserted as a test, not assumed: see `daml/Syndicate/Tests/PrivacyTest.daml`.

## Why not a public/EVM chain or bolt-on cryptography

- **Public/shared-state chains** replicate state to all validators; per-party need-to-know over a
  *shared* deal isn't the native model. You end up encrypting blobs and rebuilding access control
  off-chain — losing the atomic-settlement guarantee you came for.
- **ZK / FHE** can hide values but don't cleanly express *who is a stakeholder of which
  sub-transaction* across mutually-distrusting parties. Canton's signatory/observer model and
  sub-transaction privacy express exactly that, and compose atomically.

_(Expand with concrete leak scenarios and the synchronizer's role in Phase 6.)_
