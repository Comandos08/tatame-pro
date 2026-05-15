# 🚀 Production Launch Runbook — Tatame Pro

> **Purpose:** Step-by-step manual configuration to ship Tatame Pro to production.
> **Audience:** Repo owner / ops lead.
> **Companion to:** `RELEASE-READINESS-P0.md` (code gates), `PRODUCTION-AUDIT-2026-03-12.md` (technical audit).
>
> Everything in this document is **external configuration** — it cannot be done from the codebase. Work top-to-bottom and tick each box before launch.

---

## 0. Pre-flight

- [ ] Repo on `main` branch, CI green, no uncommitted work.
- [ ] Latest production audit reviewed (`docs/PRODUCTION-AUDIT-2026-03-12.md`).
- [ ] Two-person rule: at least one teammate available during the cutover window.

---

## 1. DNS & Domain

Target: `tatame.pro` resolves to Vercel and email sends from your domain.

### 1.1 Apex + www
1. In your registrar (Registro.br / GoDaddy / Cloudflare), point `tatame.pro` and `www.tatame.pro` to Vercel:
   - Vercel Dashboard → Project → **Domains** → Add `tatame.pro` and `www.tatame.pro`.
   - Copy the DNS records Vercel asks for (usually an `A` record `76.76.21.21` for apex and `CNAME cname.vercel-dns.com` for www).
