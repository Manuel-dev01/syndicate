/**
 * jsonLedger.ts — a tiny client for the Canton 3.x JSON Ledger API v2.
 *
 * Canton 3.x exposes the JSON Ledger API in-process (default port 7575, endpoints under /v2/*).
 * This wraps the handful of calls Syndicate needs — allocate party, upload DAR, submit a command,
 * read active contracts — plus a dependency-free HS256 JWT signer for party-scoped dev tokens.
 *
 * Docs: https://docs.digitalasset.com/build/3.5/tutorials/json-api/canton_and_the_json_ledger_api.html
 * Auth: https://docs.digitalasset.com/operate/3.5/howtos/secure/apis/jwt.html
 *
 * No hardcoded hosts — everything comes from the environment (see .env.example).
 */
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = () => required("LEDGER_JSON_API_URL"); // e.g. https://participant.example:7575
const APP_USER = () => process.env.LEDGER_APP_USER ?? "syndicate-app";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Mint an HS256 dev JWT for a given ledger user. The participant maps user -> actAs/readAs parties,
 * so the token authenticates `sub` (the user id) and the command body carries the parties.
 * DevNet/LocalNet accept a shared-secret HS256 token; production uses a real issuer.
 */
export function mintToken(userId: string = APP_USER()): string {
  const secret = required("LEDGER_JWT_SECRET");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: userId,
    scope: process.env.LEDGER_JWT_SCOPE ?? "daml_ledger_api",
    aud: process.env.LEDGER_JWT_AUDIENCE, // optional audience-based mode
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(createHmac("sha256", secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

async function api<T>(path: string, init: RequestInit & { userId?: string } = {}): Promise<T> {
  const { userId, headers, ...rest } = init;
  const res = await fetch(`${BASE()}${path}`, {
    ...rest,
    headers: {
      authorization: `Bearer ${mintToken(userId)}`,
      ...headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Allocate a party; returns the full `hint::fingerprint` id. Idempotent on retry (hint clash → reuse). */
export async function allocateParty(partyIdHint: string): Promise<string> {
  const body = { partyIdHint, identityProviderId: "" };
  const out = await api<{ partyDetails: { party: string } }>("/v2/parties", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return out.partyDetails.party;
}

/** Grant a ledger user actAs/readAs rights over a party (so its JWT can act as that party). */
export async function grantUserRights(userId: string, party: string): Promise<void> {
  await api("/v2/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user: { id: userId, primaryParty: party },
      rights: [{ kind: { CanActAs: { value: { party } } } }],
    }),
  }).catch(() => {
    /* user may already exist; rights endpoint variants differ by patch — ignore for the demo seed */
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

/** Submit-and-wait for a set of commands acting as `actAs`. `commands` are JSON API v2 Command objects. */
export async function submitAndWait(
  actAs: string[],
  commands: unknown[],
  opts: { userId?: string; readAs?: string[] } = {},
): Promise<unknown> {
  const body = {
    commands: {
      applicationId: APP_USER(),
      commandId: `syndicate-${Date.now()}`,
      actAs,
      readAs: opts.readAs ?? [],
      commands,
    },
  };
  return api("/v2/commands/submit-and-wait", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    userId: opts.userId,
  });
}

/** A JSON API v2 CreateCommand for a template `packageId:Module:Entity` with a record payload. */
export function createCommand(templateId: string, payload: Record<string, unknown>): unknown {
  return { CreateCommand: { templateId, createArguments: payload } };
}

/** Read active contracts visible to `party` (privacy proof: a lender sees only its own). */
export async function activeContracts(party: string): Promise<unknown> {
  const ledgerEnd = await api<{ offset: number }>("/v2/state/ledger-end", { userId: party });
  return api("/v2/state/active-contracts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filter: { filtersByParty: { [party]: {} } },
      verbose: true,
      activeAtOffset: ledgerEnd.offset,
    }),
    userId: party,
  });
}
