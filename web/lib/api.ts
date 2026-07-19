// Client-safe fetchers + query keys for TanStack Query. Imports TYPES only (no server modules),
// so this is safe to use from client components.
import type { FacilityView, Role, SettlementKind, SettlementRecord } from "./ledger-model";
import type { ValidatedDecision } from "./guardrails";

export type { FacilityView, Role, SettlementKind, SettlementRecord } from "./ledger-model";
export { ROLES, parseRole } from "./ledger-model";
export type { ValidatedDecision } from "./guardrails";

export const qk = {
  facility: (role: Role) => ["facility", role] as const,
  copilot: (stage: string, role: Role, amount?: number) => ["copilot", stage, role, amount ?? 0] as const,
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function fetchFacility(role: Role): Promise<FacilityView> {
  return jsonOrThrow<FacilityView>(await fetch(`/api/facility?role=${role}`, { cache: "no-store" }));
}

export interface SettleResult {
  view: FacilityView;
  record: SettlementRecord;
}

export async function settle(
  kind: SettlementKind,
  role: Role,
  args: Record<string, number> = {},
): Promise<SettleResult> {
  return jsonOrThrow<SettleResult>(
    await fetch(`/api/settle/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...args, role }),
    }),
  );
}

export interface CopilotProposal {
  tag: string;
  tone: "watch" | "info" | "propose" | "block";
  body: string;
  proposal?: string;
  assessment?: ValidatedDecision;
  source: "deepseek" | "scripted" | "on-ledger";
}

export async function fetchCopilot(stage: string, role: Role, amount?: number): Promise<CopilotProposal> {
  return jsonOrThrow<CopilotProposal>(
    await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, role, amount }),
    }),
  );
}
