// The privacy partition, enforced server-side. A lender view returns the viewer's OWN position,
// the facility-level public terms, the covenant ratios, and SEALED placeholders for every other
// lender — never their amounts. This mirrors the Daml signatory/observer model: Lender A is
// neither signatory nor observer of Lender B's position, so B's numbers never cross the boundary.
import type { BorrowerFinancials, FacilityView, SealedLender } from "./ledger-model";
import type { LedgerStore } from "./store";

export function viewAsLender(s: LedgerStore): FacilityView {
  const sealedLenders: SealedLender[] = [];
  // facility.lenderCount total members; the viewer is one, the rest are sealed.
  for (let i = 1; i < s.facility.lenderCount; i++) {
    sealedLenders.push({ index: i, sealed: true });
  }
  return {
    facility: s.facility,
    position: s.position, // only the viewer's slice
    covenants: s.covenants,
    sealedLenders,
    lifecycle: s.lifecycle,
    history: s.history,
  };
}

// Need-to-know: the agent bank / co-pilot party reads the borrower's private financials. This is
// NEVER part of a lender view — it is only handed to the agent reasoning route.
export function privateBorrowerData(s: LedgerStore): BorrowerFinancials {
  return s.financials;
}
