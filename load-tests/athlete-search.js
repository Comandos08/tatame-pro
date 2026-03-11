import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.K6_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || '';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

const searchTerms = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira'];

export default function () {
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  // Athlete search by name (ilike query)
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/athletes?select=id,full_name,email&full_name=ilike.*${term}*&limit=50`,
    { headers },
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 3s': (r) => r.timings.duration < 3000,
    'returns array': (r) => {
      try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
    },
  });

  sleep(Math.random() * 2 + 1);
}
