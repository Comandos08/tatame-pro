/**
 * 🔐 ImpersonationBanner — Global Alert Banner for Active Impersonation
 * 
 * Displays a prominent, always-visible banner when a superadmin
 * is impersonating a tenant. Shows:
 * - Target tenant name
 * - Remaining time before expiration
 * - End impersonation button
 * 
 * SECURITY: Visual indicator that impersonation mode is active.
 * Cannot be hidden or dismissed while session is active.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Clock, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useI18n } from '@/contexts/I18nContext';

export function ImpersonationBanner() {
  const { isImpersonating, session, remainingMinutes, endImpersonation } = useImpersonation();
  const { t } = useI18n();

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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className={`
          fixed top-0 left-0 right-0 z-[100] 
          px-4 py-2
          ${isExpiringSoon 
            ? 'bg-gradient-to-r from-destructive to-destructive/90' 
            : 'bg-gradient-to-r from-warning to-warning/90'
          }
          text-warning-foreground
          shadow-lg
        `}
      >
        <div className="container mx-auto flex items-center justify-between gap-4">
          {/* Left: Icon + Message */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isExpiringSoon ? (
                <AlertTriangle className="h-5 w-5 animate-pulse" />
              ) : (
                <Shield className="h-5 w-5" />
              )}
              <span className="font-semibold text-sm md:text-base">
                {t('impersonation.activeBanner')}
              </span>
            </div>
            <span className="hidden sm:inline text-sm opacity-90">—</span>
            <span className="hidden sm:inline font-medium text-sm">
              {session.targetTenantName}
            </span>
          </div>

          {/* Center: Timer */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            <span className={isExpiringSoon ? 'font-bold animate-pulse' : 'font-medium'}>
              {remainingMinutes !== null 
                ? `${t('impersonation.expiresIn')} ${formatTime(remainingMinutes)}`
                : t('impersonation.calculating')
              }
            </span>
          </div>

          {/* Right: End Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => endImpersonation()}
            className="flex items-center gap-2 bg-background/20 hover:bg-background/30 text-inherit border-0"
          >
            <X className="h-4 w-4" />
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
