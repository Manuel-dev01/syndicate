# RESEARCH-VERIFY.md

Facts to confirm against primary sources before they appear in the deck, README, or demo.
Nothing here goes into a judge-facing deliverable until verified or cut (CLAUDE.md §1.7).
Mark resolved items with the source URL and date.

## Market / domain claims
- [ ] Private-credit market size ("multi-trillion-dollar"). // VERIFY: cite a primary source
      (e.g. IMF, a named asset manager's market review) with year. Do not invent a figure.
- [ ] Typical secondary loan-trade settlement time ("weeks") and reconciliation pain.
      // VERIFY: LSTA / LMA settlement-time data or a named industry source.
- [ ] Named plausible design partner archetype (mid-market private-credit fund + agent bank).
      // VERIFY: keep it an archetype unless we have a real named partner.

## Canton / Daml technical claims
- [ ] Canton DevNet onboarding + faucet/party-allocation flow. // VERIFY: docs.global.canton.network
      / sync.global before Phase 3.
- [ ] Daml-LF compatibility of a 2.10.4-compiled DAR on Canton 3.x DevNet. // VERIFY: Phase 3,
      docs.digitalasset.com.
- [ ] Exact Canton 3.x line version running on DevNet. // VERIFY: sync.global version info.
- [ ] "Sub-transaction privacy" phrasing and the synchronizer's exact role. // VERIFY: primary
      Canton docs, so the privacy claim is precise.

## Resolved
- Daml 2.10.4 is the current 2.x LTS with a Windows installer; latest stable 3.x is 3.4.11.
  Source: github.com/digital-asset/daml/releases (2026-06-24).
