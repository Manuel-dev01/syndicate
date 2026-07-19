// The env gate for REAL Canton ledger mode. Strictly opt-in: unless LEDGER_MODE=real AND the
// minimum config is present, the app stays on the in-memory sim (the deployed demo's safe floor).
// Every route falls back to the sim on any real-mode failure, so this only ever adds capability.
import type { Role } from "./ledger-model";

const PARTY_ENV: Record<Role, string> = {
  borrower: "LEDGER_PARTY_BORROWER",
  agentBank: "LEDGER_PARTY_AGENTBANK",
  lenderA: "LEDGER_PARTY_LENDERA",
  lenderB: "LEDGER_PARTY_LENDERB",
  lenderC: "LEDGER_PARTY_LENDERC",
};

/** The on-ledger party id for a role (undefined if not configured). */
export function partyOf(role: Role): string | undefined {
  return process.env[PARTY_ENV[role]];
}

/** The co-pilot's own party (controller of CovenantMonitor.AssessDrawdown). */
export function agentParty(): string | undefined {
  return process.env.LEDGER_PARTY_AGENT;
}

export const facilityId = () => process.env.LEDGER_FACILITY_ID ?? "MER-2031-B";

/** True only when real-ledger mode is explicitly enabled and the baseline config exists. */
export function isRealLedger(): boolean {
  return (
    process.env.LEDGER_MODE === "real" &&
    !!process.env.LEDGER_JSON_API_URL &&
    !!process.env.DAML_PACKAGE_ID &&
    !!partyOf("agentBank")
  );
}
