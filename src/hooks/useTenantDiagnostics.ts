/**
 * TENANT DIAGNOSTICS HOOK — Read-Only System State
 * 
 * CONSTRAINTS:
 * 1. Strictly READ-ONLY — no mutations
 * 2. No PII exposure — only operation types and timestamps
 * 3. Explicit distinction between "no data" vs "no permission" (RLS)
 * 4. Purpose: diagnostics and support
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TenantBillingState } from '@/lib/billing/resolveTenantBillingState';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import type { AsyncState } from '@/types/async';

export type DiagnosticsStatus = 'loading' | 'success' | 'no_data' | 'no_permission' | 'error';

export interface DecisionLogEntry {
  id: string;
  operation: string | null;
  severity: string;
  created_at: string;
}

export interface SecurityEventEntry {
  id: string;
  event_type: string;
  severity: string;
  created_at: string;
}

export interface DiagnosticsData {
  status: DiagnosticsStatus;
  errorMessage?: string;
  
  // Billing state summary (no PII)
  billingStatus: string | null;
  billingSource: string | null;
  isManualOverride: boolean;
  
  // Recent decision logs (sanitized - only operation, severity, timestamp)
  recentDecisions: DecisionLogEntry[];
  decisionsStatus: DiagnosticsStatus;
  
  // Recent security events (sanitized)
  recentSecurityEvents: SecurityEventEntry[];
  securityEventsStatus: DiagnosticsStatus;
  
  // Timestamps
  lastSuccessfulResolution: string | null;
  dataFetchedAt: string;
}

/**
 * Determines if an error is RLS-related (no permission)
 */
function isRlsError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  
  // PostgreSQL RLS-related error codes
  const rlsCodes = ['PGRST116', '42501', 'PGRST301'];
  if (error.code && rlsCodes.includes(error.code)) return true;
  
  // Message-based detection
  const rlsMessages = ['permission denied', 'row-level security', 'policy', 'insufficient privilege'];
  if (error.message && rlsMessages.some(m => error.message!.toLowerCase().includes(m))) return true;
  
  return false;
}

export function useTenantDiagnostics(tenantId: string | null | undefined, billingState?: TenantBillingState | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tenant-diagnostics', tenantId],
    queryFn: async (): Promise<DiagnosticsData> => {
      const now = new Date().toISOString();
      
      if (!tenantId) {
        return {
          status: 'no_data',
          billingStatus: null,
          billingSource: null,
          isManualOverride: false,
          recentDecisions: [],
          decisionsStatus: 'no_data',
          recentSecurityEvents: [],
          securityEventsStatus: 'no_data',
          lastSuccessfulResolution: null,
          dataFetchedAt: now,
        };
      }

      // Fetch recent decision logs (last 10, sanitized)
      let recentDecisions: DecisionLogEntry[] = [];
      let decisionsStatus: DiagnosticsStatus = 'success';
      
      const { data: decisions, error: decisionsError } = await supabase
        .from('decision_logs')
        .select('id, operation, severity, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (decisionsError) {
        decisionsStatus = isRlsError(decisionsError) ? 'no_permission' : 'error';
      } else if (!decisions || decisions.length === 0) {
        decisionsStatus = 'no_data';
      } else {
        recentDecisions = decisions;
      }

      // Fetch recent security events (last 10, sanitized)
      let recentSecurityEvents: SecurityEventEntry[] = [];
      let securityEventsStatus: DiagnosticsStatus = 'success';
      
      const { data: securityEvents, error: securityError } = await supabase
        .from('security_events')
        .select('id, event_type, severity, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (securityError) {
        securityEventsStatus = isRlsError(securityError) ? 'no_permission' : 'error';
      } else if (!securityEvents || securityEvents.length === 0) {
        securityEventsStatus = 'no_data';
      } else {
        recentSecurityEvents = securityEvents;
      }

      // Find last successful identity resolution
      const lastResolution = recentDecisions.find(d => 
        d.operation === 'identity_resolved' && d.severity === 'INFO'
      );

      // Determine overall status
      let overallStatus: DiagnosticsStatus = 'success';
      if (decisionsStatus === 'no_permission' || securityEventsStatus === 'no_permission') {
        overallStatus = 'no_permission';
      } else if (decisionsStatus === 'error' || securityEventsStatus === 'error') {
        overallStatus = 'error';
      } else if (decisionsStatus === 'no_data' && securityEventsStatus === 'no_data') {
        overallStatus = 'no_data';
      }

      return {
        status: overallStatus,
        billingStatus: billingState?.status || null,
        billingSource: billingState?.source || null,
        isManualOverride: billingState?.isManualOverride || false,
        recentDecisions,
        decisionsStatus,
        recentSecurityEvents,
        securityEventsStatus,
        lastSuccessfulResolution: lastResolution?.created_at || null,
        dataFetchedAt: now,
      };
    },
    enabled: !!tenantId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const asyncState: AsyncState<DiagnosticsData> = normalizeAsyncState({
    data,
    isLoading,
    isError: !!error,
    error,
  });

  return {
    diagnostics: data,
    isLoading,
    error,
    refetch,
    status: data?.status ?? (isLoading ? 'loading' : 'no_data'),
    asyncState,
  };
}

/**
 * Platform-level diagnostics for superadmin (no tenant context)
 */
export function usePlatformDiagnostics() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-diagnostics'],
    queryFn: async () => {
      const now = new Date().toISOString();

      // Fetch tenant summary (no PII)
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, slug, name, is_active')
        .order('created_at', { ascending: false })
        .limit(50);

      let tenantsStatus: DiagnosticsStatus = 'success';
      if (tenantsError) {
        tenantsStatus = isRlsError(tenantsError) ? 'no_permission' : 'error';
      } else if (!tenants || tenants.length === 0) {
        tenantsStatus = 'no_data';
      }

      // Fetch recent platform-wide decision logs
      const { data: decisions, error: decisionsError } = await supabase
        .from('decision_logs')
        .select('id, operation, severity, created_at, tenant_id')
        .order('created_at', { ascending: false })
        .limit(20);

      let decisionsStatus: DiagnosticsStatus = 'success';
      if (decisionsError) {
        decisionsStatus = isRlsError(decisionsError) ? 'no_permission' : 'error';
      } else if (!decisions || decisions.length === 0) {
        decisionsStatus = 'no_data';
      }

      return {
        tenants: tenants || [],
        tenantsStatus,
        recentDecisions: decisions || [],
        decisionsStatus,
        dataFetchedAt: now,
      };
    },
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  });

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
