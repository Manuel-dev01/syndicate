import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/devnet — proves the app is live on Canton DevNet by reading the REAL shared validator's
// JSON Ledger API v2 (server-side; the OIDC secret never reaches the browser). Returns the current
// ledger offset and the Syndicate contracts on-ledger for our agent-bank party. If the env isn't
// configured (e.g. a preview without the secret), returns { ok: false } and the UI hides the panel.

interface DevnetContract {
  template: string;
  contractId: string;
}

let cached: { token: string; exp: number } | null = null;

async function oidcToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;
  const url = process.env.DEVNET_OIDC_TOKEN_URL!;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.DEVNET_OIDC_CLIENT_ID!,
    client_secret: process.env.DEVNET_OIDC_CLIENT_SECRET!,
    audience: process.env.DEVNET_OIDC_AUDIENCE ?? process.env.DEVNET_OIDC_CLIENT_ID!,
    scope: process.env.DEVNET_OIDC_SCOPE ?? "daml_ledger_api",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new Error("OIDC token exchange failed");
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function GET() {
  const base = process.env.DEVNET_LEDGER_URL?.replace(/\/$/, "");
  const party = process.env.DEVNET_AGENT_PARTY;
  if (!base || !party || !process.env.DEVNET_OIDC_CLIENT_SECRET) {
    return NextResponse.json({ ok: false });
  }
  try {
    const token = await oidcToken();
    const auth = { authorization: `Bearer ${token}` };
    const end = (await (await fetch(`${base}/v2/state/ledger-end`, { headers: auth })).json()) as {
      offset: number;
    };
    const acs = (await (
      await fetch(`${base}/v2/state/active-contracts`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          filter: { filtersByParty: { [party]: {} } },
          verbose: false,
          activeAtOffset: end.offset,
        }),
      })
    ).json()) as unknown[];

    const contracts: DevnetContract[] = [];
    for (const item of Array.isArray(acs) ? acs : []) {
      const ce = (item as { contractEntry?: { JsActiveContract?: { createdEvent?: { templateId?: string; contractId?: string } } } })
        ?.contractEntry?.JsActiveContract?.createdEvent;
      if (ce?.templateId && ce.contractId) {
        contracts.push({ template: ce.templateId.split(":").slice(-1)[0], contractId: ce.contractId });
      }
    }

    return NextResponse.json({
      ok: true,
      network: "Canton DevNet",
      endpoint: base,
      offset: end.offset,
      count: contracts.length,
      contracts,
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
