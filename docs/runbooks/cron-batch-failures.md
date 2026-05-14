# Runbook: Cron Batch Failures

**Severity:** P2 (degraded subsystem) → P1 if recurring across runs
**Owner:** On-call engineer
**Last reviewed:** 2026-05-14

---

## 1. What this runbook covers

The system pages on-call via `log.critical` (Sentry fatal + Slack + admin
email + `institutional_events`) for two distinct failure modes in
batch-style cron Edge Functions:

| Signal | Meaning |
|---|---|
| `Cron batch failure threshold exceeded: <job>` | The job ran but **>= 50%** of items errored (with at least 3 absolute failures). The job itself didn't die — the batch did. |
| `Fatal error in <job>` | The job's top-level catch fired — the job died before/during its loop. **No** items were processed today. |

Both arrive with `severity: CRITICAL` and the same correlation_id you'd
use to grep structured logs.

---

## 2. First 5 minutes

Regardless of which job, regardless of which signal:

1. **Open the Sentry event** — the `metadata` carries `succeeded`,
   `failed`, `considered`, `failure_ratio`, `correlation_id`,
   `job_run_id`. That's enough to know the blast radius without
   leaving Sentry.
2. **Confirm Supabase is up** — https://status.supabase.com. Most
   `Fatal error` events during outage windows are downstream
   symptoms, not bugs.
3. **Look at the previous run** in `audit_logs` /
   `institutional_events`:
   ```sql
   select event_type, metadata, occurred_at
   from public.audit_logs
   where metadata->>'source' = '<job-name>-job'
   order by occurred_at desc
   limit 5;
   ```
   If the previous 1-2 runs were clean and this one is degraded,
   it's an incident. If failures have been climbing across runs, it's
   tech debt — file an issue, downgrade priority.
4. **Do NOT manually re-invoke the job** as the first move. All jobs
   are designed to be idempotent on the next scheduled run; a panic
   re-run with a still-broken upstream just adds noise to the audit
   trail.

---

## 3. Per-job triage

### Billing lifecycle (5 jobs)

These move tenants through the billing state machine. Failures here are
**directly visible to the customer** (wrong status, lost access).

#### `audit-billing-consistency`
- **Scanner job, not a batch.** Fires only as `Fatal error`.
- **What it does:** scans every tenant for `tenant_billing.status`
  ↔ `tenants.is_active` drift.
- **First check:** does `select count(*) from tenants` work as service
  role? If not → Supabase incident, not us.
- **If query works but scanner died:** schema drift (column rename
  on `tenants` or `tenant_billing`) is the #1 cause. Compare against
  the latest migration in `supabase/migrations/`.
- **Severity:** **P1 within 24h.** The scanner is the only mechanism
  that catches silent webhook failures — a dead scanner means we lose
  the safety net until the next run.

#### `expire-trials` (TRIALING → TRIAL_EXPIRED)
- **What failing means:** trials that ended yesterday still show as
  TRIALING; customer keeps full access past their entitled window.
- **First check:** Stripe webhook health (`stripe_webhook_events`
  table — are recent rows landing?). If webhooks are fine but the
  job degraded, the bug is in `tenant_billing` writes (optimistic
  lock on `.eq("status", "TRIALING")` may be losing races).
- **Safe to re-run:** yes, after fixing the root cause. The optimistic
  lock guarantees idempotency.

#### `mark-pending-delete` (TRIAL_EXPIRED → PENDING_DELETE)
- **Runs 5 min after `expire-trials`.** If `expire-trials` paged,
  this one almost certainly will too — fix upstream first.
- **What failing means:** tenants past their grace window stay in
  TRIAL_EXPIRED, never get the warning email, never get scheduled
  for deletion. LGPD retention window starts slipping.

#### `expire-grace-period` (PAST_DUE → UNPAID)
- **What failing means:** post-billing-failure tenants stay in
  PAST_DUE forever. `is_active` flag drifts from billing reality.
- **First check:** `assertValidBillingTransition` is the most likely
  thrower. Confirm the state machine in
  `_shared/billing-state-machine.ts` still includes `PAST_DUE → UNPAID`
  as a valid transition.

#### `cleanup-expired-tenants`
- **What failing means:** tenants past their `scheduled_delete_at`
  still exist in the DB. LGPD violation if it persists past 7 days.
- **The `skipped` counter is intentional, NOT a failure.** Safeguards
  (recent payment, manual override, > 50 athletes) deliberately skip
  destructive deletion. If `skipped` is HIGH but `failed` is LOW, the
  safeguards are doing their job — DO NOT bypass them.
- **NEVER run with `--force` or any flag that skips
  `canSafelyDelete()`.** If a real LGPD deadline is at risk, escalate
  to a human review, do not delete around the safeguard.

### Membership lifecycle (4 jobs)

