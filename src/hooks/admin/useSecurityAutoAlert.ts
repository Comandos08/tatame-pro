/**
 * 🔐 useSecurityAutoAlert — O02 SAFE GOLD
 * 
 * Detects CRITICAL security posture and emits a single audit event per session.
 * READ-ONLY — Zero mutations. Fire-once per mount lifecycle.
 * Access: SUPERADMIN_GLOBAL only.
 */

import { useEffect, useRef } from 'react';
import { useSecurityPosture } from './useSecurityPosture';
import { useCurrentUser } from '@/contexts/AuthContext';
import { auditEvent } from '@/lib/audit/auditEvent';

export function useSecurityAutoAlert() {
  const { postureState, report } = useSecurityPosture();
  const { isGlobalSuperadmin, currentUser } = useCurrentUser();

  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!isGlobalSuperadmin) return;
    if (postureState !== 'CRITICAL') return;
    if (!report?.ok) return;
    if ((report.summary?.policies?.critical ?? 0) <= 0) return;
    if (hasTriggeredRef.current) return;

    try {
      auditEvent({
        event_type: 'SECURITY_POSTURE_CRITICAL_DETECTED',
        tenant_id: null,
        profile_id: currentUser?.id ?? null,
        effective_role: 'SUPERADMIN_GLOBAL',
        metadata: {
          criticalPolicies: report.summary.policies.critical,
          highPolicies: report.summary.policies.high ?? 0,
        },
      });

      hasTriggeredRef.current = true;
    } catch {
      // Silent fail — never break UI
    }
  }, [
    postureState,
    isGlobalSuperadmin,
    report?.summary?.policies?.critical,
    currentUser?.id,
  ]);
}