2. Wait for SSL to provision (Vercel does Let's Encrypt automatically, usually <5min).
3. Test: `curl -I https://tatame.pro` should return `HTTP/2 200` with `strict-transport-security` header.

### 1.2 Email deliverability (Resend)
Without SPF/DKIM/DMARC, transactional emails (membership approvals, password resets, billing alerts) will land in spam.

1. Resend Dashboard → **Domains** → Add `tatame.pro`.
2. Copy the records Resend generates and add them in your DNS:
   - `TXT @` for SPF (`v=spf1 include:_spf.resend.com -all`)
   - 3× `CNAME` for DKIM (`resend._domainkey`, etc.)
   - `TXT _dmarc` (`v=DMARC1; p=quarantine; rua=mailto:dmarc@tatame.pro`)
3. In Resend, click **Verify** and wait for green checkmarks (5–60min depending on DNS TTL).
4. Test send from Resend dashboard to a Gmail address and confirm it lands in the inbox.

**Acceptance:** `mail-tester.com` score ≥ 9/10.

---

## 2. Vercel — frontend environment variables

Vercel Dashboard → Project → **Settings → Environment Variables** → **Production** scope only (unless marked Preview/Dev too).

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Production Supabase project |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key | Safe to expose — JWT-signed |
| `VITE_SUPABASE_PROJECT_ID` | project ref slug | e.g. `kotxhtveuegrywzyvdnl` |
| `VITE_APP_URL` | `https://tatame.pro` | Used by share/QR links |
| `VITE_APP_VERSION` | release tag (e.g. `1.0.0`) | Used by Sentry as release name — bump per release |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | Production Stripe publishable key |
| `VITE_TURNSTILE_SITE_KEY` | site key | From Cloudflare Turnstile (§5) |
| `VITE_SENTRY_DSN` | DSN URL | From Sentry project (§4) |
| `VITE_SENTRY_ENABLED` | `true` | Gates Sentry init |

**Sentry source map upload** (Production scope, also needed in `cd.yml`):
| Name | Value |
|---|---|
| `SENTRY_AUTH_TOKEN` | from Sentry → Account → Auth Tokens (scope: `project:releases`) |
| `SENTRY_ORG` | your Sentry org slug |
| `SENTRY_PROJECT` | your Sentry project slug |

If you skip these three, Sentry still works — stack traces will just stay minified.

**Acceptance:** `npm run build:verify` locally (with the same env vars) passes.

---

## 3. GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions**.

| Name | Value | Used by |
|---|---|---|
| `VERCEL_TOKEN` | from Vercel → Settings → Tokens | `cd.yml` |
| `VERCEL_ORG_ID` | from `vercel link` or Project → Settings | `cd.yml` |
| `VERCEL_PROJECT_ID` | from Project → Settings → General | `cd.yml` |
| `VERCEL_DEPLOY_ENABLED` | `true` | Gate variable for `cd.yml` |
| `VITE_SUPABASE_URL` | same as Vercel | `ci.yml` E2E + build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same as Vercel | `ci.yml` |
| `VITE_SUPABASE_PROJECT_ID` | same as Vercel | `ci.yml` |
| `VITE_APP_URL` | `https://tatame.pro` | `ci.yml` |
| `SENTRY_AUTH_TOKEN` | same as Vercel | `cd.yml` source map upload |
| `SENTRY_ORG` | same as Vercel | `cd.yml` |
| `SENTRY_PROJECT` | same as Vercel | `cd.yml` |

---

## 4. Sentry (error tracking)

1. Sentry.io → **Create Project** → React → name it `tatame-pro-web`.
2. Copy DSN → put in `VITE_SENTRY_DSN` (Vercel).
3. **Account → Auth Tokens** → new token with scopes `project:read`, `project:releases`, `org:read`. Copy → `SENTRY_AUTH_TOKEN`.
4. Note the org slug and project slug from the URL (`/organizations/{org}/projects/{project}/`).
5. Set alert rules:
   - Issue is created and `level:error` → email + Slack
   - Issue is unhandled and seen 10× in 5min → page on-call

**Acceptance:** trigger a fake error from the app, verify it lands in Sentry with a symbolicated stack trace and the correct `release` tag.

---

## 5. Cloudflare Turnstile (CAPTCHA)

1. Cloudflare Dashboard → **Turnstile** → Add Site.
   - Name: `tatame-pro-prod`
   - Domain: `tatame.pro`, `www.tatame.pro`
   - Widget mode: Managed
2. Copy site key → `VITE_TURNSTILE_SITE_KEY` (Vercel).
3. Copy secret key → `TURNSTILE_SECRET_KEY` (Supabase Edge Function secret — §7).

> ⚠️ `src/lib/security/captcha.ts` is fail-closed. Without these keys, the public checkout will reject every request.

---

## 6. Upstash Redis (rate limiting)

1. Upstash console → **Create Database** → Redis.
   - Region: closest to your Supabase region (likely `us-east-1` if you're on Supabase Pro default).
   - TLS: enabled.
   - Eviction: noeviction (rate limiter must be reliable).
2. Copy the REST URL → `UPSTASH_REDIS_REST_URL`.
3. Copy the REST token → `UPSTASH_REDIS_REST_TOKEN`.

> ⚠️ Rate limiter is fail-closed for critical paths (login, reset-password, checkout). Outage = those endpoints block. Set up an Upstash uptime alert.

---

## 7. Supabase — Edge Functions secrets

Supabase Dashboard → Project → **Settings → Edge Functions → Secrets**.

| Name | Value | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` | Live mode |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | From §8 |
| `UPSTASH_REDIS_REST_URL` | from §6 | |
| `UPSTASH_REDIS_REST_TOKEN` | from §6 | |
| `RESEND_API_KEY` | `re_…` | Resend → API Keys → new key, restrict to `tatame.pro` |
| `TURNSTILE_SECRET_KEY` | from §5 | |
| `ALLOWED_ORIGIN` | `https://tatame.pro` | Tightens CORS in `_shared/cors.ts` |
| `PUBLIC_APP_URL` | `https://tatame.pro` | Used in card/diploma QR URLs |
| `CRON_SECRET` | `openssl rand -hex 32` | Shared with pg_cron — see §9 |
| `INTERNAL_ALERT_SECRET` | `openssl rand -hex 32` | Internal alert endpoint guard |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook | Channel `#alerts-tatame` |
| `ALERT_EMAIL_ENABLED` | `true` | |
| `ADMIN_ALERT_EMAIL` | `ops@tatame.pro` | Receiver of critical alerts |
| `SEED_TEST_USER_ENABLED` | `false` | **CRITICAL**: never `true` in prod |
| `SEED_TEST_USER_SECRET` | leave unset / random | Defense in depth |
| `SUPABASE_ADMIN_EMAIL` | your owner email | Already set by Supabase |
| `ENABLE_STRIPE_PREFLIGHT` | `true` | Validates Stripe creds at boot |

After saving, redeploy a function (`supabase functions deploy health-check`) to make sure the values are picked up.

---

## 8. Stripe — live mode + webhook

1. Stripe Dashboard → toggle to **Live mode**.
2. **Products** → recreate / promote your tenant subscription products from test to live (Stripe doesn't migrate products between modes).
3. **Customers → Customer Portal** → Configure billing portal:
   - Allow customers to update payment methods, cancel subscriptions, view invoices.
   - Branding: tatame.pro logo + colors.
4. **Developers → Webhooks** → Add endpoint:
   - URL: `https://<project>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`.
   - Copy the signing secret (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` in §7.
5. Detailed walkthrough: see `docs/runbooks/stripe-webhook-setup.md`.

**Acceptance:** create a $0 test product, run a checkout in production, confirm the webhook is delivered and `webhook_events` row appears in Supabase.

---

## 9. Database — final checks

### 9.1 RLS spot check
Run in Supabase SQL editor:
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;
```
Every row should have `rowsecurity = true`. If anything shows `false`, freeze the launch and investigate.

### 9.2 pg_cron jobs
```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```
You should see all 10 jobs from migration `20260317000010_setup_pg_cron_schedulers.sql`, all `active = true`. Confirm the vault secret `cron_secret` exists:
```sql
SELECT name FROM vault.decrypted_secrets WHERE name = 'cron_secret';
```

If `cron_secret` is missing or different from `CRON_SECRET` set in §7, the scheduled jobs will 401 every night.

### 9.3 Storage buckets
Dashboard → **Storage** → confirm 4 buckets exist:
- `documents` (private)
- `branding` (public)
- `cards` (public)
- `events` (public)

For each, click **Policies** and confirm at least one INSERT/SELECT/DELETE policy is attached. The public buckets must still gate writes behind `tenant_id` checks.

### 9.4 PITR backup
Supabase Dashboard → **Database → Backups** → confirm:
- Daily backups: enabled, retention ≥ 7 days
- PITR: enabled (Pro: 7d / Team: 14d / Enterprise: 30d)

Run a dry restore in a staging project at least once before GA — runbook in `docs/runbooks/restore-from-backup.md`.

---

## 10. GitHub branch protection

Repo → **Settings → Branches → Add rule** for `main`:

- [x] Require a pull request before merging
- [x] Require approvals (≥ 1, ≥ 2 for security paths)
- [x] Dismiss stale approvals when new commits are pushed
- [x] Require review from Code Owners (uses `.github/CODEOWNERS`)
- [x] Require status checks to pass before merging:
  - `ci.yml` (CI — SAFE GOLD)
  - `supabase-check.yml`
  - `db-types-drift.yml`
- [x] Require branches to be up to date before merging
- [x] Require conversation resolution before merging
- [x] Require signed commits *(optional, recommended)*
- [x] Do not allow force pushes
- [x] Do not allow deletions

---

## 11. Monitoring & alerts

### 11.1 Uptime
Pick one of: UptimeRobot (free), Better Uptime, Checkly.

Monitors to create (all 5min interval, alert after 2 consecutive fails):
- `GET https://tatame.pro/` → expect 200 + body contains "Tatame"
- `GET https://<project>.supabase.co/functions/v1/health-check` → expect 200
- `GET https://tatame.pro/api/verify/card/<known-uuid>` → expect 200 (smoke for verify-* path)

Connect alerts to the same Slack channel as Sentry.

### 11.2 Stripe alerts
Stripe Dashboard → **Settings → Email preferences** → enable:
- Failed payment
- Disputed charge
- Webhook delivery failure

### 11.3 Supabase alerts
Dashboard → **Reports → Notifications**:
- Database CPU > 80% for 5min
- Connections > 80% of pool
- Failed cron jobs

---

## 12. Legal / LGPD compliance

- [ ] Privacy policy text reviewed by counsel (current draft: `src/pages/PrivacyPolicy.tsx`).
- [ ] Terms of Service published (route exists?).
- [ ] DPO contact email live on Privacy page.
- [ ] Cookie consent banner reviewed (component: `CookieConsent.tsx`).
- [ ] DPA (Data Processing Agreement) signed with Supabase, Stripe, Resend, Cloudflare, Upstash, Vercel, Sentry. All offer them on request.
- [ ] Data retention policy reviewed (`docs/DATA-RETENTION-POLICY.md`).

---

## 13. Cutover smoke test (do this in PROD)

Use the validation protocol from `docs/RELEASE-READINESS-P0.md` §8:

1. As superadmin, create a brand-new tenant via `CreateTenantDialog`.
2. Log out, log in as the new tenant admin.
3. Complete the 5-step onboarding wizard. Confirm redirect to `/{slug}/app`.
4. Create one academy, one grading scheme, one athlete.
5. Submit a membership for that athlete.
6. Approve the membership. Confirm:
   - Digital card was generated.
   - Verify URL on the QR code returns 200 publicly.
   - Membership status emails arrive in inbox (not spam).
7. As superadmin, start impersonation → confirm banner appears, role badges update.
8. Trigger a $0 Stripe test product checkout. Confirm `webhook_events` row appears and `tenant_billing` updates.
9. Force a 5th failed login → confirm account lockout kicks in for 15min.
10. Verify Sentry captured at least one breadcrumb during the flow.
11. Confirm web vitals show up wherever you ship them.

Roll back trigger: any of steps 3, 6, 8 fail → `vercel rollback` to previous deployment, debug in staging.

### 13.1 Stripe Connect (marketplace) smoke test

Prereq: Connect enabled + Express default in Stripe Dashboard; both webhook
endpoints registered (§8 and `stripe-webhook-setup.md` §6); secrets set.

1. As the test tenant admin, open **Settings → Repasses e conta bancária**.
   Confirm the card shows "not connected" and the disclosed fee % matches
   `platform_fee_bps` (default 5%).
2. Click **Conectar conta bancária** → complete Stripe Express onboarding
   with test data (use Stripe's test KYC values).
3. On return, confirm the card auto-refreshes to **Conta ativa** (or
   "Em análise" if Stripe is still verifying — click **Atualizar status**).
   Verify the `account.updated` event landed on the Connect webhook endpoint
   (Stripe Dashboard → the Connect endpoint → Recent deliveries → 200).
4. Run a membership checkout for an athlete in this tenant. In the Stripe
   Dashboard confirm: the PaymentIntent has `application_fee_amount` ≈ 5% and
   `transfer_data.destination` = the tenant's `acct_...`. The funds show on
   the **connected account**, the fee on the **platform** balance.
5. Confirm NO `BILLING_CONNECT_FALLBACK_PLATFORM_CHARGE` institutional event
   was emitted for this tenant (that event means the soft fallback fired —
   i.e. the tenant was NOT connected).
6. Open **Abrir painel de repasses** → confirm the Stripe Express dashboard
   opens in a new tab and shows the incoming payment.
7. (Negative) With a SECOND tenant that has NOT onboarded, start an event
   creation → confirm the amber `ConnectStatusBanner` appears, and a
   membership checkout for that tenant emits the CRITICAL
   `BILLING_CONNECT_FALLBACK_PLATFORM_CHARGE` event (soft fallback working).

Roll back trigger: step 4 routes funds to the platform instead of the
connected account → freeze, investigate `_shared/connect.ts` /
`getTenantConnectInfo` wiring before taking real money.

---

## 14. Open follow-ups (do not block launch)

These are in `docs/PRODUCTION-AUDIT-2026-03-12.md` and remain valid:

- **assertTenantAccess** added to bulk/state-change writes (`import-athletes`, `approve-membership`, `reject-membership`) ✅ — still missing from `admin-reset-password`, `get-document`, `retry-membership-payment`, `create-event-registration-checkout`, `request-erasure`. Each of these has equivalent inline guards; adding the centralized check is belt-and-suspenders, not P0.
- **MFA/2FA** for SUPERADMIN_GLOBAL and ADMIN_TENANT. Supabase Auth supports TOTP natively — enable in Auth settings and ship the UI in a follow-up sprint.
- **Mobile UX** — tabelas (AthletesList, MembershipList) still desktop-first.
- **Unit test coverage** of `useAuth`, billing/membership hooks (currently 0%).
- **PWA manifest** for "Add to Home Screen".
- **Staging environment** — separate Supabase project + Vercel preview tied to `staging` branch.
- **Status page** (statuspage.io or similar).

---

## 15. Day-2 operations

- Bump `VITE_APP_VERSION` every release (lets Sentry tag issues to releases).
- Review Sentry weekly; triage anything `level:error` within 48h.
- Review Supabase logs weekly for cron failures.
- Rotate `CRON_SECRET`, `INTERNAL_ALERT_SECRET`, `SEED_TEST_USER_SECRET` every 90 days.
- Run `npm audit --audit-level=high` weekly (CI does this on PRs, but background drift can sneak in).
- Refresh PITR test restore quarterly.

---

*Built from the audit on 2026-05-13. Update this runbook when steps change — it should always reflect what an operator needs to do today.*
