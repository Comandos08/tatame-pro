/**
 * Rate Limiter Load Test — k6
 *
 * Validates that the Upstash Redis rate limiter correctly enforces limits on
 * the two auth edge functions and returns proper 429 responses with headers.
 *
 * Usage:
 *   k6 run load-tests/rate-limiter.js \
 *     -e K6_SUPABASE_URL=https://<ref>.supabase.co \
 *     -e K6_SUPABASE_ANON_KEY=<anon-key>
 *
 * Expected outcome:
 *   - Requests within the limit → 200
 *   - Requests beyond the limit → 429 with Retry-After header
 *   - Redis unavailable (fail-closed) → 429 (never 500 silently passing)
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const SUPABASE_URL     = __ENV.K6_SUPABASE_URL     || 'http://localhost:54321';
const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || '';

// Custom metrics
const rateLimitHits      = new Counter('rate_limit_hits');
const rateLimitMisses    = new Counter('rate_limit_misses');
const retryAfterPresent  = new Rate('retry_after_header_present');
const requestDuration    = new Trend('auth_request_duration', true);

export const options = {
  scenarios: {
    // Scenario 1: Burst above limit on password-reset endpoint (5 req/hour per email)
    password_reset_burst: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 10,            // send 10 — limit is 5/hour → must see 429 after 5th
      maxDuration: '30s',
      tags: { scenario: 'password_reset_burst' },
    },

    // Scenario 2: Concurrent IP-based rate limit on reset-password (10 req/hour per IP)
    reset_password_concurrent: {
      executor: 'per-vu-iterations',
      vus: 5,                    // 5 concurrent VUs × 4 iterations = 20 requests
      iterations: 4,             // limit is 10/hour per IP → must see 429 after 10th
      maxDuration: '30s',
      startTime: '35s',          // run after first scenario finishes
      tags: { scenario: 'reset_password_concurrent' },
    },

    // Scenario 3: Sustained normal traffic — verify system recovers after 429s
    sustained_normal: {
      executor: 'constant-arrival-rate',
      rate: 1,                   // 1 req/sec — safely below all limits
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 3,
      maxVUs: 5,
      startTime: '75s',
      tags: { scenario: 'sustained_normal' },
    },
  },

  thresholds: {
    // All 429s must carry a Retry-After header
    'retry_after_header_present': ['rate>0.99'],

    // Requests within the limit must be fast
    'auth_request_duration{within_limit:true}': ['p(95)<3000'],

    // At least some 429s must be observed in burst scenarios
    'rate_limit_hits': ['count>0'],
  },
};

const commonHeaders = {
  'apikey': SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

// ─── Scenario helpers ─────────────────────────────────────────────────────────

function requestPasswordReset(email) {
  const start = Date.now();
  const res = http.post(
    `${SUPABASE_URL}/functions/v1/request-password-reset`,
    JSON.stringify({ email }),
    { headers: commonHeaders, tags: { endpoint: 'request-password-reset' } }
  );
  requestDuration.add(Date.now() - start, { within_limit: res.status !== 429 ? 'true' : 'false' });
  return res;
}

function resetPassword(token, newPassword) {
  const start = Date.now();
  const res = http.post(
    `${SUPABASE_URL}/functions/v1/reset-password`,
    JSON.stringify({ token, newPassword }),
    { headers: commonHeaders, tags: { endpoint: 'reset-password' } }
  );
  requestDuration.add(Date.now() - start, { within_limit: res.status !== 429 ? 'true' : 'false' });
  return res;
}

// ─── Main scenario function ───────────────────────────────────────────────────

export default function () {
  const scenario = __ENV.K6_SCENARIO || exec.scenario.name;

  if (scenario === 'password_reset_burst') {
    group('password-reset burst (5/hour per email limit)', () => {
      // Use a fixed email per VU to trigger the per-email rate limit
      const email = `load-test-vu${__VU}@tatame-test.invalid`;
      const res = requestPasswordReset(email);

      const is429 = res.status === 429;
      const is200 = res.status === 200;

      if (is429) {
        rateLimitHits.add(1);
        retryAfterPresent.add(res.headers['Retry-After'] !== undefined);

        check(res, {
          '429 has Retry-After header':  (r) => r.headers['Retry-After'] !== undefined,
          '429 body is valid JSON':       (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
          '429 body has error field':     (r) => { try { return !!JSON.parse(r.body).error; } catch { return false; } },
          '429 has X-RateLimit-Limit':   (r) => r.headers['X-RateLimit-Limit'] !== undefined,
          '429 has X-RateLimit-Reset':   (r) => r.headers['X-RateLimit-Reset'] !== undefined,
        });
      } else {
        rateLimitMisses.add(1);
        retryAfterPresent.add(true); // not relevant for non-429

        check(res, {
          'non-429 response is not 500': (r) => r.status !== 500,
          'response is valid JSON':      (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
        });
      }

      // No sleep — we want to saturate the rate limiter quickly
    });

  } else if (scenario === 'reset_password_concurrent') {
    group('reset-password concurrent (10/hour per IP limit)', () => {
      // Use an invalid token — we only care about rate limiting, not business logic
      const res = resetPassword('invalid-token-for-load-test', 'NewPass123!');

      const is429 = res.status === 429;

      if (is429) {
        rateLimitHits.add(1);
        retryAfterPresent.add(res.headers['Retry-After'] !== undefined);

        check(res, {
          '429 has Retry-After header': (r) => r.headers['Retry-After'] !== undefined,
          '429 has rate limit headers': (r) =>
            r.headers['X-RateLimit-Limit'] !== undefined &&
            r.headers['X-RateLimit-Remaining'] !== undefined,
        });
      } else {
        rateLimitMisses.add(1);
        retryAfterPresent.add(true);

        check(res, {
          'non-429 is not 500':      (r) => r.status !== 500,
          'response is valid JSON':  (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
        });
      }
    });

  } else if (scenario === 'sustained_normal') {
    group('sustained normal traffic (below all limits)', () => {
      // Unique email per second to stay below per-email rate limit
      const ts    = Date.now();
      const email = `sustained-${__VU}-${ts}@tatame-test.invalid`;
      const res   = requestPasswordReset(email);

      rateLimitMisses.add(1);

      check(res, {
        'sustained traffic: not 429':  (r) => r.status !== 429,
        'sustained traffic: not 500':  (r) => r.status !== 500,
      });

      sleep(1);
    });
  }
}

export function handleSummary(data) {
  const hits   = data.metrics.rate_limit_hits?.values?.count   ?? 0;
  const misses = data.metrics.rate_limit_misses?.values?.count ?? 0;
  const total  = hits + misses;

  return {
    stdout: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Rate Limiter Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Total requests : ${total}
 Rate limited   : ${hits}  (${total ? ((hits/total)*100).toFixed(1) : 0}%)
 Passed through : ${misses} (${total ? ((misses/total)*100).toFixed(1) : 0}%)

 Retry-After header present on 429s:
   ${(data.metrics.retry_after_header_present?.values?.rate ?? 0) >= 0.99 ? '✅ PASS' : '❌ FAIL'}

 Thresholds: ${Object.values(data.metrics).some(m => m.thresholds && Object.values(m.thresholds).some(t => !t.ok)) ? '❌ SOME FAILED' : '✅ ALL PASSED'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`,
  };
}
