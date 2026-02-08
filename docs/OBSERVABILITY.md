# P4.1 & P4.2 — Observability Documentation

## Overview

The Observability modules provide platform-wide health monitoring, job execution tracking, and alerting infrastructure with realtime support.

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
│  audit_logs (with category column + trigger + realtime)          │
│  decision_logs | security_events                                 │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                      ┌──────────┴──────────┐
                      ▼                     ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│   OBSERVABILITY VIEWS    │  │    SUPABASE REALTIME (P4.2)      │
│  job_execution_summary   │  │  Channel: observability-realtime │
│  observability_critical  │  │  Table: audit_logs (INSERT only) │
│  _events                 │  │  Filter: HIGH/CRITICAL severity  │
└────────────────┬─────────┘  └──────────────┬───────────────────┘
                 │                            │
                 └──────────┬─────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              FRONTEND                                             │
│  useSystemHealthStatus → AdminHealthDashboard                    │
│  AlertContext → AlertBadge, AlertsPanel (with realtime)          │
└──────────────────────────────────────────────────────────────────┘
```

## P4.1 — Database Objects

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

## P4.1 — Health Classification

| Status | Criteria |
|--------|----------|
| **OK** | All jobs running, no critical events |
| **DEGRADED** | Job delayed 24-48h OR billing issues present |
| **CRITICAL** | Job not run 48h+ OR 3+ billing failures in 24h |
| **UNKNOWN** | No data available |

## P4.1 — Components

### Hooks
- `useSystemHealthStatus()` - Aggregated health status
- `useJobsHealth()` - Individual job statuses
- `useAlerts()` - Alert management with dismiss and realtime

### Components
- `HealthStatusIndicator` - Visual status indicator
- `HealthStatusBadge` - Compact badge variant
- `JobsHealthCard` - Job status card
- `CriticalEventsCard` - Critical events list
- `AlertBadge` - Header alert counter with realtime indicator
- `AlertsPanel` - Alert list sheet with new events counter

### Pages
- `/app/health` - Admin Health Dashboard (Superadmin only)

---

## P4.2 — Realtime Infrastructure

### Supabase Realtime

The platform uses Supabase Realtime for instant alert delivery:

```typescript
import { subscribeObservabilityRealtime } from '@/lib/observability/realtime';

// Client-side subscription
const subscription = subscribeObservabilityRealtime({
  onEvent: (alert) => {
    console.log('New alert:', alert);
  },
  onConnectionChange: (connected) => {
    console.log('Realtime connected:', connected);
  },
  onError: (error) => {
    console.error('Realtime error:', error);
  },
});

// Cleanup on unmount
subscription.unsubscribe();
```

**Channel:** `observability-realtime`
**Table:** `audit_logs` (INSERT only)
**Filter:** HIGH/CRITICAL severity events (client-side)

### Idempotency

Events are deduplicated using a client-side LRU cache:
- Cache key: event ID
- TTL: 1 hour
- Max size: ~1000 entries

This prevents duplicate alerts when:
- Realtime and polling return the same event
- Network reconnects trigger replay

### Connection States

| State | Badge | Fallback |
|-------|-------|----------|
| Connected | 🟢 Live | — |
| Disconnected | 🟡 Syncing | Polling (5 min) |
| Error | 🔴 Offline | Polling (5 min) |

### AlertContext API (P4.2 Additions)

```typescript
interface AlertContextValue {
  // Existing (P4.1)
  alerts: Alert[];
  activeCount: number;
  criticalCount: number;
  isLoading: boolean;
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;
  clearDismissed: () => void;
  
  // New (P4.2)
  isRealtimeConnected: boolean;     // Current connection state
  lastRealtimeEventAt: string | null; // ISO timestamp of last event
  newEventsCount: number;            // Count of unseen events
  markNewEventsAsSeen: () => void;   // Reset new events counter
}
```

---

## External Hooks (Future Integration)

The `notify-critical-alert` edge function is prepared for external notifications.

### Payload Schema

```json
{
  "event_id": "uuid",
  "event_type": "TENANT_PAYMENT_FAILED",
  "severity": "CRITICAL",
  "tenant_id": "uuid",
  "metadata": {},
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Planned Integrations (OFF by default)

| Integration | Secret Required | Status |
|-------------|-----------------|--------|
| Slack Webhook | `SLACK_WEBHOOK_URL` | Prepared |
| Email (Resend) | `ALERT_EMAIL_ENABLED=true` | Prepared |
| PagerDuty | `PAGERDUTY_KEY` | Planned |
| Custom Webhook | `ALERT_WEBHOOK_URL` | Planned |

### Enabling Slack (Future)

1. Set `SLACK_WEBHOOK_URL` secret in Cloud
2. Trigger via database trigger or cron job:
```sql
-- Example: Trigger on CRITICAL audit logs
CREATE OR REPLACE FUNCTION notify_critical_via_webhook()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category = 'BILLING' AND NEW.event_type LIKE '%FAILED%' THEN
    PERFORM net.http_post(
      'https://your-project.supabase.co/functions/v1/notify-critical-alert',
      jsonb_build_object(
        'event_id', NEW.id,
        'event_type', NEW.event_type,
        'severity', 'CRITICAL',
        'tenant_id', NEW.tenant_id,
        'timestamp', NEW.created_at
      ),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

3. Monitor via `webhook_events` table

---

## Security Notes

- All views inherit RLS from underlying tables
- Dashboard is read-only (zero mutations)
- Alert dismiss state stored in localStorage (client-side only)
- No PII exposed (only event types and aggregates)
- Realtime uses authenticated Supabase client
- External webhook requires service role (internal only)

---

## Troubleshooting

### Realtime Not Connecting

1. Check if `audit_logs` is in `supabase_realtime` publication
2. Verify Supabase client is authenticated
3. Check browser console for WebSocket errors

### Alerts Not Refreshing

1. Verify `observability_critical_events` view exists
2. Check RLS policies on underlying tables
3. Clear localStorage: `localStorage.removeItem('tatame_dismissed_alerts')`

### High Memory Usage

1. Reduce `MAX_REALTIME_ALERTS` constant
2. Increase `POLLING_INTERVAL_MS` for less frequent polling
3. Clear realtime cache via `refreshAlerts()`
