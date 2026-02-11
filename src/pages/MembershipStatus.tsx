/**
 * 🔐 MEMBERSHIP STATUS PAGE
 * Displays the current status of a user's membership request.
 * 
 * Handles states: PENDING_REVIEW, APPROVED, ACTIVE, REJECTED, CANCELLED
 * Route: /:tenantSlug/membership/status
 * 
 * Features:
 * - Retry payment for CANCELLED + NOT_PAID memberships (P3.RETRY.PAYMENT)
 * - Double-click protection with retryInitiated state
 * - CAPTCHA validation via TurnstileWidget
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft, Loader2, CheckCircle2, XCircle, AlertCircle, ArrowRight, CreditCard } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthenticatedHeader } from '@/components/auth/AuthenticatedHeader';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate } from '@/lib/i18n/formatters';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

type MembershipStatusValue = 'PENDING_REVIEW' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

interface MembershipData {
  id: string;
  status: MembershipStatusValue;
  payment_status: 'PAID' | 'NOT_PAID' | null;
  created_at: string;
  rejection_reason?: string | null;
}

const STATUS_CONFIG: Record<MembershipStatusValue, {
  icon: typeof Clock;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
  showCta: boolean;
  ctaType: 'portal' | 'newRequest' | 'renew' | 'none';
}> = {
  PENDING_REVIEW: {
    icon: Clock,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    titleKey: 'membershipStatus.pendingReview',
    descKey: 'membershipStatus.pendingReviewDesc',
    showCta: false,
    ctaType: 'none',
  },
  APPROVED: {
    icon: CheckCircle2,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    titleKey: 'membershipStatus.approved',
    descKey: 'membershipStatus.approvedDesc',
    showCta: true,
    ctaType: 'portal',
  },
  ACTIVE: {
    icon: CheckCircle2,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    titleKey: 'membershipStatus.approved',
    descKey: 'membershipStatus.approvedDesc',
    showCta: true,
    ctaType: 'portal',
  },
  REJECTED: {
    icon: XCircle,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    titleKey: 'membershipStatus.rejected',
    descKey: 'membershipStatus.rejectedDesc',
    showCta: true,
    ctaType: 'newRequest',
  },
  CANCELLED: {
    icon: AlertCircle,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    titleKey: 'membershipStatus.cancelled',
    descKey: 'membershipStatus.cancelledDesc',
    showCta: true,
    ctaType: 'newRequest',
  },
  EXPIRED: {
    icon: AlertCircle,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    titleKey: 'portal.expiredTitle',
    descKey: 'portal.expiredDescHumanized',
    showCta: true,
    ctaType: 'renew',
  },
};

export default function MembershipStatus() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { t, locale } = useI18n();
  
  const [membership, setMembership] = useState<MembershipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Retry payment states (AJUSTE #5)
  const [isRetrying, setIsRetrying] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryInitiated, setRetryInitiated] = useState(false);

  // Fetch most recent membership for this user
  useEffect(() => {
    const fetchMembership = async () => {
      if (!tenant?.id || !currentUser?.id || !isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        // First try to find by linked athlete
        const athleteResult = await (supabase.from('athletes') as any)
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('profile_id', currentUser.id)
          .maybeSingle();
        
        const athleteData = athleteResult?.data as { id: string } | null;

        let data: MembershipData | null = null;

        if (athleteData?.id) {
          const result = await (supabase.from('memberships') as any)
            .select('id, status, payment_status, created_at, rejection_reason')
            .eq('tenant_id', tenant.id)
            .eq('athlete_id', athleteData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          data = result?.data as MembershipData | null;
        } else {
          const result = await (supabase.from('memberships') as any)
            .select('id, status, payment_status, created_at, rejection_reason')
            .eq('tenant_id', tenant.id)
            .eq('applicant_profile_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          data = result?.data as MembershipData | null;
        }

        setMembership(data);
      } catch (error) {
        logger.error('Error fetching membership:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembership();
  }, [tenant?.id, currentUser?.id, isAuthenticated]);

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    navigate(`/${tenantSlug}/login`, { replace: true });
    return null;
  }

  // No membership found - redirect to membership flow
  if (!membership) {
    navigate(`/${tenantSlug}/membership/new`, { replace: true });
    return null;
  }

  const status = membership.status.toUpperCase() as MembershipStatusValue;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING_REVIEW;
  const IconComponent = config.icon;

  // Determine if retry payment is available (CANCELLED + NOT_PAID + not initiated)
  const canRetryPayment = 
    status === 'CANCELLED' && 
    membership.payment_status === 'NOT_PAID' &&
    !retryInitiated;

  const createdDate = membership.created_at
    ? formatDate(membership.created_at, locale, { dateStyle: 'long' })
    : null;

  // Handler for retry payment (AJUSTE #5 - double-click protection)
  const handleRetryPayment = async () => {
    // Prevent double-click
    if (isRetrying || retryInitiated) {
      return;
    }
    
    if (!captchaToken) {
      toast.error(t('membership.errorCaptchaRequired'));
      return;
    }
    
    setIsRetrying(true);
    setRetryError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke(
        'retry-membership-payment',
        {
          body: {
            membershipId: membership.id,
            tenantSlug,
            successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
            cancelUrl: `${window.location.origin}/${tenantSlug}/membership/status`,
            captchaToken,
          },
        }
      );
      
      if (error || data?.error) {
        const errorMsg = data?.error || error?.message || 'Unknown error';
        
        // Check if retry was already initiated by another click
        if (errorMsg.includes('STATUS_CHANGED') || errorMsg.includes('already_pending')) {
          setRetryInitiated(true);
          toast.info(t('membership.retryAlreadyInitiated'));
          return;
        }
        
        throw new Error(errorMsg);
      }
      
      if (!data?.url) {
        throw new Error('No checkout URL returned');
      }
      
      // Mark as initiated before redirecting
      setRetryInitiated(true);
      window.location.href = data.url;
      
    } catch (err) {
      logger.error('Retry payment error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to retry payment';
      setRetryError(errorMessage);
      toast.error(t('membership.errorPaymentSession'));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCtaClick = () => {
    switch (config.ctaType) {
      case 'portal':
        navigate(`/${tenantSlug}/portal`, { replace: true });
        break;
      case 'newRequest':
        navigate(`/${tenantSlug}/membership/new`, { replace: true });
        break;
      case 'renew':
        navigate(`/${tenantSlug}/membership/renew`, { replace: true });
        break;
    }
  };

  const getCtaLabel = () => {
    switch (config.ctaType) {
      case 'portal':
        return t('membershipStatus.continueToPortal');
      case 'newRequest':
        return t('membershipStatus.newRequest');
      case 'renew':
        return t('membership.renewal');
      default:
        return t('membershipStatus.accessPortal');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AuthenticatedHeader
        tenantName={tenant?.name}
        tenantLogo={tenant?.logoUrl}
        tenantSlug={tenantSlug}
      />
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/${tenantSlug}`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </motion.div>

        {/* Status Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="text-center">
            <CardHeader className="pb-4">
              <div className={`mx-auto mb-4 h-16 w-16 rounded-full ${config.iconBg} flex items-center justify-center`}>
                <IconComponent className={`h-8 w-8 ${config.iconColor}`} />
              </div>
              <CardTitle className="text-xl">
                {t(config.titleKey)}
              </CardTitle>
              <CardDescription>
                {tenant?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p>{t(config.descKey)}</p>
              </div>

              {/* Show rejection reason if available */}
              {status === 'REJECTED' && membership.rejection_reason && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-sm text-left">
                  <p className="font-medium text-destructive mb-1">{t('approval.rejectionReason')}:</p>
                  <p className="text-muted-foreground">{membership.rejection_reason}</p>
                </div>
              )}

              {/* Request date for pending status */}
              {status === 'PENDING_REVIEW' && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">
                    {t('membershipStatus.estimatedTime')}
                  </p>
                  {createdDate && (
                    <p>
                      {t('approval.requestedAt')}: {createdDate}
                    </p>
                  )}
                </div>
              )}

              {/* Retry Payment Section (CANCELLED + NOT_PAID) */}
              {canRetryPayment && !retryInitiated && (
                <div className="space-y-4">
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-sm text-left">
                    <p className="font-medium text-warning mb-1">
                      {t('membership.retryPaymentTitle')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('membership.retryPaymentDesc')}
                    </p>
                  </div>
                  
                  <TurnstileWidget
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                  />
                  
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleRetryPayment}
                    disabled={isRetrying || !captchaToken}
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {t('membership.retryPayment')}
                      </>
                    )}
                  </Button>
                  
                  {retryError && (
                    <p className="text-sm text-destructive text-center">{retryError}</p>
                  )}
                </div>
              )}

              {/* Message when retry was already initiated (AJUSTE #5) */}
              {retryInitiated && status === 'CANCELLED' && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm text-center">
                  <p className="text-primary font-medium">{t('membership.retryAlreadyInitiated')}</p>
                </div>
              )}

              {/* CTA Button - show only if not eligible for retry */}
              {!canRetryPayment && !retryInitiated && config.showCta && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleCtaClick}
                >
                  {getCtaLabel()}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              
              {!canRetryPayment && !retryInitiated && !config.showCta && (
                <Button
                  disabled
                  className="w-full"
                  size="lg"
                >
                  {t('membershipStatus.accessPortal')}
                </Button>
              )}

              {status === 'PENDING_REVIEW' && (
                <p className="text-xs text-muted-foreground">
                  {t('membershipSuccess.accessViaEmail')}
                </p>
              )}

              {/* Contact organization link for rejected/cancelled (when retry not available) */}
              {(status === 'REJECTED' || (status === 'CANCELLED' && !canRetryPayment && !retryInitiated)) && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate(`/${tenantSlug}`)}
                >
                  {t('membershipStatus.contactOrg')}
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
