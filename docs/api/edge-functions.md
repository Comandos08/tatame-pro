# Edge Functions API Reference

> Auto-generated from codebase audit · 2026-03-10
> Base URL: `https://<project-ref>.supabase.co/functions/v1/<function-name>`
> All functions require the `Authorization: Bearer <token>` header unless marked **public**.
> CORS: all functions accept `OPTIONS` preflight with `Access-Control-Allow-Origin: *`.

---

## Authentication & Identity

### `health-check`
**GET** · Public
Returns service status. No auth required.
**Response:** `{ status: "ok", timestamp: string }`

### `admin-create-user`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Creates a new user account (bypasses normal registration flow).
**Body:** `{ email, full_name, role, tenant_id? }`
**Response:** `{ user_id }`

### `admin-reset-password`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Triggers a password reset for any user.
**Body:** `{ user_id }`
**Response:** `{ success: true }`

### `request-password-reset`
**POST** · Public
Sends a password reset email to the provided address.
**Body:** `{ email }`
**Response:** `{ success: true }`

### `reset-password`
**POST** · Public
Validates a reset token and sets a new password.
**Body:** `{ token, new_password }`
**Response:** `{ success: true }`

### `resolve-identity-wizard`
**POST** · Requires auth
Resolves onboarding identity conflicts (duplicate emails, linked accounts).
**Body:** `{ resolution_type: "MERGE" | "SEPARATE", ... }`
**Response:** `{ resolved: true }`

---

## Tenant Management

### `complete-tenant-onboarding`
**POST** · Requires: `ADMIN_TENANT` (tenant owner)
Finalizes tenant onboarding: creates TRIALING billing, transitions lifecycle SETUP→ACTIVE.
**Body:** `{ tenant_id }`
**Response:** `{ success: true, tenant_id }`

### `create-tenant-admin`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Creates the first admin for a newly created tenant.
**Body:** `{ tenant_id, user_id }`
**Response:** `{ success: true }`

### `create-tenant-subscription`
**POST** · Requires: `ADMIN_TENANT`
Creates a Stripe subscription for the tenant plan.
**Body:** `{ tenant_id, plan_id, payment_method_id }`
**Response:** `{ subscription_id, status }`

### `tenant-customer-portal`
**POST** · Requires: `ADMIN_TENANT`
Creates a Stripe Customer Portal session for self-serve billing management.
**Body:** `{ tenant_id, return_url }`
**Response:** `{ portal_url }`

### `resolve-feature-flags`
**POST** · Requires auth
Returns the active feature flags for the current tenant.
**Body:** `{ tenant_id }`
**Response:** `{ flags: Record<string, boolean> }`

---

## Roles & Permissions

### `grant-roles`
**POST** · Requires: `ADMIN_TENANT` or `SUPERADMIN_GLOBAL`
Grants one or more roles to a user within a tenant.
**Body:** `{ user_id, tenant_id, roles: string[] }`
**Response:** `{ granted: string[] }`

### `revoke-roles`
**POST** · Requires: `ADMIN_TENANT` or `SUPERADMIN_GLOBAL`
Revokes roles from a user within a tenant.
**Body:** `{ user_id, tenant_id, roles: string[] }`
**Response:** `{ revoked: string[] }`

### `start-impersonation`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Starts an admin impersonation session. All actions are audit-logged.
**Body:** `{ target_user_id, reason }`
**Response:** `{ session_token, expires_at }`

### `end-impersonation`
**POST** · Requires active impersonation session
Ends the current impersonation session and restores original identity.
**Body:** `{}`
**Response:** `{ success: true }`

### `validate-impersonation`
**POST** · Internal
Validates that an impersonation token is still active and authorized.
**Body:** `{ session_token }`
**Response:** `{ valid: boolean, target_user_id }`

---

## Athletes & Memberships

### `join-federation`
**POST** · Requires: `ATLETA`
Submits a new membership application (filiação) for an athlete.
**Body:** `{ athlete_id, tenant_id, membership_type, documents: string[] }`
**Response:** `{ membership_id, status: "PENDING" }`

### `leave-federation`
**POST** · Requires: `ATLETA` or `ADMIN_TENANT`
Withdraws or cancels an active membership.
**Body:** `{ membership_id }`
**Response:** `{ success: true }`

### `approve-membership`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Approves a pending membership application. Triggers email notification.
**Body:** `{ membership_id }`
**Response:** `{ success: true, membership_id }`

