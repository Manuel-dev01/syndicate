/**
 * jsonLedger.ts — a tiny client for the Canton 3.x JSON Ledger API v2.
 *
 * Targets the hackathon's shared Canton DevNet validator (Seaport / fivenorth), which authenticates
 * with an OIDC client-credentials (M2M) token, and also works against a local `daml sandbox`
 * (HS256 dev token) as a fallback. Wraps the handful of calls Syndicate needs: allocate party,
 * grant the ledger user actAs rights, upload a DAR, submit a command, read active contracts.
 *
 * Docs: https://docs.digitalasset.com/build/3.5/tutorials/json-api/canton_and_the_json_ledger_api.html
 * No hardcoded hosts or secrets — everything comes from the environment (see .env.example).
 */
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = () => required("LEDGER_JSON_API_URL").replace(/\/$/, "");
const APP_USER = () => process.env.LEDGER_APP_USER ?? "syndicate-app";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// ---- Auth: OIDC client-credentials (shared validator) or HS256 dev token (local sandbox) ----

let cached: { token: string; exp: number } | null = null;

async function fetchOidcToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: required("LEDGER_OIDC_CLIENT_ID"),
    client_secret: required("LEDGER_OIDC_CLIENT_SECRET"),
    audience: process.env.LEDGER_OIDC_AUDIENCE ?? required("LEDGER_OIDC_CLIENT_ID"),
    scope: process.env.LEDGER_OIDC_SCOPE ?? "daml_ledger_api",
  });
  const res = await fetch(required("LEDGER_OIDC_TOKEN_URL"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  // Redact the IdP response body (may echo client/config detail) — surface only the error code.
  if (!res.ok || !body.access_token) throw new Error(`OIDC token exchange failed${body.error ? ` (${body.error})` : ""}`);
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

function mintHs256(): string {
  const secret = required("LEDGER_JWT_SECRET");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: APP_USER(), scope: "daml_ledger_api", iat: now, exp: now + 3600 };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${input}.${b64url(createHmac("sha256", secret).update(input).digest())}`;
}

/** Bearer token for the Ledger API — OIDC when configured, else a local HS256 dev token. */
export async function getToken(): Promise<string> {
  return process.env.LEDGER_OIDC_CLIENT_ID ? fetchOidcToken() : mintHs256();
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await getToken()}`, ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---- Ledger operations ----

/** Allocate a party; returns the full `hint::fingerprint` id. Idempotent: if the hint is already
 * allocated on this node, resolves and returns the existing id instead of failing (safe re-runs). */
export async function allocateParty(partyIdHint: string): Promise<string> {
  try {
    const out = await api<{ partyDetails: { party: string } }>("/v2/parties", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partyIdHint, identityProviderId: "" }),
    });
    return out.partyDetails.party;
  } catch (e) {
    if (e instanceof Error && /already exists|already allocated/i.test(e.message)) {
      const existing = await findParty(partyIdHint);
      if (existing) return existing;
    }
    throw e;
  }
}

/** Find an already-allocated party whose id starts with `hint::`. */
async function findParty(hint: string): Promise<string | undefined> {
  const out = await api<{ partyDetails?: { party: string }[] }>("/v2/parties");
  return (out.partyDetails ?? []).map((d) => d.party).find((p) => p.startsWith(`${hint}::`));
}

/** Grant the ledger user CanActAs a party, so its token can act/read as that party. */
export async function grantActAs(userId: string, party: string): Promise<void> {
  await api(`/v2/users/${encodeURIComponent(userId)}/rights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, identityProviderId: "", rights: [{ kind: { CanActAs: { value: { party } } } }] }),
  });
}

/** Upload a DAR (vetting happens as part of upload). */
export async function uploadDar(darPath: string): Promise<void> {
  const dar = await readFile(darPath);
  await api("/v2/packages", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: dar,
  });
}

/** Submit-and-wait for a set of JSON API v2 Command objects, acting as `actAs`. */
export async function submitAndWait(
  actAs: string[],
  commands: unknown[],
  opts: { userId?: string; readAs?: string[] } = {},
): Promise<{ updateId?: string; completionOffset?: number }> {
  return api("/v2/commands/submit-and-wait", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commands,
      commandId: `syndicate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      actAs,
      readAs: opts.readAs ?? [],
      userId: opts.userId ?? APP_USER(),
    }),
  });
}

/** A JSON API v2 CreateCommand. Note: this validator encodes Int and Numeric fields as STRINGS. */
export function createCommand(templateId: string, payload: Record<string, unknown>): unknown {
  return { CreateCommand: { templateId, createArguments: payload } };
}

/** A JSON API v2 ExerciseCommand. Decimals/Ints in `choiceArgument` are STRINGS on this validator. */
export function exerciseCommand(
  templateId: string,
  contractId: string,
  choice: string,
  choiceArgument: Record<string, unknown>,
): unknown {
  return { ExerciseCommand: { templateId, contractId, choice, choiceArgument } };
}

/** Submit and wait for the transaction TREE — needed to read a choice's return value, and it throws
 * (via api()) with the Daml error text on a rejection (e.g. a covenant-breach `assertMsg` abort). */
export async function submitAndWaitForTree(
  actAs: string[],
  commands: unknown[],
  opts: { userId?: string; readAs?: string[] } = {},
): Promise<Record<string, unknown>> {
  return api("/v2/commands/submit-and-wait-for-transaction-tree", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commands,
      commandId: `syndicate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      actAs,
      readAs: opts.readAs ?? [],
      userId: opts.userId ?? APP_USER(),
    }),
  });
}

/** Read active contracts a party is a stakeholder of (privacy proof: a lender sees only its own). */
export async function activeContracts(party: string): Promise<unknown[]> {
  const end = await api<{ offset: number }>("/v2/state/ledger-end");
  const res = await api<unknown[]>("/v2/state/active-contracts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filter: { filtersByParty: { [party]: {} } },
      verbose: false,
      activeAtOffset: end.offset,
    }),
  });
  return Array.isArray(res) ? res : [];
}