These move memberships through their lifecycle. Failures here mostly
affect operators (cluttered tables, stale data) rather than billing.

#### `expire-memberships` (ACTIVE → EXPIRED)
- **What failing means:** memberships past their `end_date` still show
  as ACTIVE. Operators see stale data; athletes still appear "filiados".
- **First check:** the `engine_noop` skipped reason in `results`. If
  most items are noop, the notification engine is short-circuiting —
  not a real failure, false alarm. Confirm the failure rate via the
  `failed` count, not by glancing at the response body.

#### `transition-youth-to-adult`
- **What failing means:** athletes who turned 18 still have
  `applicant_data.is_minor = true`. Guardian-required UX paths still
  fire for adults.
- **First check:** the guardian_links table. Schema changes here are
  the usual trigger.

#### `cleanup-abandoned-memberships` (DRAFT > 24h → ABANDONED)
- **What failing means:** DRAFT memberships pile up. The membership
  list view in the app gets noisier.
- **Severity:** lowest of the lot. Safe to investigate next business
  morning if it pages overnight.

#### `cleanup-pending-payment-memberships` (PENDING_PAYMENT > 24h → CANCELLED)
- **What failing means:** memberships waiting for payment that never
  came stay in PENDING_PAYMENT. Customer sees their "Aguardando
  pagamento" message even though Stripe Checkout expired.
- **The `skipped` counter is intentional** — items whose status
  changed mid-run (race with stripe webhook) are correctly skipped,
  not failed.

### Notification crons (3 jobs)

These send emails. Failures here are silent from the customer's
perspective (they never knew they were supposed to get an email).

#### `check-trial-ending`
- **What failing means:** the "your trial ends in 3 days" email
  doesn't go out. Customers hit `TRIAL_EXPIRED` without warning.
- **First check:** Resend dashboard (or whatever email provider is
  current). Is there a deliverability incident?
- **`already_sent` skips are correct** — idempotency guarantees no
  duplicate emails.

#### `check-membership-renewal`
- **What failing means:** "your membership expires in 7 days" reminder
  doesn't go out. Athletes don't renew.
- **First check:** same as `check-trial-ending`.

#### `pre-expiration-scheduler`
- **What failing means:** the multi-window reminder ladder
  (30/15/7/3/1 days before expiry) breaks. If it's failing on day-1
  emails, that's the highest-impact window.
- **First check:** `notification_engine.shouldSend()` resolution. The
  engine has 10+ branches and a recent change to a single rule can
  cascade into a higher noop/fail rate.

### Storage (1 job)

#### `cleanup-tmp-documents`
- **What failing means:** `/tmp` storage in Supabase Storage keeps
  growing. Eventually hits the project's storage quota.
- **First check:** Supabase Storage dashboard for current usage. If
  we're at < 50% of quota, this can wait until business hours.
- **NEVER manually delete from `storage.objects` table** without
  going through the function. The function has audit hooks that
  manual deletion bypasses.

---

## 4. What NOT to do

Across every cron failure:

- **Do not** disable the cron in `pg_cron` as a "quick fix." A
  disabled job is silent — silent is the failure mode log.critical
  was designed to prevent.
- **Do not** bypass the safeguards in `cleanup-expired-tenants`. The
  LGPD framework was approved with these safeguards in place;
  removing them creates a different incident.
- **Do not** `git revert` the wiring commits to "make the alerts stop."
  The alert IS the value; the wiring is doing its job. Silence the
  noise upstream (fix the actual failure), not at the alert level.
- **Do not** raise `thresholdRatio` or `minFailures` defaults across
  the board to suppress alerts. If a single job is genuinely noisy
  (e.g. small batch + high natural variance), tune that one job's
  call site only, with a comment explaining the new threshold's
  rationale.

---

## 5. Recovery verification

After deploying a fix, confirm via:

1. **One full successful run** of the affected job. Trigger manually
   with the `x-cron-secret` header if pg_cron's next run is more than
   30 min away.
2. **Audit trail check**: the `JOB_*_RUN` event in `audit_logs` should
   show `failed: 0` (or below the threshold) for the recovery run.
3. **No new Sentry `critical: true` events** for the same `job` tag
   within an hour.
4. **Close the loop** in the incident channel with the correlation_id
   of the failing run and the fix commit SHA.

---

## 6. Reference

- Helper source: `supabase/functions/_shared/batch-monitor.ts`
- Helper tests: `supabase/functions/_shared/batch-monitor.test.ts`
- Critical alert pipeline: `supabase/functions/_shared/critical-alert.ts`
- Backend logger: `supabase/functions/_shared/backend-logger.ts`
  (`log.critical` definition)
- Notification engine: `supabase/functions/_shared/notification-engine.ts`
- Billing state machine: `supabase/functions/_shared/billing-state-machine.ts`
