/**
 * PI U18 — SystemAwarenessBanner (Presentation Only)
 *
 * Renders a global banner communicating system health/limitations.
 * If level === 'OK' → renders nothing (zero noise).
 * If UNKNOWN → renders soft info without alarmism.
 *
 * NO business logic. NO rules. Pure presentation of SystemAwarenessState.
 */

import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useSystemSelfAwareness } from '@/hooks/useSystemSelfAwareness';
import { useAccessContract } from '@/hooks/useAccessContract';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { SystemAwarenessLevel } from '@/lib/system/selfAwareness';

const LEVEL_CONFIG: Record<SystemAwarenessLevel, {
  icon: React.ElementType;
  containerClass: string;
  iconClass: string;
  textClass: string;
}> = {
  OK: {
    icon: Info,
    containerClass: '',
    iconClass: '',
    textClass: '',
  },
  INFO: {
    icon: Info,
    containerClass: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    iconClass: 'text-blue-600 dark:text-blue-400',
    textClass: 'text-blue-900 dark:text-blue-100',
  },
  WARN: {
    icon: AlertTriangle,
    containerClass: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
    iconClass: 'text-yellow-600 dark:text-yellow-400',
    textClass: 'text-yellow-900 dark:text-yellow-100',
  },
  CRITICAL: {
    icon: XCircle,
    containerClass: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    iconClass: 'text-red-600 dark:text-red-400',
    textClass: 'text-red-900 dark:text-red-100',
  },
};

export function SystemAwarenessBanner() {
  const state = useSystemSelfAwareness();
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { can } = useAccessContract(tenant?.id);
  const navigate = useNavigate();

  // OK = no banner (zero noise principle)
  if (state.level === 'OK') return null;

  const config = LEVEL_CONFIG[state.level];
  const Icon = config.icon;

  // U9 MISUSE_IMPOSSIBLE: CTA only if can() passes (fail-closed);
  // never fall through to `true` — unknown href = no CTA
  const showCTA = state.cta && (
    state.cta.href.includes('/billing') ? can('TENANT_BILLING') :
    state.cta.href.includes('/settings') ? can('TENANT_SETTINGS') :
    false // U9: unknown CTA target → deny
  );

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 ${config.containerClass}`}
      role="status"
      aria-live="polite"
      data-testid="system-awareness-banner"
      data-awareness-level={state.level}
      data-awareness-reasons={state.reasons.join(',')}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.textClass}`}>
            {t(state.messageKey)}
          </p>
          <p className={`text-xs mt-0.5 opacity-80 ${config.textClass}`}>
            {t(state.subtitleKey)}
          </p>
          {state.reasons.length > 0 && (
            <ul className={`mt-1.5 text-xs space-y-0.5 opacity-70 ${config.textClass}`}>
              {state.reasons.map((reason) => (
                <li key={reason}>
                  • {t(`selfAware.reason.${reason}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
        {showCTA && state.cta && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate(state.cta!.href)}
          >
            {t(state.cta.labelKey)}
          </Button>
        )}
      </div>
    </div>
  );
}