### `reject-membership`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Rejects a pending membership with a reason. Triggers email notification.
**Body:** `{ membership_id, reason: string }`
**Response:** `{ success: true }`

### `cancel-membership-manual`
**POST** · Requires: `ADMIN_TENANT`
Manually cancels an active membership (admin action).
**Body:** `{ membership_id, reason? }`
**Response:** `{ success: true }`

### `reactivate-membership-manual`
**POST** · Requires: `ADMIN_TENANT`
Reactivates a canceled or expired membership manually.
**Body:** `{ membership_id }`
**Response:** `{ success: true }`

### `transition-youth-to-adult`
**POST** · Scheduled (cron) · Internal
Automatically transitions youth athlete records to adult when they turn 18.
**Body:** `{}`
**Response:** `{ transitioned: number }`

---

## Payments & Billing

### `create-membership-checkout`
**POST** · Public (with rate limiting + CAPTCHA)
Creates a Stripe Checkout session for membership payment.
Rate limit: 10/hour per IP, 3/10min per membership.
**Body:** `{ membershipId, tenantSlug, successUrl, cancelUrl, captchaToken? }`
**Response:** `{ checkoutUrl, sessionId }`

### `create-membership-fee-checkout`
**POST** · Requires auth
Creates a Stripe Checkout session for annual membership fee renewal.
**Body:** `{ membership_id, success_url, cancel_url }`
**Response:** `{ checkout_url, session_id }`

### `confirm-membership-payment`
**POST** · Internal (called from stripe-webhook)
Updates membership payment status after successful Stripe payment.
**Body:** `{ session_id }`
**Response:** `{ success: true }`

### `retry-membership-payment`
**POST** · Requires: `ATLETA`
Creates a new Stripe Checkout for a failed membership payment.
**Body:** `{ membership_id }`
**Response:** `{ checkout_url }`

### `create-event-registration-checkout`
**POST** · Requires auth
Registers an athlete for an event category. Creates a Stripe Checkout for paid categories, or confirms directly for free categories.
**Body:** `{ event_id, category_id, athlete_id, success_url?, cancel_url? }`
**Response (free):** `{ registration_id, is_free: true }`
**Response (paid):** `{ checkout_url, session_id, registration_id, is_free: false }`

### `stripe-webhook`
**POST** · Public (Stripe signature required)
Handles Stripe webhook events: `checkout.session.completed`, `invoice.payment_failed`, subscription lifecycle events.
**Headers:** `Stripe-Signature` required
**Body:** Raw Stripe event payload
**Response:** `{ received: true }`

### `stripe-test`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Test endpoint for Stripe integration diagnostics.
**Response:** `{ stripe_status: "ok" }`

### `admin-billing-control`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Administrative billing control (override tenant billing state, grant trial extensions, etc.).
**Body:** `{ tenant_id, action: string, ... }`
**Response:** `{ success: true }`

### `audit-billing-consistency`
**POST** · Requires: `SUPERADMIN_GLOBAL` · Scheduled
Audits billing records for inconsistencies between Stripe and the database.
**Response:** `{ inconsistencies: number, fixed: number }`

---

## Documents

### `get-document`
**POST** · Requires auth
Returns a signed URL for a private document stored in Supabase Storage.
**Body:** `{ document_id }`
**Response:** `{ signed_url, expires_at }`

### `verify-document`
**GET** · Public
Verifies the authenticity of a document via its public hash.
**Query:** `?hash=<document_hash>`
**Response:** `{ valid: boolean, document_type, issued_at }`

### `cleanup-tmp-documents`
**POST** · Scheduled · Internal
Removes temporary documents from Storage after upload timeout.
**Response:** `{ deleted: number }`

---

## Digital Cards & Diplomas

### `generate-digital-card`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Generates or regenerates a digital membership card (PDF + QR code) for an athlete.
**Body:** `{ membership_id }`
**Response:** `{ card_id, pdf_url, public_token }`

### `verify-digital-card`
**GET** · Public
Verifies the authenticity of a digital card via its public token.
**Query:** `?token=<public_token>`
**Response:** `{ valid: boolean, athlete_name, tenant_name, valid_until }`

### `generate-diploma`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Generates a graduation diploma PDF for an athlete.
**Body:** `{ grading_id, athlete_id }`
**Response:** `{ diploma_id, pdf_url, serial_number }`

