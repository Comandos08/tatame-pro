-- =============================================================
-- P4.1.A — OBSERVABILITY DATA MODEL
-- Category column, indexes, views for job execution & critical events
-- =============================================================

-- 1. Add category column to audit_logs
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_category 
ON audit_logs(category) WHERE category IS NOT NULL;

-- 3. Create index for event_type + created_at (performance)
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type_created 
ON audit_logs(event_type, created_at DESC);

-- 4. Create trigger function to auto-set category on INSERT
CREATE OR REPLACE FUNCTION set_audit_log_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := CASE 
      WHEN NEW.event_type LIKE 'MEMBERSHIP_%' THEN 'MEMBERSHIP'
      WHEN NEW.event_type LIKE 'TENANT_%' OR NEW.event_type LIKE 'BILLING_%' THEN 'BILLING'
      WHEN NEW.event_type LIKE 'JOB_%' THEN 'JOB'
      WHEN NEW.event_type LIKE 'DIPLOMA_%' OR NEW.event_type LIKE 'GRADING_%' THEN 'GRADING'
      WHEN NEW.event_type LIKE 'IMPERSONATION_%' THEN 'SECURITY'
      WHEN NEW.event_type LIKE 'LOGIN_%' OR NEW.event_type LIKE 'PASSWORD_%' THEN 'AUTH'
      WHEN NEW.event_type LIKE 'ROLES_%' THEN 'ROLES'
      WHEN NEW.event_type LIKE 'TMP_%' OR NEW.event_type LIKE 'DIGITAL_%' THEN 'STORAGE'
      ELSE 'OTHER'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 5. Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_audit_log_category ON audit_logs;
CREATE TRIGGER trg_audit_log_category
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION set_audit_log_category();

-- 6. Backfill existing records (run once)
UPDATE audit_logs SET category = 
  CASE 
    WHEN event_type LIKE 'MEMBERSHIP_%' THEN 'MEMBERSHIP'
    WHEN event_type LIKE 'TENANT_%' OR event_type LIKE 'BILLING_%' THEN 'BILLING'
    WHEN event_type LIKE 'JOB_%' THEN 'JOB'
    WHEN event_type LIKE 'DIPLOMA_%' OR event_type LIKE 'GRADING_%' THEN 'GRADING'
    WHEN event_type LIKE 'IMPERSONATION_%' THEN 'SECURITY'
    WHEN event_type LIKE 'LOGIN_%' OR event_type LIKE 'PASSWORD_%' THEN 'AUTH'
    WHEN event_type LIKE 'ROLES_%' THEN 'ROLES'
    WHEN event_type LIKE 'TMP_%' OR event_type LIKE 'DIGITAL_%' THEN 'STORAGE'
    ELSE 'OTHER'
  END
WHERE category IS NULL;

-- 7. Create view for job execution summary (platform-wide)
CREATE OR REPLACE VIEW job_execution_summary AS
SELECT 
  event_type AS job_name,
  -- Last successful run
  MAX(CASE WHEN (metadata->>'status') IS NULL OR (metadata->>'status') = 'COMPLETED' THEN created_at END) AS last_success_at,
  -- Last failure
  MAX(CASE WHEN (metadata->>'status') = 'FAILED' THEN created_at END) AS last_failure_at,
  -- Last run (any status)
  MAX(created_at) AS last_run_at,
  -- Counts in last 24h
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS runs_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' 
                    AND ((metadata->>'status') IS NULL OR (metadata->>'status') = 'COMPLETED')) AS success_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' 
                    AND (metadata->>'status') = 'FAILED') AS failures_24h,
  -- Items processed in last 24h
  COALESCE(SUM((metadata->>'processed')::int) 
    FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) AS items_processed_24h,
  -- Counts in last 7d
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS runs_7d,
  COALESCE(SUM((metadata->>'processed')::int) 
    FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0) AS items_processed_7d
FROM audit_logs
WHERE event_type LIKE 'JOB_%_RUN'
GROUP BY event_type;

COMMENT ON VIEW job_execution_summary IS 'Aggregated job execution metrics for observability dashboard';

-- 8. Create view for critical events (last 7 days)
CREATE OR REPLACE VIEW observability_critical_events AS
SELECT 
  id,
  'AUDIT' AS source,
  event_type,
  category,
  tenant_id,
  created_at,
  metadata,
  CASE 
    WHEN event_type IN ('TENANT_PAYMENT_FAILED', 'MEMBERSHIP_PAYMENT_RETRY_FAILED') THEN 'HIGH'
    WHEN event_type LIKE '%_FAILED' OR event_type LIKE '%_ERROR' THEN 'MEDIUM'
    ELSE 'LOW'
  END AS severity
FROM audit_logs
WHERE 
  (event_type LIKE '%_FAILED' OR event_type LIKE '%_ERROR')
  AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  id,
  'DECISION' AS source,
  decision_type AS event_type,
  'SECURITY' AS category,
  tenant_id,
  created_at,
  metadata,
  severity::text
FROM decision_logs
WHERE 
  severity IN ('HIGH', 'CRITICAL')
  AND created_at > NOW() - INTERVAL '7 days'

ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW observability_critical_events IS 'Critical events requiring attention from the last 7 days';

-- 9. Grant access to views (service role can already access, but be explicit)
GRANT SELECT ON job_execution_summary TO authenticated;
GRANT SELECT ON observability_critical_events TO authenticated;