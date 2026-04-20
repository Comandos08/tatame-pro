/**
 * 🔐 useSecurityPosture — O01.1 SAFE GOLD
 * 
 * Fetches audit-rls edge function and derives security posture state.
 * READ-ONLY — Zero mutations. No caching beyond hook lifecycle.
 * Access: SUPERADMIN_GLOBAL only (enforced by edge function).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

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
  const { isGlobalSuperadmin } = useCurrentUser();
  const { isImpersonating } = useImpersonation();

  // The audit-rls edge function is SUPERADMIN_GLOBAL-only; tenant admins and
  // superadmins inside an impersonation context both get 403. Previously this
  // hook fired unconditionally and surfaced the 403 as a console error on
  // every tenant-context page load. Gate the query so it only runs when the
  // effective caller is a real (non-impersonated) superadmin. The
  // tenant-scoped fallback in useTenantSecurityHealth handles other cases.
  const canAccess = isGlobalSuperadmin && !isImpersonating;

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
        // 401/403 are expected when the caller isn't a SUPERADMIN_GLOBAL (the
        // frontend gate `canAccess` prevents this in the happy path, but race
        // conditions between session refresh and role hydration can briefly
        // fire the request before isGlobalSuperadmin stabilizes). Throw a
        // typed error so the hook can surface them as "not authorized"
        // instead of a noisy ERROR state that spams the console on every
        // mount of SecurityPostureBanner / useTenantOnboarding.
        const body = await response.json().catch(() => ({}));
        const error = new Error(body.messageKey || `HTTP_${response.status}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      const report: SecurityPostureReport = await response.json();
      return report;
    },
    enabled: canAccess,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    // Don't retry auth/authorization failures — retrying won't change the
    // outcome and each retry logs another 403 to the console.
    retry: (failureCount, error) => {
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
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
