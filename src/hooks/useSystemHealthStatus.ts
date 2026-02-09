/**
 * 🔍 useSystemHealthStatus — P4.1.B
 * 
 * Hook that aggregates platform health from jobs, billing, and critical events.
 * Returns OK / DEGRADED / CRITICAL classification with reasons.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import type { AsyncState } from '@/types/async';
import { 
  HealthStatus, 
  HealthCheck, 
  SystemHealth, 
  JobStatus,
  HEALTH_THRESHOLDS,
  getJobDisplayName 
} from '@/types/observability';

interface JobExecutionRow {
  job_name: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_run_at: string | null;
  runs_24h: number;
  success_24h: number;
  failures_24h: number;
  items_processed_24h: number;
  runs_7d: number;
  items_processed_7d: number;
}

interface CriticalEventRow {
  id: string;
  source: string;
  event_type: string;
  category: string;
  tenant_id: string | null;
  created_at: string;
  severity: string;
}

function classifyJobStatus(job: JobExecutionRow): JobStatus {
  const now = new Date();
  const lastRun = job.last_run_at ? new Date(job.last_run_at) : null;
  const lastFailure = job.last_failure_at ? new Date(job.last_failure_at) : null;
  
  // Never ran
  if (!lastRun) {
    return {
      ...job,
      status: 'NEVER_RAN',
    };
  }
  
  const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
  
  // Check for recent failures
  if (lastFailure && job.failures_24h > 0) {
    const lastSuccess = job.last_success_at ? new Date(job.last_success_at) : null;
    // If last failure is more recent than last success, mark as failed
    if (!lastSuccess || lastFailure > lastSuccess) {
      return {
        ...job,
        status: 'FAILED',
      };
    }
  }
  
  // Check for delays
  if (hoursSinceLastRun >= HEALTH_THRESHOLDS.JOB_DELAY_CRITICAL_HOURS) {
    return {
      ...job,
      status: 'DELAYED',
    };
  }
  
  if (hoursSinceLastRun >= HEALTH_THRESHOLDS.JOB_DELAY_WARNING_HOURS) {
    return {
      ...job,
      status: 'DELAYED',
    };
  }
  
  return {
    ...job,
    status: 'OK',
  };
}

function jobStatusToHealth(jobs: JobStatus[]): HealthCheck {
  const failed = jobs.filter(j => j.status === 'FAILED');
  const delayed = jobs.filter(j => j.status === 'DELAYED');
  const neverRan = jobs.filter(j => j.status === 'NEVER_RAN');
  const ok = jobs.filter(j => j.status === 'OK');
  
  const lastCheck = jobs.reduce((latest, job) => {
    if (!job.last_run_at) return latest;
    if (!latest) return job.last_run_at;
    return new Date(job.last_run_at) > new Date(latest) ? job.last_run_at : latest;
  }, null as string | null);
  
  if (failed.length > 0) {
    return {
      name: 'Background Jobs',
      status: 'CRITICAL',
      lastCheck,
      reason: `${failed.length} job(s) failing: ${failed.map(j => getJobDisplayName(j.job_name)).join(', ')}`,
      recommendation: 'Check edge function logs for errors',
    };
  }
  
  if (delayed.length > 0) {
    const maxDelay = Math.max(...delayed.map(j => {
      const lastRun = j.last_run_at ? new Date(j.last_run_at) : new Date(0);
      return (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
    }));
    
    return {
      name: 'Background Jobs',
      status: maxDelay >= HEALTH_THRESHOLDS.JOB_DELAY_CRITICAL_HOURS ? 'CRITICAL' : 'DEGRADED',
      lastCheck,
      reason: `${delayed.length} job(s) delayed: ${delayed.map(j => getJobDisplayName(j.job_name)).join(', ')}`,
      recommendation: 'Verify cron schedules are active',
    };
  }
  
  if (neverRan.length > 0 && ok.length === 0) {
    return {
      name: 'Background Jobs',
      status: 'UNKNOWN',
      lastCheck: null,
      reason: 'No job execution history found',
      recommendation: 'Jobs may not be configured yet',
    };
  }
  
  return {
    name: 'Background Jobs',
    status: 'OK',
    lastCheck,
    reason: `${ok.length} jobs running normally`,
  };
}

function criticalEventsToHealth(events: CriticalEventRow[]): HealthCheck {
  const now = new Date();
  const last24h = events.filter(e => {
    const eventDate = new Date(e.created_at);
    return (now.getTime() - eventDate.getTime()) < 24 * 60 * 60 * 1000;
  });
  
  const highSeverity = last24h.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL');
  const billingFailures = last24h.filter(e => 
    e.event_type === 'TENANT_PAYMENT_FAILED' || 
    e.event_type === 'MEMBERSHIP_PAYMENT_RETRY_FAILED'
  );
  
  const lastCheck = events.length > 0 ? events[0].created_at : null;
  
  if (billingFailures.length >= HEALTH_THRESHOLDS.BILLING_FAILURES_CRITICAL) {
    return {
      name: 'Critical Events',
      status: 'CRITICAL',
      lastCheck,
      reason: `${billingFailures.length} billing failures in last 24h`,
      recommendation: 'Review Stripe dashboard for payment issues',
    };
  }
  
  if (highSeverity.length > 0) {
    return {
      name: 'Critical Events',
      status: 'DEGRADED',
      lastCheck,
      reason: `${highSeverity.length} high-severity events in last 24h`,
      recommendation: 'Review security timeline for details',
    };
  }
  
  if (billingFailures.length > 0) {
    return {
      name: 'Critical Events',
      status: 'DEGRADED',
      lastCheck,
      reason: `${billingFailures.length} billing issue(s) detected`,
      recommendation: 'Monitor payment retries',
    };
  }
  
  return {
    name: 'Critical Events',
    status: 'OK',
    lastCheck,
    reason: 'No critical events in last 24h',
  };
}

function aggregateOverallStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some(c => c.status === 'CRITICAL')) return 'CRITICAL';
  if (checks.some(c => c.status === 'DEGRADED')) return 'DEGRADED';
  if (checks.every(c => c.status === 'UNKNOWN')) return 'UNKNOWN';
  return 'OK';
}

export function useSystemHealthStatus(): ReturnType<typeof useQuery<SystemHealth>> & { asyncState: AsyncState<SystemHealth> } {
  const query = useQuery({
    queryKey: ['system-health-status'],
    queryFn: async (): Promise<SystemHealth> => {
      // Fetch job execution summary
      const { data: jobsData, error: jobsError } = await supabase
        .from('job_execution_summary')
        .select('*');
      
      if (jobsError) {
        console.error('[useSystemHealthStatus] Jobs query error:', jobsError.message);
      }
      
      // Fetch critical events from last 7 days
      const { data: eventsData, error: eventsError } = await supabase
        .from('observability_critical_events')
        .select('id, source, event_type, category, tenant_id, created_at, severity')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (eventsError) {
        console.error('[useSystemHealthStatus] Events query error:', eventsError.message);
      }
      
      // Classify jobs
      const jobs: JobStatus[] = (jobsData || []).map(classifyJobStatus);
      const jobsHealth = jobStatusToHealth(jobs);
      
      // Classify critical events
      const eventsHealth = criticalEventsToHealth((eventsData || []) as CriticalEventRow[]);
      
      const checks: HealthCheck[] = [jobsHealth, eventsHealth];
      const overall = aggregateOverallStatus(checks);
      
      return {
        overall,
        checks,
        summary: {
          ok: checks.filter(c => c.status === 'OK').length,
          degraded: checks.filter(c => c.status === 'DEGRADED').length,
          critical: checks.filter(c => c.status === 'CRITICAL').length,
        },
        updatedAt: new Date().toISOString(),
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const asyncState: AsyncState<SystemHealth> = normalizeAsyncState(query);

  return { ...query, asyncState };
}

export function useJobsHealth() {
  return useQuery({
    queryKey: ['jobs-health'],
    queryFn: async (): Promise<JobStatus[]> => {
      const { data, error } = await supabase
        .from('job_execution_summary')
        .select('*');
      
      if (error) {
        console.error('[useJobsHealth] Query error:', error.message);
        return [];
      }
      
      return (data || []).map(classifyJobStatus);
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
