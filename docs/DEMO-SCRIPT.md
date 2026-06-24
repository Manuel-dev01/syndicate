# Demo Script — 3 minutes

> Stub — built out as the product lands. Every beat must serve one of the four judging criteria:
> technical execution, originality, UX/design, real-world applicability.

## Shot list (target)

1. **The problem (0:00–0:25).** Private credit is multi-trillion-dollar and still run on
   spreadsheets, email, and manual agent banks. Competing lenders share one facility but can't see
   each other; secondary trades settle in weeks with reconciliation breaks. _Real-world
   applicability + originality._

2. **Form the syndicate, prove privacy (0:25–1:10).** One live deployment. Use the role-switcher:
   Agent Bank sees the whole facility; switch to Lender A — its own slice only; switch to Lender B
   — a different slice, and **Lender A's view had zero trace of B**. Open the "what others can
   see" inspector to prove the partition. _UX/design — the money shot._

3. **Drawdown settles atomically (1:10–1:45).** Borrower draws; each lender funds pro-rata; cash
   and positions update **together, live, in one transaction**. No intermediate inconsistent
   state. _Technical execution._

4. **The agent catches a covenant breach (1:45–2:20).** A drawdown that *would* breach the
   leverage covenant; the Co-Pilot flags it with reasoning over private borrower data and
   blocks/escalates — and visibly cannot execute beyond its on-ledger authorization. _Originality
   + technical execution._

5. **Confidential secondary trade (2:20–2:45).** Lender A sells a slice to Lender B; position and
   cash settle atomically; price and counterparties stay hidden from everyone else. _Originality._

6. **Close (2:45–3:00).** Design partner (a mid-market private-credit fund + its agent bank), the
   quantified pain, live on Canton DevNet. _Real-world applicability._
