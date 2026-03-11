import http from 'k6/http';
import { check, sleep } from 'k6';

const APP_URL = __ENV.K6_APP_URL || 'http://localhost:5173';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

const pages = ['/', '/login', '/about', '/help', '/privacy'];

export default function () {
  const page = pages[Math.floor(Math.random() * pages.length)];

  const res = http.get(`${APP_URL}${page}`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has HTML content': (r) => r.body.includes('<!DOCTYPE') || r.body.includes('<html'),
    'response time < 3s': (r) => r.timings.duration < 3000,
  });

  sleep(Math.random() * 3 + 1); // 1-4s think time
}
