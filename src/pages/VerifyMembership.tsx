import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Loader2,
  Calendar,
  Building2,
  User,
  ExternalLink,
  Shield
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusBadge, StatusType } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import PublicHeader from '@/components/PublicHeader';

interface MembershipVerification {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  payment_status: string;
  type: string;
  athlete: {
    id: string;
    full_name: string;
  };
  digital_cards: {
    id: string;
    pdf_url: string | null;
  }[];
}

export default function VerifyMembership() {
  const { tenantSlug, membershipId } = useParams<{ tenantSlug: string; membershipId: string }>();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { t } = useI18n();

  const { data: membership, isLoading, error } = useQuery({
    queryKey: ['verify-membership', membershipId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !membershipId) return null;
      
      const { data, error } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          start_date,
          end_date,
          payment_status,
          type,
          athlete:athletes!memberships_athlete_id_fkey (
            id,
            full_name
          ),
          digital_cards (
            id,
            pdf_url
          )
        `)
        .eq('id', membershipId)
        .eq('tenant_id', tenant.id)
        .single();

      if (error) throw error;
      return data as unknown as MembershipVerification;
    },
    enabled: !!tenant?.id && !!membershipId,
  });

  // Mask name for privacy (LGPD compliance)
  const maskName = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length === 1) {
      return parts[0].substring(0, 2) + '***';
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    const maskedMiddle = parts.slice(1, -1).map(() => '***');
    return [first, ...maskedMiddle, last.substring(0, 1) + '.'].join(' ');
  };

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Determine verification result
  const getVerificationResult = () => {
    if (!membership) {
      return {
        valid: false,
        icon: <XCircle className="h-12 w-12 text-destructive" />,
        title: t('verification.membershipNotFound'),
        description: t('verification.membershipNotFoundDesc'),
        color: 'destructive' as const,
      };
    }

    const activeStatuses = ['APPROVED', 'ACTIVE'];
    const isActive = activeStatuses.includes(membership.status);
    const isPaid = membership.payment_status === 'PAID';
    const isNotExpired = !membership.end_date || new Date(membership.end_date) >= new Date();

    if (isActive && isPaid && isNotExpired) {
      return {
        valid: true,
        icon: <CheckCircle2 className="h-12 w-12 text-green-500" />,
        title: t('verification.membershipValid'),
        description: t('verification.membershipValidDesc'),
        color: 'success' as const,
      };
    }

    if (membership.status === 'PENDING_REVIEW' || membership.status === 'DRAFT') {
      return {
        valid: false,
        icon: <Clock className="h-12 w-12 text-amber-500" />,
        title: t('verification.membershipPending'),
        description: t('verification.membershipPendingDesc'),
        color: 'warning' as const,
      };
    }

    if (!isNotExpired) {
      return {
        valid: false,
        icon: <AlertCircle className="h-12 w-12 text-destructive" />,
        title: t('verification.membershipExpired'),
        description: t('verification.membershipExpiredDesc'),
        color: 'destructive' as const,
      };
    }

    return {
      valid: false,
      icon: <XCircle className="h-12 w-12 text-destructive" />,
      title: t('verification.membershipInvalid'),
      description: t('verification.membershipInvalidDesc'),
      color: 'destructive' as const,
    };
  };

  if (tenantLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="container max-w-lg mx-auto px-4 py-12">
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">{t('verification.membershipNotFound')}</h2>
                <p className="text-muted-foreground">{t('verification.membershipNotFoundDesc')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const verificationResult = getVerificationResult();
  const hasDigitalCard = membership?.digital_cards && membership.digital_cards.length > 0;
  const digitalCard = hasDigitalCard ? membership.digital_cards[0] : null;

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      
      <main className="container max-w-lg mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="overflow-hidden">
            {/* Header with verification result */}
            <div 
              className={`p-6 text-center ${
                verificationResult.valid 
                  ? 'bg-green-50 dark:bg-green-950/20' 
                  : verificationResult.color === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : 'bg-red-50 dark:bg-red-950/20'
              }`}
            >
              {verificationResult.icon}
              <h1 className="text-xl font-bold mt-4">{verificationResult.title}</h1>
              <p className="text-sm text-muted-foreground mt-2">{verificationResult.description}</p>
            </div>

            <CardContent className="pt-6">
              {membership && (
                <div className="space-y-6">
                  {/* Organization Info */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('verification.organization')}</p>
                      <p className="font-medium">{tenant.name}</p>
                    </div>
                  </div>

                  {/* Athlete Info (masked for privacy) */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('verification.athlete')}</p>
                      <p className="font-medium">{maskName(membership.athlete?.full_name || '')}</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t('common.status')}</span>
                    </div>
                    <StatusBadge status={membership.status as StatusType} />
                  </div>

                  {/* Validity Period */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">{t('verification.validityPeriod')}</p>
                      <p className="font-medium">
                        {formatDate(membership.start_date)} - {formatDate(membership.end_date)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Digital Card Status */}
                  {hasDigitalCard ? (
                    <div className="text-center space-y-4">
                      <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">{t('verification.cardReady')}</span>
                      </div>
                      {digitalCard?.pdf_url && (
                        <Button 
                          className="w-full"
                          asChild
                        >
                          <Link to={`/${tenantSlug}/verify/card/${digitalCard.id}`}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {t('verification.viewFullCard')}
                          </Link>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                      <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="font-medium">{t('verification.cardProcessing')}</span>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('verification.cardProcessingDesc')}
                      </p>
                    </div>
                  )}

                  {/* QR Code for this page */}
                  <div className="pt-4 flex flex-col items-center">
                    <p className="text-xs text-muted-foreground mb-3">{t('verification.shareQr')}</p>
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <QRCodeSVG 
                        value={window.location.href}
                        size={80}
                        level="M"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Back button */}
        <div className="mt-6 text-center">
          <Button variant="ghost" asChild>
            <Link to={`/${tenantSlug}`}>
              {t('common.back')}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
