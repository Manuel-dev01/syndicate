// Client-safe fetchers + query keys for TanStack Query. Imports TYPES only (no server modules),
// so this is safe to use from client components.
import type { FacilityView, SettlementKind, SettlementRecord } from "./ledger-model";

export type { FacilityView, SettlementKind, SettlementRecord } from "./ledger-model";

export const qk = {
  facility: ["facility"] as const,
  copilot: (stage: string) => ["copilot", stage] as const,
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function fetchFacility(): Promise<FacilityView> {
  return jsonOrThrow<FacilityView>(await fetch("/api/facility", { cache: "no-store" }));
}

export interface SettleResult {
  position: FacilityView["position"];
  record: SettlementRecord;
}

export async function settle(
  kind: SettlementKind,
  args: Record<string, number> = {},
): Promise<SettleResult> {
  return jsonOrThrow<SettleResult>(
    await fetch(`/api/settle/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    }),
  );
}

export interface CopilotProposal {
  tag: string;
  tone: "watch" | "info" | "propose";
  body: string;
  proposal?: string;
  source: "deepseek" | "scripted";
}

export async function fetchCopilot(stage: string): Promise<CopilotProposal> {
  return jsonOrThrow<CopilotProposal>(
    await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage }),
    }),
  );
}
