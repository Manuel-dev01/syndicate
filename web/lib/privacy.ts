// The privacy partition, enforced server-side. This mirrors the Daml signatory/observer model:
//   - A lender is neither signatory nor observer of another lender's position → a lender-role
//     payload carries ONLY that lender's slice + sealed placeholders. No other-lender amounts, no
//     borrower financials, ever cross the boundary.
//   - The agent bank is a signatory on every LenderPosition + reads the borrower's covenant data
//     need-to-know → it alone gets the full loan tape and the private financials.
//   - The borrower is a Facility signatory but not a LenderPosition stakeholder → it sees facility
//     terms + its own financials, but never who holds what.
import type { BorrowerFinancials, FacilityView, LenderPosition, Role, SealedLender } from "./ledger-model";
import type { LedgerStore, LenderSlot } from "./store";

export function viewAs(s: LedgerStore, role: Role): FacilityView {
  if (role === "agentBank") {
    return {
      role,
      viewerLabel: "Agent Bank",
      canSettle: true,
      facility: s.facility,
      position: aggregate(s.lenders, "Facility · all lenders"),
      covenants: s.covenants,
      sealedLenders: [], // sees everyone — nothing sealed
      lifecycle: s.lifecycle,
      history: mergedLog(s.lenders),
      loanTape: s.lenders.map((l) => l.position), // EVERY slice
      financials: s.financials, // need-to-know
    };
  }

  if (role === "borrower") {
    return {
      role,
      viewerLabel: "Borrower · Meridian Logistics",
      canSettle: false, // the borrower requests; the agent bank authorizes
      facility: s.facility,
      position: aggregate(s.lenders, "Facility"),
      covenants: s.covenants,
      // the borrower cannot see who holds what — every member is a sealed placeholder
      sealedLenders: s.lenders.map((_, i) => ({ index: i, sealed: true }) as SealedLender),
      lifecycle: s.lifecycle,
      history: s.facilityLog, // facility-level cash the borrower is party to
      financials: s.financials, // the borrower's own numbers
      // NO loanTape — no per-lender breakdown
    };
  }

  // lender role — only its own slice + opaque placeholders for the others
  const slot = s.lenders.find((l) => l.role === role) ?? s.lenders[0];
  const others = s.lenders.filter((l) => l !== slot);
  return {
    role,
    viewerLabel: slot.position.lender,
    canSettle: true,
    facility: s.facility,
    position: slot.position, // ONLY the viewer's slice
    covenants: s.covenants,
    sealedLenders: others.map((_, i) => ({ index: i + 1, sealed: true }) as SealedLender),
    lifecycle: s.lifecycle,
    history: slot.history,
    // NO loanTape, NO financials — the partition
  };
}

// Need-to-know: the agent bank / co-pilot party reads the borrower's private financials. This is
// NEVER part of a lender view — it is only handed to the agent reasoning route.
export function privateBorrowerData(s: LedgerStore): BorrowerFinancials {
  return s.financials;
}

function aggregate(lenders: LenderSlot[], label: string): LenderPosition {
  const commitment = lenders.reduce((a, l) => a + l.position.commitment, 0);
  const drawn = lenders.reduce((a, l) => a + l.position.drawn, 0);
  const accruedInterest = lenders.reduce((a, l) => a + l.position.accruedInterest, 0);
  return { lender: label, holdPct: 100, commitment, drawn, accruedInterest };
}

// The agent bank sees every lender's settlements — merge them, most recent first, labelled by lender.
function mergedLog(lenders: LenderSlot[]) {
  return lenders
    .flatMap((l) => l.history.map((r) => ({ ...r, label: `${l.position.lender} · ${r.label}` })))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10);
}
