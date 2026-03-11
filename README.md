# Tatame Pro

Multi-tenant sports management platform for federations, leagues, and martial arts organizations. Built for Brazilian Jiu-Jitsu and combat sports ecosystems.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Payments | Stripe (checkout, subscriptions, webhooks) |
| Email | Resend (transactional) |
| CAPTCHA | Cloudflare Turnstile |
| Rate Limiting | Upstash Redis |
| Monitoring | Sentry (error tracking) |
| CI/CD | GitHub Actions |

## Architecture

```
src/
  components/     — UI components (shadcn/ui + custom)
  contexts/       — React contexts (Auth, I18n, Theme, etc.)
  domain/         — Domain logic (audit, billing)
  layouts/        — Page layouts (TenantLayout, AppShell)
  lib/            — Utilities (http, observability, safety)
  locales/        — i18n translations (pt-BR, en, es)
  pages/          — Route pages
  routes/         — Router definitions
  types/          — TypeScript types

supabase/
  functions/      — 70+ Edge Functions
  functions/_shared/  — Shared utilities (auth, CORS, logging)
  migrations/     — PostgreSQL migrations

docs/             — Architecture docs, audit, policies
e2e/              — Playwright E2E + contract tests
```

## Key Features

- **Multi-tenant** — Complete tenant isolation with RLS
- **RBAC** — Role-based access (SUPERADMIN, ADMIN_TENANT, ATLETA, etc.)
- **Membership lifecycle** — Draft → Payment → Review → Active → Expired
- **Billing state machine** — Deterministic transitions with audit trail
- **Event management** — Brackets, matches, rankings
- **Digital credentials** — Cards, diplomas with QR verification
- **LGPD compliance** — Data export, erasure, guardian consent
- **Audit trail** — Append-only, SHA-256 hashed, immutable

## Local Development

```bash
# Prerequisites: Node.js 20+, npm
git clone https://github.com/Comandos08/tatame-pro.git
cd tatame-pro

# Install dependencies
npm ci

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase project credentials

# Start dev server
npm run dev
```

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run test` | Run Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run format` | Prettier format |
| `npm run i18n:check` | Check i18n key consistency |

## Environment Variables

See [`.env.example`](.env.example) for all required variables. Key groups:

- `VITE_SUPABASE_*` — Supabase connection (frontend)
- `STRIPE_*` — Payment processing (edge functions)
- `TURNSTILE_*` — CAPTCHA protection
- `UPSTASH_*` — Rate limiting
- `RESEND_*` — Email delivery
- `ALLOWED_ORIGIN` — CORS restriction
- `VITE_SENTRY_DSN` — Error tracking

## Governance

The codebase follows institutional governance rules (G1-G8) enforced by CI:

- **G1** — No `any` in domain code
- **G3** — Consistent error handling via institutional envelope
- **G7** — Structured logging (no `console.log` in production)
- **SAFE GOLD** — Deterministic, immutable audit system

## Deployment

Configured for Vercel deployment via GitHub Actions CD pipeline. See `.github/workflows/cd.yml`.

## Documentation

- [Production Audit](docs/PRODUCTION-AUDIT-2026-03-11.md)
- [Data Retention Policy](docs/DATA-RETENTION-POLICY.md)
- [SLA](docs/SLA.md)
- [Engineering Guardrails](docs/ENGINEERING_GUARDRAILS.md)
- [Contributing](CONTRIBUTING.md)

## License

Proprietary. All rights reserved.
