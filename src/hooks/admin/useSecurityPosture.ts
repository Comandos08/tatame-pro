/**
 * 🔐 useSecurityPosture — O01.1 SAFE GOLD
 * 
 * Fetches audit-rls edge function and derives security posture state.
 * READ-ONLY — Zero mutations. No caching beyond hook lifecycle.
 * Access: SUPERADMIN_GLOBAL only (enforced by edge function).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// TYPES
// ============================================

export type SecurityPostureState = 'LOADING' | 'OK' | 'WARNING' | 'CRITICAL' | 'ERROR';

export interface PolicyFinding {
  table: string;
  policy: string;
  cmd: string;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'SAFE';
  reason: string;
  roles: string[];
  permissive: string;
}

export interface DefinerFinding {
  name: string;
  schema: string;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'SAFE';
  reason: string;
}

export interface PiiExposureFinding {
  table: string;
  policy: string;
  cmd: string;
  risk: 'CRITICAL' | 'HIGH' | 'SAFE';
  reason: string;
}

export interface SecurityPostureSummary {
  policies: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    safe: number;
  };
  securityDefinerFunctions: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    safe: number;
  };
  tablesWithoutRls: number;
  piiExposure?: {
    total: number;
    critical: number;
    high: number;
    safe: number;
  };
}

export interface SecurityPostureReport {
  ok: boolean;
  timestamp: string;
  summary: SecurityPostureSummary;
  policies: PolicyFinding[];
  securityDefinerFunctions: DefinerFinding[];
  tablesWithoutRls: string[];
  piiExposure?: PiiExposureFinding[];
  allPolicies: PolicyFinding[];
  allDefinerFunctions: DefinerFinding[];
  allPiiExposure?: PiiExposureFinding[];
}

// ============================================
// STATE DERIVATION (Pure function)
// ============================================

export function deriveSecurityPosture(report: SecurityPostureReport): SecurityPostureState {
  if (!report.ok || !report.summary) return 'ERROR';
  if (report.summary.policies.critical > 0) return 'CRITICAL';
  if (report.summary.policies.high > 0) return 'WARNING';
  return 'OK';
}

// ============================================
// HOOK
// ============================================

export function useSecurityPosture() {
  const query = useQuery<SecurityPostureReport>({
    queryKey: ['security-posture-audit'],
    queryFn: async ({ signal }): Promise<SecurityPostureReport> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('NOT_AUTHENTICATED');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-rls`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          signal,
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.messageKey || `HTTP_${response.status}`);
      }

      const report: SecurityPostureReport = await response.json();
      return report;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const postureState: SecurityPostureState = (() => {
    if (query.isLoading) return 'LOADING';
    if (query.isError) return 'ERROR';
    if (!query.data) return 'ERROR';
    return deriveSecurityPosture(query.data);
  })();

  return {
    ...query,
    postureState,
    report: query.data ?? null,
  };
}
