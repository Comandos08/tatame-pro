import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.K6_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || '';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '2m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  // Step 1: List public memberships/events (read-heavy)
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  // Query public events (simulates membership page load)
  const eventsRes = http.get(
    `${SUPABASE_URL}/rest/v1/events?select=id,name,start_date&limit=20&order=start_date.desc`,
    { headers: { ...headers, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
  );

  check(eventsRes, {
    'events status 200': (r) => r.status === 200,
    'events response < 5s': (r) => r.timings.duration < 5000,
  });

  sleep(2);

  // Step 2: Health check (simulates checkout pre-flight)
  const healthRes = http.get(`${SUPABASE_URL}/functions/v1/health-check`, { headers });

  check(healthRes, {
    'health check OK': (r) => r.status === 200,
  });

  sleep(1);
}
