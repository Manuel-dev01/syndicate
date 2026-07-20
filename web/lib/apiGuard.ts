// Server-only request guard for the write/LLM API routes. A public demo URL must stay drivable by
// anyone (judges), but must NOT let the open internet spam real DevNet writes or burn the DeepSeek
// key. Three layers, all fail-safe:
//   1. Optional shared secret (APP_WRITE_SECRET) — when set, requires an x-syndicate-key header. Left
//      unset for the public demo (the browser has no secret); set it to lock a private deployment.
//   2. Same-origin — browsers send Origin on POST; a cross-origin caller is refused (blocks scripted
//      abuse from other sites). Extra origins allowed via APP_ALLOWED_ORIGINS (comma-separated).
//   3. Per-IP sliding-window rate limit — caps floods and cost/quota exhaustion.
// The rate-limit state is per-instance (in-memory) — a deliberate no-external-infra baseline; it
// bounds abuse per serverless instance without a Redis/KV dependency.

export interface GuardResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function underLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map can't grow unbounded across many IPs.
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return true;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Guard a write/LLM route. `bucket` scopes the rate limit (e.g. "settle" vs "copilot"); `limit` is
 * the max requests per IP per minute for that bucket.
 */
export function guard(req: Request, bucket: string, limit: number): GuardResult {
  // 1. Optional shared secret (only enforced when configured).
  const secret = process.env.APP_WRITE_SECRET;
  if (secret && req.headers.get("x-syndicate-key") !== secret) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  // 2. Same-origin (allow requests with no Origin — e.g. server-to-server — and configured origins).
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host");
    const allowed = (process.env.APP_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* malformed Origin — treat as mismatch */
    }
    const sameOrigin = !!originHost && originHost === host;
    if (!sameOrigin && !allowed.includes(origin) && !allowed.includes(originHost)) {
      return { ok: false, status: 403, error: "cross-origin request refused" };
    }
  }

  // 3. Per-IP rate limit.
  if (!underLimit(`${bucket}:${clientIp(req)}`, limit)) {
    return { ok: false, status: 429, error: "rate limit exceeded — slow down and retry shortly" };
  }

  return { ok: true };
}
