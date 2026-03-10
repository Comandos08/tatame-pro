# Runbook: Zero-Downtime Database Migrations

**Owner:** Engineering
**Last reviewed:** 2026-03-10

---

## Principles

Tatame Pro runs on Supabase PostgreSQL with RLS. Migrations must be:
1. **Safe by default** — only backward-compatible changes in production without a maintenance window
2. **Tested in staging** — always apply to staging environment first
3. **Reversible** — prefer additive changes; document rollback for destructive ones

---

## Safe Operations (zero-downtime, any time)

These can be applied without coordination:

| Operation | Notes |
|-----------|-------|
| `ADD COLUMN` with `DEFAULT` or nullable | Never blocks reads or writes |
| `CREATE INDEX CONCURRENTLY` | Non-blocking index creation |
| `CREATE TABLE` | No impact on existing tables |
| `ADD CONSTRAINT` (CHECK, not FK) with `NOT VALID` | Validates only new rows |
| `DROP INDEX CONCURRENTLY` | Non-blocking index removal |
| `ALTER TABLE ... ADD FOREIGN KEY` with `NOT VALID` | Deferred validation |

---

## Requires Maintenance Window

These operations lock the table and block reads/writes:

| Operation | Risk |
|-----------|------|
| `DROP COLUMN` | Irreversible, locks table |
| `ALTER COLUMN TYPE` | Rewrites table, full lock |
| `ADD NOT NULL` without default | Requires table rewrite |
| `ADD CONSTRAINT` (validate) | Locks table during scan |
| `RENAME COLUMN` | Breaks existing queries |

**If you must do one of these:** schedule a maintenance window, notify users, and be prepared to rollback.

---

## Workflow: Applying Migrations

### 1. Write the migration file

```bash
supabase migration new <descriptive-name>
# Creates: supabase/migrations/<timestamp>_<descriptive-name>.sql
```

Edit the file and follow safe patterns above.

### 2. Test locally

```bash
supabase db reset   # resets local DB and applies all migrations
supabase start      # start local stack
# Run your smoke tests
```

### 3. Apply to staging

```bash
supabase db push --project-ref <staging-ref> --include-seed=false
```

Verify staging works:
- [ ] Migration applied without error
- [ ] Application functions normally on staging
- [ ] RLS still enforces tenant isolation (test with two tenants)

### 4. Apply to production

```bash
supabase db push --project-ref <prod-ref> --include-seed=false
```

**Never** use `supabase db reset` on production — it drops all data.

### 5. Verify production

```sql
-- Confirm migration was applied
SELECT * FROM supabase_migrations ORDER BY inserted_at DESC LIMIT 5;

-- Confirm table structure
\d <table_name>
```

---

## Rollback Strategy

For additive migrations (ADD COLUMN, CREATE TABLE):
```sql
-- Rollback: drop what you added
ALTER TABLE <table> DROP COLUMN <column>;
DROP TABLE IF EXISTS <new_table>;
```

For index creation:
```sql
DROP INDEX CONCURRENTLY <index_name>;
```

For non-reversible operations (DROP COLUMN, ALTER TYPE):
- You must restore from backup (see `restore-from-backup.md`)
- Or redeploy previous application version that works with old schema

---

## Emergency: Migration Stuck / Long Running

If a migration is running longer than expected:

```sql
-- Check active long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;

-- Cancel a stuck migration (replace pid)
SELECT pg_cancel_backend(<pid>);

-- Force terminate if cancel doesn't work
SELECT pg_terminate_backend(<pid>);
```

After terminating, check if partial migration was applied and clean up manually.

---

## Checklist Before Every Production Migration

- [ ] Migration tested on local environment
- [ ] Migration tested on staging environment
- [ ] Migration is backward-compatible OR maintenance window scheduled
- [ ] Rollback script documented
- [ ] Team notified if any service disruption expected
- [ ] Supabase PITR backup is recent (check Dashboard → Backups)