### `verify-diploma`
**GET** · Public
Verifies a graduation diploma via its serial number.
**Query:** `?serial=<serial_number>`
**Response:** `{ valid: boolean, athlete_name, level_name, issued_at }`

---

## Badges

### `assign-athlete-badge`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Assigns a badge to an athlete.
**Body:** `{ athlete_id, badge_id }`
**Response:** `{ assignment_id }`

### `revoke-athlete-badge`
**POST** · Requires: `ADMIN_TENANT`
Revokes a badge from an athlete.
**Body:** `{ assignment_id, reason? }`
**Response:** `{ success: true }`

### `toggle-badge-active`
**POST** · Requires: `ADMIN_TENANT`
Activates or deactivates a badge definition.
**Body:** `{ badge_id, is_active: boolean }`
**Response:** `{ success: true }`

### `update-badge-metadata`
**POST** · Requires: `ADMIN_TENANT`
Updates badge name, description, or image.
**Body:** `{ badge_id, name?, description?, image_url? }`
**Response:** `{ success: true }`

---

## Events

### `generate-event-bracket`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Generates the bracket (chaves) for an event category based on confirmed registrations.
**Body:** `{ event_id, category_id }`
**Response:** `{ bracket_id, matches_created: number }`

### `publish-event-bracket`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Publishes the bracket, making it visible to athletes.
**Body:** `{ bracket_id }`
**Response:** `{ success: true }`

### `record-match-result`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Records the result of a bracket match.
**Body:** `{ match_id, winner_registration_id, score_winner?, score_loser?, method? }`
**Response:** `{ success: true, next_match_id? }`

### `emit-institutional-event`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Emits a system-wide institutional event (audit trail, webhooks, notifications).
**Body:** `{ event_type, payload }`
**Response:** `{ event_id }`

---

## Notifications & Email

### `send-athlete-email`
**POST** · Requires auth
Sends a transactional email to an athlete or admin. Requires `RESEND_API_KEY` to be configured.
**Body:**
```json
{
  "email_type": "MEMBERSHIP_APPROVED" | "MEMBERSHIP_REJECTED" | "NEW_MEMBERSHIP_PENDING" | "NEW_GRADING" | "RENEWAL_REMINDER",
  "membership_id"?: "uuid",
  "data"?: {
    "athlete_name"?: "string",
    "athlete_email"?: "string",
    "tenant_name"?: "string",
    "card_url"?: "string",
    "rejection_reason"?: "string",
    "days_remaining"?: number,
    "end_date"?: "string"
  }
}
```
**Response:** `{ success: true, recipients: string[] }` or `{ success: true, skipped: true, reason: string }`

### `send-billing-email`
**POST** · Internal
Sends billing-related emails (invoice, payment failure, subscription renewal).
**Body:** `{ email_type, tenant_id, ... }`
**Response:** `{ success: true }`

### `notify-critical-alert`
**POST** · Requires: `SUPERADMIN_GLOBAL` or internal
Sends a critical system alert to configured admin emails.
**Body:** `{ alert_type, message, affected_tenant_id? }`
**Response:** `{ success: true }`

### `notify-new-grading`
**POST** · Requires: `ADMIN_TENANT` or `STAFF_ORGANIZACAO`
Sends a graduation notification email to the athlete.
**Body:** `{ athlete_id, grading_id }`
**Response:** `{ success: true }`

---

## Scheduled Jobs (Cron)

### `check-membership-renewal`
**POST** · Scheduled · Internal
Finds memberships expiring in 7 days and sends renewal reminder emails.
**Response:** `{ checked: number, emails_sent: number }`

### `pre-expiration-scheduler`
**POST** · Scheduled · Internal
Sends 30-day advance renewal reminders and marks memberships as PRE_EXPIRING.
**Response:** `{ scheduled: number }`

### `expire-memberships`
**POST** · Scheduled · Internal
Expires memberships that have passed their end_date.
**Response:** `{ expired: number }`

### `expire-trials`
**POST** · Scheduled · Internal
Expires tenant trials that have reached their trial end date.
**Response:** `{ expired: number }`

### `expire-grace-period`
**POST** · Scheduled · Internal
Expires tenants that have exhausted their grace period after payment failure.
**Response:** `{ expired: number }`

