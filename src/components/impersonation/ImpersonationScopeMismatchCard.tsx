/**
 * ============================================================================
 * 🔐 ImpersonationScopeMismatchCard — Blocked State for Slug Mismatch
 * ============================================================================
 *
 * Shown when a SUPERADMIN_GLOBAL user is impersonating tenant A but the URL
 * points to tenant B. This is a hard security boundary — no silent redirect.
 *
 * BY DESIGN: Uses BlockedStateCard for institutional UX consistency.
 * BY DESIGN: Offers exactly two actions — end impersonation or go to admin.
 *
 * SAFE GOLD: Zero side effects. Purely declarative.
 * ============================================================================
 */

import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { useImpersonationScope } from '@/hooks/useImpersonationScope';

interface ImpersonationScopeMismatchCardProps {
  /** The slug from the URL that does NOT match the impersonation scope */
  urlSlug: string;
}

export function ImpersonationScopeMismatchCard({ urlSlug }: ImpersonationScopeMismatchCardProps) {
  const navigate = useNavigate();
  const { clearImpersonationScope, scope } = useImpersonationScope();

  return (
    <BlockedStateCard
      icon={ShieldAlert}
      iconVariant="warning"
      titleKey="impersonation.scopeMismatch"
      descriptionKey="impersonation.scopeMismatchDesc"
      hintKey="impersonation.scopeMismatchHint"
      actions={[
        {
          labelKey: 'impersonation.endSession',
          onClick: () => clearImpersonationScope(`slug_mismatch:url=${urlSlug},scope=${scope.targetTenantSlug}`),
        },
        {
          labelKey: 'impersonation.goToAdmin',
          onClick: () => navigate('/admin'),
          variant: 'outline' as const,
        },
      ]}
    />
  );
}
