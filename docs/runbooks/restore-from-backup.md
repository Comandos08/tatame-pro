# Runbook: Restore from Backup (Supabase PITR)

**Severity:** P0 (data loss or corruption)
**Owner:** On-call engineer + project owner approval required
**Last reviewed:** 2026-03-10

> ⚠️ **WARNING:** Restore operations overwrite the current database state.
> This is irreversible. Confirm with project owner before proceeding.

---

## Prerequisites

- Supabase project on Pro plan or higher (PITR requires Pro+)
- Access to Supabase Dashboard with Owner or Admin role
- PITR retention window: 7 days (Pro), 30 days (Team/Enterprise)

---

## 1. Identify the Recovery Point

Before restoring, determine:

1. **When did the incident start?** (from logs, Sentry, or user reports)
2. **What is the last known good state?** (before data loss/corruption)
3. **What is the acceptable RPO?** (max data you can afford to lose)

Document: `Target recovery timestamp: YYYY-MM-DD HH:MM:SS UTC`

---

## 2. Estimate Impact

Before restoring, estimate what data will be lost between the recovery point and now:

- New tenant registrations
- New athlete memberships
- Stripe payments processed (CRITICAL — do not lose payment records)
- Grading promotions

If Stripe payments occurred after the recovery point:
- Export Stripe payment events first via Stripe Dashboard → Events
- You may need to manually reconcile payments after restore

---

## 3. Perform the Restore

1. Go to **Supabase Dashboard → Your Project → Settings → Backups**
2. Select **Point in Time Recovery**
3. Choose the recovery timestamp (earlier than the incident)
4. Click **Restore** — you will be prompted to confirm
5. Wait for restore to complete (typically 5–30 minutes depending on database size)

**Note:** The database will be unavailable during restore. All active connections will be dropped.

---

## 4. Post-Restore Verification

Run these checks immediately after restore:

```sql
-- Verify tenant count
SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL;

-- Verify no memberships in inconsistent state
SELECT status, COUNT(*) FROM memberships GROUP BY status;

-- Verify Stripe billing records are intact
SELECT COUNT(*) FROM tenant_billing WHERE stripe_subscription_id IS NOT NULL;

-- Verify audit log integrity (check hash chain)
SELECT COUNT(*) FROM audit_logs ORDER BY created_at DESC LIMIT 100;
```

- [ ] Tenant count matches expected (from recent export or memory)
- [ ] No memberships stuck in impossible states
- [ ] Stripe subscription IDs present for paying tenants
- [ ] Audit log is present and readable

---

## 5. Reconcile Data After Restore

If data was created between recovery point and incident:

1. **Stripe payments:** Cross-reference Stripe Dashboard with restored DB — manually insert missing payment records if any
2. **New memberships:** Contact affected athletes directly
3. **Edge Function retrigger:** Re-run any scheduled jobs that may have run during the lost window

---

## 6. Re-enable Traffic

1. Verify application connects to database (smoke test login flow)
2. Remove any maintenance banners
3. Update status page to "Operational"
4. Notify affected users if data loss occurred

---

## 7. Post-Incident

- [ ] Document: incident timestamp, recovery point, data loss window
- [ ] Verify PITR is still enabled after restore (check Backup settings)
- [ ] Schedule post-mortem within 48 hours
- [ ] Consider increasing backup frequency or retention window if this was insufficient
