/**
 * IDENTITY LOADING SCREEN — UX-Only Timeout Indicator
 * 
 * CRITICAL CONSTRAINTS (SSF Constitution compliant):
 * 1. This timeout is EXCLUSIVELY for user feedback
 * 2. It does NOT trigger navigation
 * 3. It does NOT alter identity state
 * 4. It does NOT cause implicit redirects
 * 5. The actual timeout is handled by IdentityContext (12s abort)
 * 
 * This UI feedback exists to:
 * - Inform users when loading takes longer than expected
 * - Provide explicit escape hatch (Retry/Logout buttons)
 * - Eliminate silent/indefinite loading states
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

interface IdentityLoadingScreenProps {
  onRetry: () => void;
  onLogout: () => void;
}

/**
 * UX_TIMEOUT_MS is for UI feedback ONLY.
 * The actual hard timeout (12s) is in IdentityContext.
 * This UI feedback appears after 8 seconds to inform users.
 */
const UX_TIMEOUT_MS = 8000;

export function IdentityLoadingScreen({ onRetry, onLogout }: IdentityLoadingScreenProps) {
  const { t } = useI18n();
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  useEffect(() => {
    /**
     * UX-ONLY TIMEOUT: Show warning after 8 seconds.
     * 
     * CONSTRAINT: This ONLY shows UI feedback.
     * - Does NOT navigate
     * - Does NOT change identity state
     * - Does NOT cause redirects
     * The real timeout (12s) is in IdentityContext which transitions to ERROR state.
     */
    const timer = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, UX_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  if (showTimeoutWarning) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-warning" />
            </div>
            <CardTitle>{t('identityLoading.timeout.title')}</CardTitle>
            <CardDescription>
              {t('identityLoading.timeout.message')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              {t('identityLoading.timeout.suggestion')}
            </p>
            <Button onClick={onRetry} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('identityLoading.timeout.retry')}
            </Button>
            <Button variant="outline" onClick={onLogout} className="w-full">
              {t('identityLoading.timeout.logout')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal loading state
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('common.verifyingAccess')}</p>
      </div>
    </div>
  );
}

export default IdentityLoadingScreen;