### `check-trial-ending`
**POST** · Scheduled · Internal
Notifies tenants whose trials end in 7 days.
**Response:** `{ notified: number }`

### `cleanup-abandoned-memberships`
**POST** · Scheduled · Internal
Cancels membership applications that have been PENDING for over 30 days without activity.
**Response:** `{ canceled: number }`

### `cleanup-pending-payment-memberships`
**POST** · Scheduled · Internal
Cleans up memberships stuck in payment pending state after 24 hours.
**Response:** `{ cleaned: number }`

### `cleanup-expired-tenants`
**POST** · Scheduled · Internal
Runs lifecycle cleanup for expired/churned tenants (data archiving, access revocation).
**Response:** `{ processed: number }`

### `mark-pending-delete`
**POST** · Scheduled · Internal
Marks tenants that have been in CHURNED state for 90+ days as PENDING_DELETE.
**Response:** `{ marked: number }`

---

## Data & Compliance (LGPD)

### `export-athlete-data`
**POST** · Requires auth (athlete = own data; admin = any athlete in tenant)
LGPD Art. 18 V — exports all personal data for an athlete as a JSON file.
**Body:** `{ athlete_id }`
**Response:** JSON file download (`Content-Disposition: attachment`)
```json
{
  "exported_at": "ISO8601",
  "athlete_id": "uuid",
  "personal_data": { ... },
  "memberships": [...],
  "graduations": [...],
  "diplomas": [...],
  "event_registrations": [...],
  "badges": [...]
}
```

### `import-athletes`
**POST** · Requires: `ADMIN_TENANT` or `SUPERADMIN_GLOBAL`
Bulk imports athletes from a CSV (parsed on frontend to JSON array). Max 500 rows per batch.
**Modes:**
- `mode=validate`: dry-run, returns preview with validation errors and duplicate detection
- `mode=confirm`: executes insert, skips duplicates

**Body:**
```json
{
  "mode": "validate" | "confirm",
  "tenant_id": "uuid",
  "rows": [
    {
      "full_name": "string",      // required
      "email": "string",          // required
      "birth_date": "YYYY-MM-DD", // required
      "gender": "MASCULINO|FEMININO|OUTRO", // required
      "national_id"?: "string",
      "phone"?: "string",
      "city"?: "string",
      "state"?: "string",
      "country"?: "string",
      "address_line1"?: "string",
      "academy_slug"?: "string"
    }
  ]
}
```
**Response (validate):** `{ valid: Row[], invalid: Row[], duplicates: Row[], preview: Row[], totalRows: number }`
**Response (confirm):** `{ inserted: number, skipped: number }`

---

## Security & Audit

### `audit-rls`
**POST** · Requires: `SUPERADMIN_GLOBAL`
Runs a security audit of Row Level Security policies across all tables.
**Response:** `{ tables_audited: number, violations: any[] }`

### `list-public-academies`
**GET** · Public
Returns public academy listings for a tenant (no auth required).
**Query:** `?tenant_slug=<slug>&search=<query>&limit=20&offset=0`
**Response:** `{ academies: [...], total: number }`

### `seed-test-user`
**POST** · Requires: `SUPERADMIN_GLOBAL` · Development only
Creates a seeded test user for automated testing.
**Body:** `{ role, tenant_id? }`
**Response:** `{ user_id, email, password }`

---

## Common Error Responses

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid parameters |
| `401` | Unauthorized — missing or invalid auth token |
| `403` | Forbidden — insufficient role/permissions |
| `404` | Resource not found |
| `409` | Conflict — duplicate registration, existing resource |
| `429` | Too many requests — rate limit exceeded |
| `500` | Internal server error |
| `503` | Service unavailable — external provider not configured |

---

## Environment Variables Required by Edge Functions

| Variable | Used by | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Service role key (server-only) |
| `SUPABASE_ANON_KEY` | Several | Anon key for user-context queries |
| `STRIPE_SECRET_KEY` | Billing functions | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Webhook endpoint signing secret |
| `RESEND_API_KEY` | Email functions | Resend API key for transactional email |
| `UPSTASH_REDIS_REST_URL` | Rate-limited functions | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Rate-limited functions | Upstash Redis REST token |
| `TURNSTILE_SECRET_KEY` | Public checkout functions | Cloudflare Turnstile secret |
| `PUBLIC_APP_URL` | Card/diploma generation | Public app URL for QR codes |
