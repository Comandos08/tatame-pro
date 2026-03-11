import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.K6_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || '';

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up
    { duration: '1m', target: 10 },   // Steady state
    { duration: '30s', target: 50 },  // Spike
    { duration: '1m', target: 50 },   // Sustained spike
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    http_req_failed: ['rate<0.05'],     // Less than 5% failure rate
  },
};

export default function () {
  const res = http.get(`${SUPABASE_URL}/functions/v1/health-check`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has ok field': (r) => {
      try { return JSON.parse(r.body).ok !== undefined; } catch { return false; }
    },
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
