/**
 * Contract tests for validateCaptcha.
 *
 * Six runtime branches matter. Each is exercised here with a stubbed
 * globalThis.fetch so we never reach Cloudflare from CI:
 *
 *   1. TURNSTILE_SECRET_KEY unset → fail-open (dev convenience)
 *   2. Secret set, token absent → user-facing PT-BR error
 *   3. Cloudflare non-200 response → fail-closed
 *   4. Cloudflare returns { success: false } → fail-closed with codes logged
 *   5. Cloudflare returns { success: true } → pass through challenge_ts/hostname
 *   6. fetch throws (network error) → fail-closed
 *
 * Plus the small captchaErrorResponse helper.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateCaptcha, captchaErrorResponse } from "./captcha.ts";

const TURNSTILE_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// =============================================================================
// fetch stub
// =============================================================================

const origFetch = globalThis.fetch;

function stubFetch(
  handler: (input: Request | string | URL, init?: RequestInit) => Promise<Response>,
) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = handler as any;
}

function restoreFetch() {
  globalThis.fetch = origFetch;
}

function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = Deno.env.get(key);
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
  return fn().finally(() => {
    if (prev === undefined) Deno.env.delete(key);
    else Deno.env.set(key, prev);
  });
}

// =============================================================================
// Branch 1 — secret unset → allow (dev fall-through)
// =============================================================================

Deno.test("validateCaptcha: fails open when TURNSTILE_SECRET_KEY is unset", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", undefined, async () => {
    const result = await validateCaptcha("any-token", "1.2.3.4");
    assertEquals(result.success, true);
    assertEquals(result.error, undefined);
  });
});

// =============================================================================
// Branch 2 — secret set, no token
// =============================================================================

Deno.test("validateCaptcha: rejects when token is null and secret is set", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    const result = await validateCaptcha(null, "1.2.3.4");
    assertFalse(result.success);
    assert(result.error);
    assert(result.error!.includes("CAPTCHA"));
  });
});

Deno.test("validateCaptcha: rejects when token is undefined and secret is set", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    const result = await validateCaptcha(undefined, "1.2.3.4");
    assertFalse(result.success);
  });
});

Deno.test("validateCaptcha: rejects when token is empty string", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    const result = await validateCaptcha("", "1.2.3.4");
    assertFalse(result.success);
  });
});

// =============================================================================
// Branch 3 — Cloudflare returns non-2xx
// =============================================================================

Deno.test("validateCaptcha: fails closed on Cloudflare 5xx", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    stubFetch(async (input) => {
      assertEquals(String(input), TURNSTILE_URL);
      return new Response("Server error", { status: 502 });
    });
    try {
      const result = await validateCaptcha("token-x", "1.2.3.4");
      assertFalse(result.success);
      assert(result.error);
      assert(result.error!.includes("indisponível"));
    } finally {
      restoreFetch();
    }
  });
});

// =============================================================================
// Branch 4 — Cloudflare returns { success: false }
// =============================================================================

Deno.test("validateCaptcha: fails closed when Cloudflare reports invalid token", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    stubFetch(async () => {
      return new Response(
        JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    try {
      const result = await validateCaptcha("bad-token", "1.2.3.4");
      assertFalse(result.success);
      assert(result.error!.includes("falhou"));
    } finally {
      restoreFetch();
    }
  });
});

// =============================================================================
// Branch 5 — Cloudflare returns { success: true }
// =============================================================================

Deno.test("validateCaptcha: passes when Cloudflare reports success and surfaces ts+hostname", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    stubFetch(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          challenge_ts: "2026-05-14T12:00:00Z",
          hostname: "tatame.pro",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    try {
      const result = await validateCaptcha("good-token", "1.2.3.4");
      assertEquals(result.success, true);
      assertEquals(result.challengeTs, "2026-05-14T12:00:00Z");
      assertEquals(result.hostname, "tatame.pro");
      assertEquals(result.error, undefined);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("validateCaptcha: sends correct form-encoded body to Cloudflare", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    let capturedBody: string | undefined;
    let capturedContentType: string | null = null;
    stubFetch(async (_input, init) => {
      capturedBody = await new Request("http://x/", init).text();
      capturedContentType = new Headers(init?.headers).get("Content-Type");
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    try {
      await validateCaptcha("my-token", "5.6.7.8");
      assert(capturedContentType?.includes("application/x-www-form-urlencoded"));
      const params = new URLSearchParams(capturedBody);
      assertEquals(params.get("secret"), "secret-key");
      assertEquals(params.get("response"), "my-token");
      assertEquals(params.get("remoteip"), "5.6.7.8");
    } finally {
      restoreFetch();
    }
  });
});

// =============================================================================
// Branch 6 — fetch throws
// =============================================================================

Deno.test("validateCaptcha: fails closed when fetch throws (network failure)", async () => {
  await withEnv("TURNSTILE_SECRET_KEY", "secret-key", async () => {
    stubFetch(() => Promise.reject(new TypeError("network down")));
    try {
      const result = await validateCaptcha("token", "1.2.3.4");
      assertFalse(result.success);
      assert(result.error!.includes("indisponível"));
    } finally {
      restoreFetch();
    }
  });
});

// =============================================================================
// captchaErrorResponse helper
// =============================================================================

Deno.test("captchaErrorResponse: returns 400 with captchaRequired flag", async () => {
  const response = captchaErrorResponse(
    { success: false, error: "Bad token" },
    { "Access-Control-Allow-Origin": "*" },
  );
  assertEquals(response.status, 400);
  assertEquals(response.headers.get("Content-Type"), "application/json");
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await response.json();
  assertEquals(body.error, "Bad token");
  assertEquals(body.captchaRequired, true);
});

Deno.test("captchaErrorResponse: falls back to generic PT-BR message when none provided", async () => {
  const response = captchaErrorResponse({ success: false }, {});
  const body = await response.json();
  assert(body.error.includes("segurança"));
  assertEquals(body.captchaRequired, true);
});
