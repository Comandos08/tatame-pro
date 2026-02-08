# P4.1 — Observability Documentation

## Overview

The P4.1 Observability module provides platform-wide health monitoring, job execution tracking, and alerting infrastructure.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      EDGE FUNCTIONS                               │
│  (audit-logger.ts with auto-category detection)                  │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ INSERT with category
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                     │
│  audit_logs (with category column + trigger)                     │
│  decision_logs | security_events                                 │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              OBSERVABILITY VIEWS                                  │
│  job_execution_summary | observability_critical_events           │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              FRONTEND                                             │
│  useSystemHealthStatus → AdminHealthDashboard                    │
│  AlertContext → AlertBadge, AlertsPanel                          │
└──────────────────────────────────────────────────────────────────┘
```

## Database Objects

### Column: audit_logs.category
Auto-populated via trigger based on event_type prefix:
- `MEMBERSHIP_*` → MEMBERSHIP
- `TENANT_*`, `BILLING_*` → BILLING
- `JOB_*` → JOB
- `DIPLOMA_*`, `GRADING_*` → GRADING
- `IMPERSONATION_*` → SECURITY
- `LOGIN_*`, `PASSWORD_*` → AUTH
- `ROLES_*` → ROLES
- `TMP_*`, `DIGITAL_*` → STORAGE
- Default → OTHER

### View: job_execution_summary
Aggregates job execution metrics:
- `job_name`, `last_success_at`, `last_failure_at`, `last_run_at`
- `runs_24h`, `success_24h`, `failures_24h`, `items_processed_24h`
- `runs_7d`, `items_processed_7d`

### View: observability_critical_events
Union of:
- audit_logs with `*_FAILED` or `*_ERROR` event types (last 7 days)
- decision_logs with HIGH/CRITICAL severity (last 7 days)

## Health Classification

| Status | Criteria |
|--------|----------|
| **OK** | All jobs running, no critical events |
| **DEGRADED** | Job delayed 24-48h OR billing issues present |
| **CRITICAL** | Job not run 48h+ OR 3+ billing failures in 24h |
| **UNKNOWN** | No data available |

## Components

### Hooks
- `useSystemHealthStatus()` - Aggregated health status
- `useJobsHealth()` - Individual job statuses
- `useAlerts()` - Alert management with dismiss

### Components
- `HealthStatusIndicator` - Visual status indicator
- `HealthStatusBadge` - Compact badge variant
- `JobsHealthCard` - Job status card
- `CriticalEventsCard` - Critical events list
- `AlertBadge` - Header alert counter
- `AlertsPanel` - Alert list sheet

### Pages
- `/app/health` - Admin Health Dashboard (Superadmin only)

## Future Realtime Integration

### Supabase Realtime (Planned)
```typescript
// Subscribe to critical audit_logs
const channel = supabase
  .channel('critical-events')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'audit_logs',
    filter: 'category=eq.CRITICAL'
  }, (payload) => {
    alertContext.refreshAlerts();
  })
  .subscribe();
```

### Webhook Integration (Planned)
- Endpoint: Edge Function `notify-critical-alert`
- Triggered by: audit_log with severity = CRITICAL
- Targets: Slack, Email, PagerDuty

## Security Notes

- All views inherit RLS from underlying tables
- Dashboard is read-only (zero mutations)
- Alert dismiss state stored in localStorage (client-side only)
- No PII exposed (only event types and aggregates)
