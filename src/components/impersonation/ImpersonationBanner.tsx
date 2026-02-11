/**
 * 🔐 ImpersonationBanner — Global Alert Banner for Active Impersonation (C3 SAFE GOLD)
 * 
 * Displays a prominent, always-visible, non-dismissable banner when a superadmin
 * is impersonating a tenant. Shows:
 * - Target tenant name + slug
 * - Effective role
 * - Remaining time before expiration
 * - End impersonation button
 * 
 * SECURITY: Visual indicator that impersonation mode is active.
 * Cannot be hidden or dismissed while session is active.
 * C3: Purely declarative — no access decisions, no side effects.
 */


import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Clock, LogOut, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useI18n } from '@/contexts/I18nContext';

export function ImpersonationBanner() {
  const { isImpersonating, session, remainingMinutes, endImpersonation } = useImpersonation();
  const { t } = useI18n();
  const navigate = useNavigate();

  if (!isImpersonating || !session) {
    return null;
  }

  const isExpiringSoon = remainingMinutes !== null && remainingMinutes <= 10;

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const handleEndImpersonation = () => {
    endImpersonation();
    navigate('/admin');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className={`
          fixed top-0 left-0 right-0 z-[100] 
          px-4 py-2.5
          ${isExpiringSoon 
            ? 'bg-gradient-to-r from-destructive to-destructive/90' 
            : 'bg-gradient-to-r from-warning to-warning/90'
          }
          text-warning-foreground
          shadow-lg
        `}
        data-testid="impersonation-indicator"
        data-impersonation-state="ON"
        data-impersonation-role="SUPERADMIN"
        data-impersonation-tenant-id={session.targetTenantId}
      >
        <div className="container mx-auto flex items-center justify-between gap-4">
          {/* Left: Icon + Explicit message */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              {isExpiringSoon ? (
                <AlertTriangle className="h-5 w-5 animate-pulse" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
              <span className="font-semibold text-sm md:text-base whitespace-nowrap">
                {t('impersonation.c3Banner')}
              </span>
            </div>
            {/* C3: Tenant context + effective role — always visible */}
            <div className="hidden sm:flex items-center gap-2 text-sm min-w-0">
              <span className="opacity-50">|</span>
              <span className="opacity-80">{t('impersonation.tenant')}:</span>
              <span className="font-medium truncate max-w-[200px]">
                {session.targetTenantName}
              </span>
              <span className="opacity-60 text-xs">({session.targetTenantSlug})</span>
              <span className="opacity-50">•</span>
              <span className="opacity-80">{t('impersonation.effectiveRole')}:</span>
              <span className="font-medium">ADMIN_TENANT</span>
            </div>
          </div>

          {/* Center: Timer */}
          <div className="flex items-center gap-2 text-sm shrink-0">
            <Clock className="h-4 w-4" />
            <span className={isExpiringSoon ? 'font-bold animate-pulse' : 'font-medium'}>
              {remainingMinutes !== null 
                ? `${formatTime(remainingMinutes)}`
                : t('impersonation.calculating')
              }
            </span>
          </div>

          {/* Right: End Button — explicit label, no dismiss */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEndImpersonation}
            className="flex items-center gap-2 bg-background/20 hover:bg-background/30 text-inherit border-0 shrink-0"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('impersonation.endSession')}</span>
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
/**
 * Spacer component to push content down when banner is visible
 */
export function ImpersonationBannerSpacer() {
  const { isImpersonating } = useImpersonation();
  
  if (!isImpersonating) {
    return null;
  }

  return <div className="h-12" />;
}
