/**
 * SAFE GOLD — ETAPA 4
 * Página de renovação de filiação expirada
 * Rota: /:tenantSlug/membership/renew
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, Calendar, User, AlertTriangle, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { useBillingOverride } from '@/hooks/useBillingOverride';
import { ManualOverrideBanner } from '@/components/billing/ManualOverrideBanner';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { supabase } from '@/integrations/supabase/client';
import { resolveAthletePostLoginRedirect, MembershipStatus } from '@/lib/resolveAthletePostLoginRedirect';
import { MEMBERSHIP_PRICE_CENTS, MEMBERSHIP_CURRENCY } from '@/types/membership';
import { toast } from 'sonner';

interface MembershipRenewData {
  id: string;
  status: string;
  end_date: string | null;
  created_at: string;
  athlete_id: string;
  athlete_name: string;
}

export default function MembershipRenew() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { t } = useI18n();
  const { isManualOverride, canUseStripe, overrideReason, overrideAt, isLoading: billingLoading } = useBillingOverride();
  
  const [membership, setMembership] = useState<MembershipRenewData | null>(null);
  const [isLoadingMembership, setIsLoadingMembership] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Buscar membership expirada do usuário
  useEffect(() => {
    const fetchMembership = async () => {
      if (!tenant?.id || !currentUser?.id || !isAuthenticated) {
        setIsLoadingMembership(false);
        return;
      }

      try {
        // Primeiro buscar athlete vinculado
        // Cast early to avoid TS2589 (excessively deep type instantiation)
        const athleteResult = await (supabase.from('athletes') as any)
          .select('id, full_name')
          .eq('tenant_id', tenant.id)
          .eq('user_id', currentUser.id)
          .maybeSingle();
        
        const athleteData = athleteResult?.data as { id: string; full_name: string } | null;

        if (!athleteData?.id) {
          setIsLoadingMembership(false);
          return;
        }

        // Buscar membership mais recente do atleta
        const membershipResult = await (supabase.from('memberships') as any)
          .select('id, status, end_date, created_at, athlete_id')
          .eq('tenant_id', tenant.id)
          .eq('athlete_id', athleteData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const membershipData = membershipResult?.data as { 
          id: string; 
          status: string; 
          end_date: string | null; 
          created_at: string; 
          athlete_id: string;
        } | null;

        if (membershipData) {
          setMembership({
            ...membershipData,
            athlete_name: athleteData.full_name,
          });
        }
      } catch (error) {
        console.error('Error fetching membership:', error);
      } finally {
        setIsLoadingMembership(false);
      }
    };

    fetchMembership();
  }, [tenant?.id, currentUser?.id, isAuthenticated]);

  // Redirect se status não for EXPIRED
  useEffect(() => {
    if (isLoadingMembership || !tenantSlug) return;

    const status = membership?.status?.toUpperCase() as MembershipStatus;
    
    // Se não for EXPIRED, redirecionar para o destino correto
    if (status !== 'EXPIRED') {
      const redirectPath = resolveAthletePostLoginRedirect({
        tenantSlug,
        membershipStatus: status || null,
      });
      navigate(redirectPath, { replace: true });
    }
  }, [membership, isLoadingMembership, tenantSlug, navigate]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated && tenantSlug) {
      navigate(`/${tenantSlug}/login`, { replace: true });
    }
  }, [authLoading, isAuthenticated, tenantSlug, navigate]);

  const handleRenew = async () => {
    // Guard: Verificar billing override
    if (!canUseStripe) {
      toast.error(t('billing.stripeDisabled'));
      return;
    }

    if (!tenant || !membership) return;

    setIsProcessing(true);

    try {
      // Criar nova membership de renovação
      const { data: newMembership, error: membershipError } = await supabase
        .from('memberships')
        .insert({
          tenant_id: tenant.id,
          athlete_id: membership.athlete_id,
          status: 'DRAFT',
          type: 'RENEWAL', // IMPORTANTE: tipo de renovação
          price_cents: MEMBERSHIP_PRICE_CENTS,
          currency: MEMBERSHIP_CURRENCY,
          payment_status: 'NOT_PAID',
        })
        .select()
        .single();

      if (membershipError) throw membershipError;

      // Criar checkout session
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        'create-membership-checkout',
        {
          body: {
            membershipId: newMembership.id,
            tenantSlug: tenantSlug,
            successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
            cancelUrl: `${window.location.origin}/${tenantSlug}/membership/renew`,
            captchaToken: captchaToken,
          },
        }
      );

      if (checkoutError) throw checkoutError;

      if (checkoutData?.error) {
        throw new Error(checkoutData.error);
      }

      if (checkoutData?.url) {
        window.location.href = checkoutData.url;
      } else {
        throw new Error(t('membership.errorPaymentSession'));
      }
    } catch (error: unknown) {
      console.error('Renewal error:', error);
      const errorMessage = error instanceof Error ? error.message : t('membership.errorGeneric');
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: MEMBERSHIP_CURRENCY,
    }).format(cents / 100);
  };

  // Loading state
  if (authLoading || isLoadingMembership || billingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const previousEndDate = membership?.end_date
    ? new Date(membership.end_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen bg-background">
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
          
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-2">
            {t('renewal.pageTitle')}
          </h1>
          <p className="text-muted-foreground">
            {tenant?.name}
          </p>
        </motion.div>

        {/* Billing Override Banner */}
        {isManualOverride && (
          <ManualOverrideBanner reason={overrideReason} appliedAt={overrideAt} />
        )}

        {/* Renewal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle>{t('renewal.expired') || 'Filiação Expirada'}</CardTitle>
                  <CardDescription>
                    {t('renewal.summary')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                {membership?.athlete_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('common.name')}:</span>
                    <span className="font-medium">{membership.athlete_name}</span>
                  </div>
                )}
                {previousEndDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('renewal.previousExpiry')}:</span>
                    <span className="font-medium text-destructive">{previousEndDate}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Price */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{t('membership.annualMembership')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('membership.validFor12Months')}
                  </p>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(MEMBERSHIP_PRICE_CENTS)}
                </p>
              </div>

              <Separator />

              {/* Captcha */}
              <div className="flex flex-col items-center gap-4">
                <TurnstileWidget
                  onSuccess={(token) => setCaptchaToken(token)}
                  onError={() => setCaptchaToken(null)}
                />
              </div>

              {/* Action Button */}
              <Button
                onClick={handleRenew}
                disabled={isProcessing || isManualOverride || !captchaToken}
                className="w-full"
                size="lg"
                variant="tenant"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('renewal.processing') || t('membership.processing')}
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    {t('renewal.renewButton')}
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                {t('membership.redirectHint')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
