/**
 * Contract tests for SecureRateLimiter + helpers.
 *
 * This is the only thing standing between us and brute-force / abuse on
 * 25+ privileged Edge Function endpoints (login, password reset, role
 * grant/revoke, impersonation, billing checkout, …). A regression has
 * two failure modes:
 *
 *   - fail-open when fail-closed was requested (Redis outage silently
 *     becomes "limit removed" — attacker drives credential stuffing or
 *     spams the email sender), or
 *   - fail-closed when fail-open was requested (the public verify-document
 *     endpoint blocks legit credential checks during a Redis blip).
 *
 * We pin: every branch of `.check()` (Redis unconfigured, Redis HTTP
 * error, Redis throws, count <= limit, count > limit), the
 * fail-closed/fail-open switch on each, the composite key construction,
 * the standard rate-limit headers, the 429 envelope, and the request-side
 * helpers (getClientIP, buildRateLimitContext).
 *
 * No real Redis is touched — `globalThis.fetch` is stubbed for every test
 * and the `UPSTASH_REDIS_REST_*` env vars are scoped per case.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SecureRateLimiter,
  SecureRateLimitPresets,
  RATE_LIMIT_PRESETS,
  getClientIP,
  buildRateLimitContext,
  type SecureRateLimitConfig,
  type RateLimitContext,
} from "./secure-rate-limiter.ts";

// =============================================================================
// Env + fetch scaffolding
// =============================================================================

const REDIS_URL = "https://example.upstash.io";
const REDIS_TOKEN = "test-redis-token";

const origFetch = globalThis.fetch;

function stubFetch(
  handler: (
    input: Request | string | URL,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = handler as any;
}

function restoreFetch() {
  globalThis.fetch = origFetch;
}

function withEnv<T>(
  values: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    prev[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

function baseConfig(
  overrides: Partial<SecureRateLimitConfig> = {},
): SecureRateLimitConfig {
  return {
    operation: "test-op",
    limit: 5,
    windowSeconds: 60,
    ...overrides,
  };
}

function ctx(overrides: Partial<RateLimitContext> = {}): RateLimitContext {
  return {
    userId: "user-1",
    tenantId: "tenant-1",
    ipAddress: "1.2.3.4",
    userAgent: "test-agent",
    ...overrides,
  };
}

// =============================================================================
// Redis unconfigured — env vars missing
// =============================================================================

Deno.test("SecureRateLimiter: Redis unconfigured + failClosed (default) → blocks", async () => {
  // Default fail-closed is THE invariant — never silently disable rate
  // limiting when Redis is down/misconfigured.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
    async () => {
      const limiter = new SecureRateLimiter(baseConfig());
      const result = await limiter.check(ctx());
      assertFalse(result.allowed);
      assertEquals(result.remaining, 0);
      assertEquals(result.count, -1);
      assertEquals(result.fallback, true);
      assertEquals(result.error, "Rate limiter unavailable");
    },
  );
});

Deno.test("SecureRateLimiter: Redis unconfigured + failClosed=false → allows (verify-document path)", async () => {
  // The public verify-document endpoint deliberately opts INTO fail-open
  // so a Redis blip doesn't take down credential verification for end
  // users. Pin the bypass works.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
    async () => {
      const limiter = new SecureRateLimiter(baseConfig({ failClosed: false }));
      const result = await limiter.check(ctx());
      assert(result.allowed);
      assertEquals(result.remaining, 5); // full quota returned
      assertEquals(result.fallback, true);
    },
  );
});

Deno.test("SecureRateLimiter: Redis URL set but token missing → still treated as unconfigured", async () => {
  // Defensive: both halves must be present. Half-configured is
  // misconfigured — treat as unavailable.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: "" },
    async () => {
      const limiter = new SecureRateLimiter(baseConfig());
      const result = await limiter.check(ctx());
      assertFalse(result.allowed);
      assertEquals(result.fallback, true);
    },
  );
});

// =============================================================================
// Redis HTTP error responses
// =============================================================================

Deno.test("SecureRateLimiter: Redis returns 5xx + failClosed → blocks", async () => {
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() =>
        Promise.resolve(
          new Response("internal error", { status: 500 }),
        ),
      );
      try {
        const limiter = new SecureRateLimiter(baseConfig());
        const result = await limiter.check(ctx());
        assertFalse(result.allowed);
        assertEquals(result.error, "Rate limiter error");
        assertEquals(result.fallback, true);
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: Redis returns 5xx + failClosed=false → allows", async () => {
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() =>
        Promise.resolve(new Response("error", { status: 503 })),
      );
      try {
        const limiter = new SecureRateLimiter(baseConfig({ failClosed: false }));
        const result = await limiter.check(ctx());
        assert(result.allowed);
        assertEquals(result.fallback, true);
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: fetch throws + failClosed → blocks", async () => {
  // Network-level failure (DNS error, connection refused, abort signal,
  // etc.) — the try/catch in .check() must convert it into the same
  // fail-closed shape as a returned HTTP error.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
      try {
        const limiter = new SecureRateLimiter(baseConfig());
        const result = await limiter.check(ctx());
        assertFalse(result.allowed);
        assert(result.error?.includes("ECONNREFUSED"));
        assertEquals(result.fallback, true);
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: fetch throws + failClosed=false → allows", async () => {
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() => Promise.reject(new Error("boom")));
      try {
        const limiter = new SecureRateLimiter(baseConfig({ failClosed: false }));
        const result = await limiter.check(ctx());
        assert(result.allowed);
        assertEquals(result.fallback, true);
      } finally {
        restoreFetch();
      }
    },
  );
});

// =============================================================================
// Successful Redis interactions — under/over limit
// =============================================================================

function pipelineResponse(count: number): Response {
  // Mirrors the Upstash REST pipeline response: an array of {result}
  // objects in the same order as the request pipeline. Index 2 is the
  // ZCARD result the limiter reads.
  return new Response(
    JSON.stringify([
      { result: 0 },
      { result: 1 },
      { result: count },
      { result: 1 },
    ]),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("SecureRateLimiter: count < limit → allowed with remaining", async () => {
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() => Promise.resolve(pipelineResponse(2)));
      try {
        const limiter = new SecureRateLimiter(baseConfig({ limit: 5 }));
        const result = await limiter.check(ctx());
        assert(result.allowed);
        assertEquals(result.count, 2);
        assertEquals(result.remaining, 3);
        assertEquals(result.fallback, undefined);
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: count === limit → still allowed (boundary, inclusive)", async () => {
  // The boundary is `count <= limit` — the Nth request fits in the
  // window. Pin the inclusive comparison so an "off by one" refactor
  // doesn't shift everyone's quota by 1.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() => Promise.resolve(pipelineResponse(5)));
      try {
        const limiter = new SecureRateLimiter(baseConfig({ limit: 5 }));
        const result = await limiter.check(ctx());
        assert(result.allowed);
        assertEquals(result.count, 5);
        assertEquals(result.remaining, 0);
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: count > limit → blocked", async () => {
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() => Promise.resolve(pipelineResponse(6)));
      try {
        const limiter = new SecureRateLimiter(baseConfig({ limit: 5 }));
        const result = await limiter.check(ctx());
        assertFalse(result.allowed);
        assertEquals(result.count, 6);
        assertEquals(result.remaining, 0);
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: ZCARD result missing → treated as count 0", async () => {
  // Defensive: a malformed Upstash response (no `result` field, or
  // empty array) must not throw — the limiter coerces to 0 and allows.
  // We pin the soft fall-through so a Upstash API change doesn't
  // crash every privileged endpoint.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch(() =>
        Promise.resolve(
          new Response(JSON.stringify([{}, {}, {}, {}]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      try {
        const limiter = new SecureRateLimiter(baseConfig({ limit: 5 }));
        const result = await limiter.check(ctx());
        assert(result.allowed);
        assertEquals(result.count, 0);
        assertEquals(result.remaining, 5);
      } finally {
        restoreFetch();
      }
    },
  );
});

// =============================================================================
// Composite key construction (passes through to Upstash via the request body)
// =============================================================================

Deno.test("SecureRateLimiter: key includes operation + tenant + user + ip", async () => {
  // The composite key is what makes the limiter per-user-per-tenant-per-IP
  // rather than global. A regression that drops, say, the tenant prefix
  // would silently share quotas across tenants. We capture the body of
  // the Redis call and verify the key shape.
  let capturedBody: string | undefined;
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch((_input, init) => {
        capturedBody = init?.body as string;
        return Promise.resolve(pipelineResponse(1));
      });
      try {
        const limiter = new SecureRateLimiter(baseConfig({ operation: "grant" }));
        await limiter.check({
          userId: "u-9",
          tenantId: "t-7",
          ipAddress: "9.9.9.9",
        });
        const pipeline = JSON.parse(capturedBody ?? "[]");
        // The first command's second arg is the key — every command in the
        // pipeline references the same composite key.
        const key = pipeline[0][1] as string;
        assert(key.includes("ratelimit"));
        assert(key.includes("grant"));
        assert(key.includes("t:t-7"));
        assert(key.includes("u:u-9"));
        assert(key.includes("ip:9.9.9.9"));
      } finally {
        restoreFetch();
      }
    },
  );
});

Deno.test("SecureRateLimiter: key omits tenant/user when not provided", async () => {
  // Anonymous-IP throttling path (e.g. login pre-auth, verify-document).
  // Key should still be unique per IP + operation.
  let capturedBody: string | undefined;
  await withEnv(
    { UPSTASH_REDIS_REST_URL: REDIS_URL, UPSTASH_REDIS_REST_TOKEN: REDIS_TOKEN },
    async () => {
      stubFetch((_input, init) => {
        capturedBody = init?.body as string;
        return Promise.resolve(pipelineResponse(0));
      });
      try {
        const limiter = new SecureRateLimiter(baseConfig({ operation: "login" }));
        await limiter.check({ ipAddress: "9.9.9.9" });
        const pipeline = JSON.parse(capturedBody ?? "[]");
        const key = pipeline[0][1] as string;
        assert(key.includes("login"));
        assert(key.includes("ip:9.9.9.9"));
        assertFalse(key.includes("t:"));
        assertFalse(key.includes("u:"));
      } finally {
        restoreFetch();
      }
    },
  );
});

// =============================================================================
// Standard headers + 429 envelope
// =============================================================================

Deno.test("getHeaders: emits X-RateLimit-* triplet", () => {
  const limiter = new SecureRateLimiter(baseConfig({ limit: 10 }));
  const headers = limiter.getHeaders({
    allowed: true,
    remaining: 7,
    reset: 2_000_000_000_000,
    count: 3,
  });
  assertEquals(headers["X-RateLimit-Limit"], "10");
  assertEquals(headers["X-RateLimit-Remaining"], "7");
  // reset is unix seconds, not millis
  assertEquals(headers["X-RateLimit-Reset"], "2000000000");
});

Deno.test("tooManyRequestsResponse: returns 429 envelope with Retry-After + rate-limit headers", async () => {
  const limiter = new SecureRateLimiter(baseConfig({ limit: 10 }));
  const reset = Date.now() + 30_000; // 30s in the future
  const res = limiter.tooManyRequestsResponse(
    { allowed: false, remaining: 0, reset, count: 11 },
    { "Access-Control-Allow-Origin": "*" },
    "corr-abc",
  );
  assertEquals(res.status, 429);
  // Retry-After is a non-negative integer seconds
  const retryAfter = Number(res.headers.get("Retry-After"));
  assert(retryAfter >= 0 && retryAfter <= 31);
  // CORS header passes through
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  // Rate-limit headers present
  assertEquals(res.headers.get("X-RateLimit-Limit"), "10");
  // Body is the standard error envelope
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, "RATE_LIMITED");
});

// =============================================================================
// Presets sanity — all of them return a SecureRateLimiter
// =============================================================================

Deno.test("SecureRateLimitPresets: every preset constructs a SecureRateLimiter", () => {
  // Regression guard against accidentally dropping or renaming a preset:
  // 27 Edge Functions reference these by name; the named imports would
  // silently resolve to `undefined` and the first call would throw.
  const names = Object.keys(SecureRateLimitPresets) as Array<
    keyof typeof SecureRateLimitPresets
  >;
  // Sanity floor — there are 27 presets at the time this test is pinned;
  // adding more is fine, removing one is a contract break unless every
  // caller is also migrated.
  assert(names.length >= 27, `expected >= 27 presets, got ${names.length}`);
  for (const name of names) {
    const factory = SecureRateLimitPresets[name];
    const instance = factory();
    assert(
      instance instanceof SecureRateLimiter,
      `${String(name)} must return a SecureRateLimiter`,
    );
  }
});

Deno.test("RATE_LIMIT_PRESETS: backwards-compatible alias points at SecureRateLimitPresets", () => {
  // Eight Edge Functions import the old name. The alias is the only
  // thing keeping their rate limiting wired — if a refactor breaks the
  // identity, those endpoints silently lose throttling.
  assertEquals(RATE_LIMIT_PRESETS, SecureRateLimitPresets);
});

Deno.test("SecureRateLimitPresets.verifyDocument: opts INTO fail-open", async () => {
  // The only fail-open preset in the entire set. Pin the config so a
  // future refactor doesn't accidentally flip every other endpoint to
  // fail-open by changing the default.
  await withEnv(
    { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
    async () => {
      const limiter = SecureRateLimitPresets.verifyDocument();
      const result = await limiter.check({ ipAddress: "1.1.1.1" });
      assert(result.allowed, "verifyDocument must fail-open on Redis unavail");
    },
  );
});

// =============================================================================
// IP extraction precedence
// =============================================================================

function req(headers: Record<string, string>): Request {
  return new Request("https://example.test/", { headers });
}

Deno.test("getClientIP: cf-connecting-ip wins over everything", () => {
  const r = req({
    "cf-connecting-ip": "1.1.1.1",
    "x-real-ip": "2.2.2.2",
    "x-forwarded-for": "3.3.3.3, 4.4.4.4",
  });
  assertEquals(getClientIP(r), "1.1.1.1");
});

Deno.test("getClientIP: x-real-ip used when cf-connecting-ip missing", () => {
  const r = req({
    "x-real-ip": "2.2.2.2",
    "x-forwarded-for": "3.3.3.3, 4.4.4.4",
  });
  assertEquals(getClientIP(r), "2.2.2.2");
});

Deno.test("getClientIP: x-forwarded-for first hop wins when others missing", () => {
  // The IP-spoof-resistance invariant is that we pick the LEFTMOST hop —
  // that's the client IP as seen by the first proxy. Right-most is the
  // proxy itself.
  const r = req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4, 5.5.5.5" });
  assertEquals(getClientIP(r), "3.3.3.3");
});

Deno.test("getClientIP: returns 'unknown' when no header is present", () => {
  assertEquals(getClientIP(req({})), "unknown");
});

Deno.test("getClientIP: trims whitespace around x-forwarded-for hop", () => {
  // Some load balancers emit ", " separators with trailing whitespace.
  const r = req({ "x-forwarded-for": "  3.3.3.3  , 4.4.4.4" });
  assertEquals(getClientIP(r), "3.3.3.3");
});

// =============================================================================
// buildRateLimitContext — request → RateLimitContext
// =============================================================================

Deno.test("buildRateLimitContext: derives ipAddress + userAgent from headers", () => {
  const r = req({
    "cf-connecting-ip": "9.9.9.9",
    "user-agent": "MyAgent/1.0",
  });
  const c = buildRateLimitContext(r, "user-7", "tenant-3");
  assertEquals(c.userId, "user-7");
  assertEquals(c.tenantId, "tenant-3");
  assertEquals(c.ipAddress, "9.9.9.9");
  assertEquals(c.userAgent, "MyAgent/1.0");
});

Deno.test("buildRateLimitContext: null userId/tenantId pass through", () => {
  const c = buildRateLimitContext(req({ "cf-connecting-ip": "1.1.1.1" }), null, null);
  assertEquals(c.userId, null);
  assertEquals(c.tenantId, null);
  assertEquals(c.ipAddress, "1.1.1.1");
});

Deno.test("buildRateLimitContext: defaults to 'unknown' user-agent when header missing", () => {
  const c = buildRateLimitContext(req({ "cf-connecting-ip": "1.1.1.1" }));
  assertEquals(c.userAgent, "unknown");
});
