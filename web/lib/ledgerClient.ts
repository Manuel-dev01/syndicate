// Server-only JSON Ledger API v2 client for REAL Daml choice exercise on a Canton participant
// (a local `daml sandbox` or the shared DevNet validator). Mirrors scripts/lib/jsonLedger.ts and
// adds the two pieces that file lacks: an ExerciseCommand builder and submit-and-wait-for-
// transaction-tree, so we can read a choice's return value and, crucially, catch its ABORT (a
// covenant breach surfaces here as a non-2xx with the Daml assertMsg). NEVER import from a client
// component — this holds the ledger token. Numbers (Decimal/Int) are JSON STRINGS on this validator.
import { createHmac } from "node:crypto";

const BASE = () => (process.env.LEDGER_JSON_API_URL ?? "").replace(/\/$/, "");
const APP_USER = () => process.env.LEDGER_APP_USER ?? "syndicate-app";

// A ledger rejection (e.g. a Daml `assertMsg` abort). `.message` is cleaned for display.
export class LedgerError extends Error {}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// ---- Auth: OIDC client-credentials (shared validator) or HS256 dev token (local sandbox) ----

let cached: { token: string; exp: number } | null = null;

async function oidcToken(signal: AbortSignal): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.LEDGER_OIDC_CLIENT_ID!,
    client_secret: process.env.LEDGER_OIDC_CLIENT_SECRET!,
    audience: process.env.LEDGER_OIDC_AUDIENCE ?? process.env.LEDGER_OIDC_CLIENT_ID!,
    scope: process.env.LEDGER_OIDC_SCOPE ?? "daml_ledger_api",
  });
  const res = await fetch(process.env.LEDGER_OIDC_TOKEN_URL!, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal,
    cache: "no-store",
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new LedgerError("OIDC token exchange failed");
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

function hs256(): string {
  const secret = process.env.LEDGER_JWT_SECRET!;
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: APP_USER(), scope: "daml_ledger_api", iat: now, exp: now + 3600 };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${input}.${b64url(createHmac("sha256", secret).update(input).digest())}`;
}

async function token(signal: AbortSignal): Promise<string> {
  return process.env.LEDGER_OIDC_CLIENT_ID ? oidcToken(signal) : hs256();
}

// ---- Template ids + command builders ----

export function templateId(moduleEntity: string): string {
  const pkg = process.env.DAML_PACKAGE_ID;
  if (!pkg) throw new LedgerError("DAML_PACKAGE_ID not set");
  return `${pkg}:${moduleEntity}`;
}

export function createCommand(tid: string, payload: Record<string, unknown>): unknown {
  return { CreateCommand: { templateId: tid, createArguments: payload } };
}

export function exerciseCommand(
  tid: string,
  contractId: string,
  choice: string,
  choiceArgument: Record<string, unknown>,
): unknown {
  return { ExerciseCommand: { templateId: tid, contractId, choice, choiceArgument } };
}

// ---- Transport ----

// Pull the cleanest human-readable cause out of a Canton error body (so a covenant breach shows its
// Daml assertMsg, not a wall of JSON).
function damlErrorMessage(text: string, status: number): string {
  try {
    const j = JSON.parse(text) as { cause?: string; message?: string; error?: string };
    const raw = j.cause ?? j.message ?? j.error ?? text;
    // Daml assertion failures read like: "... UNHANDLED_EXCEPTION ... <the assertMsg> ..."
    const m = /assertion failed[:]?\s*(.+?)(?:$|["}])/i.exec(raw) ?? /breaches[^"}]+/i.exec(raw);
    return (m ? m[0] : raw).toString().slice(0, 240);
  } catch {
    return `Ledger error ${status}: ${text.slice(0, 200)}`;
  }
}

async function ledgerFetch<T>(path: string, init: RequestInit, signal: AbortSignal): Promise<T> {
  // cache: "no-store" is REQUIRED: Next.js patches global fetch and its caching/instrumentation
  // layer drops the Authorization header on the POST to /v2/state/active-contracts, which the
  // validator then rejects as UNAUTHENTICATED ("A security-sensitive error has been received").
  // Opting out of Next's fetch cache sends the request untouched. (Plain Node fetch is unaffected.)
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    signal,
    cache: "no-store",
    headers: { authorization: `Bearer ${await token(signal)}`, ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new LedgerError(damlErrorMessage(text, res.status));
  return (text ? JSON.parse(text) : {}) as T;
}

export interface SubmitResult {
  updateId?: string;
  offset?: number;
}

/**
 * Exercise/create via submit-and-wait-for-transaction-tree, acting as `actAs`. Returns the update
 * id (a real on-ledger tx reference). Throws LedgerError on a Daml rejection (e.g. a covenant-breach
 * abort) — the caller maps that to the UI's "Rejected — nothing moved" path.
 */
export async function submitForTree(
  actAs: string[],
  commands: unknown[],
  opts: { userId?: string; readAs?: string[]; signal: AbortSignal },
): Promise<SubmitResult> {
  const tree = await ledgerFetch<Record<string, unknown>>(
    "/v2/commands/submit-and-wait-for-transaction-tree",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commands,
        // Unique per submit: a bare timestamp collides for two submits in the same millisecond and
        // Canton command-deduplication would reject the second as a duplicate.
        commandId: `syndicate-web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        actAs,
        readAs: opts.readAs ?? [],
        userId: opts.userId ?? APP_USER(),
      }),
    },
    opts.signal,
  );
  // The tree shape varies slightly by Canton build; dig defensively for the update id + offset.
  const t = (tree.transactionTree ?? tree.transaction ?? tree) as Record<string, unknown>;
  return { updateId: (t.updateId as string) ?? (tree.updateId as string), offset: t.offset as number };
}

/** Active contracts a party is a stakeholder of — the ledger enforces the partition (a lender sees
 * only its own). Returns the raw JsActiveContract entries; the view mapper decodes them. */
export async function activeContracts(party: string, signal: AbortSignal): Promise<unknown[]> {
  const end = await ledgerFetch<{ offset: number }>("/v2/state/ledger-end", {}, signal);
  const res = await ledgerFetch<unknown[]>(
    "/v2/state/active-contracts",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: { filtersByParty: { [party]: {} } },
        verbose: false,
        activeAtOffset: end.offset,
      }),
    },
    signal,
  );
  return Array.isArray(res) ? res : [];
}

/** Run a ledger interaction under an 8s budget (mirrors /api/devnet + /api/copilot). */
export async function withLedgerTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 8_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}
