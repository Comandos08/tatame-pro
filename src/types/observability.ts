/**
 * 🔍 Observability Types — P4.1.B
 * 
 * Canonical types for platform health monitoring and alerting.
 */

// Event categories matching audit_logs.category
export type EventCategory = 
  | 'MEMBERSHIP' 
  | 'BILLING' 
  | 'JOB' 
  | 'GRADING' 
  | 'SECURITY' 
  | 'AUTH' 
  | 'ROLES' 
  | 'STORAGE'
  | 'OTHER';

// Severity levels for events and alerts
export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Health status classification
export type HealthStatus = 'OK' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

// Unified observability event from views
export interface ObservabilityEvent {
  id: string;
  source: 'AUDIT' | 'DECISION' | 'SECURITY';
  event_type: string;
  category: EventCategory;
  severity: EventSeverity;
  tenant_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

// Job execution status from job_execution_summary view
export interface JobStatus {
  job_name: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_run_at: string | null;
  status: 'OK' | 'DELAYED' | 'FAILED' | 'NEVER_RAN';
  runs_24h: number;
  success_24h: number;
  failures_24h: number;
  items_processed_24h: number;
  runs_7d: number;
  items_processed_7d: number;
}

// Individual health check result
export interface HealthCheck {
  name: string;
  status: HealthStatus;
  lastCheck: string | null;
  reason?: string;
  recommendation?: string;
}

// Aggregated system health
export interface SystemHealth {
  overall: HealthStatus;
  checks: HealthCheck[];
  summary: {
    ok: number;
    degraded: number;
    critical: number;
  };
  updatedAt: string;
}

// Alert for the alert system (P4.1.D)
export interface Alert {
  id: string;
  type: 'JOB_FAILURE' | 'BILLING_ISSUE' | 'SECURITY_BREACH' | 'MEMBERSHIP_SPIKE' | 'SYSTEM_ERROR';
  severity: EventSeverity;
  title: string;
  description: string;
  timestamp: string;
  dismissed: boolean;
  tenant_id?: string;
  event_type?: string;
  metadata?: Record<string, unknown>;
}

// Constants for health classification thresholds
export const HEALTH_THRESHOLDS = {
  // Job is considered delayed if not run in this many hours
  JOB_DELAY_WARNING_HOURS: 24,
  JOB_DELAY_CRITICAL_HOURS: 48,
  // Billing failures threshold for critical status
  BILLING_FAILURES_CRITICAL: 3,
  BILLING_FAILURES_WARNING: 1,
} as const;

// Job name to human-readable mapping
export const JOB_DISPLAY_NAMES: Record<string, string> = {
  'JOB_EXPIRE_MEMBERSHIPS_RUN': 'Expire Memberships',
  'JOB_CLEANUP_ABANDONED_RUN': 'Cleanup Abandoned',
  'JOB_CHECK_TRIALS_RUN': 'Check Trials',
  'JOB_EXPIRE_TRIALS_RUN': 'Expire Trials',
  'JOB_PENDING_DELETE_RUN': 'Pending Delete',
  'JOB_PRE_EXPIRATION_RUN': 'Pre-Expiration Notifications',
  'JOB_YOUTH_TRANSITION_RUN': 'Youth Transition',
  'JOB_PENDING_PAYMENT_GC_RUN': 'Pending Payment GC',
};

// Get human-readable job name
export function getJobDisplayName(jobName: string): string {
  return JOB_DISPLAY_NAMES[jobName] || jobName.replace('JOB_', '').replace('_RUN', '').replace(/_/g, ' ');
}
