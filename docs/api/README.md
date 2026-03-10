# Tatame Pro — API Documentation

## Overview

Tatame Pro exposes its backend logic entirely through **Supabase Edge Functions** (Deno runtime).
There is no traditional REST API server — all business logic runs as isolated serverless functions.

## Base URL

```
https://<project-ref>.supabase.co/functions/v1/<function-name>
```

In development, the Supabase CLI local URL is used:
```
http://127.0.0.1:54321/functions/v1/<function-name>
```

## Authentication

All functions (unless marked **Public**) require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <supabase_jwt_token>
```

Tokens are obtained via Supabase Auth (`supabase.auth.getSession()`).

## CORS

All functions accept cross-origin requests. CORS preflight (`OPTIONS`) is handled automatically.

Allowed headers:
```
authorization, x-client-info, apikey, content-type,
x-supabase-client-platform, x-supabase-client-platform-version,
x-supabase-client-runtime, x-supabase-client-runtime-version
```

## Function Categories

| Category | Functions | Description |
|----------|-----------|-------------|
| Authentication & Identity | 5 | User creation, password reset, identity resolution |
| Tenant Management | 5 | Onboarding, subscriptions, feature flags |
| Roles & Permissions | 5 | RBAC, impersonation |
| Athletes & Memberships | 6 | Join/leave federation, approval workflow |
| Payments & Billing | 9 | Stripe checkout, webhooks, billing control |
| Documents | 3 | Signed URL access, document verification |
| Digital Cards & Diplomas | 4 | Generation and public verification |
| Badges | 4 | Assignment, revocation, management |
| Events | 4 | Brackets, match results |
| Notifications & Email | 4 | Transactional email via Resend |
| Scheduled Jobs | 9 | Cron tasks for lifecycle management |
| Data & Compliance (LGPD) | 2 | Data export, bulk import |
| Security & Audit | 3 | RLS audit, public listings |

**Total: 63 edge functions**

## Detailed Reference

See [edge-functions.md](./edge-functions.md) for the complete function reference with request/response schemas.

## Rate Limiting

Public endpoints (Stripe checkout, password reset) are rate-limited via **Upstash Redis**:
- Pattern: sliding window counter (ZADD/ZCARD)
- **Fail-closed**: if Redis is unavailable, requests are blocked
- Limits vary by function (see individual function docs)

## Error Handling

All errors return JSON:
```json
{ "error": "Human-readable error message" }
```

Correlation IDs are logged server-side for debugging:
```
x-correlation-id: <uuid>
```

## Observability

All functions use a structured logger (`createBackendLogger`) that emits JSON logs to Supabase's logging infrastructure. Sentry integration is available via `VITE_SENTRY_ENABLED` + `VITE_SENTRY_DSN` env vars.
