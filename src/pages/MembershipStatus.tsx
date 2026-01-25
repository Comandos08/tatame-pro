/**
 * SAFE GOLD — ETAPA 4
 * Página de status de filiação pendente de análise
 * Rota: /:tenantSlug/membership/status
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { resolveAthletePostLoginRedirect, MembershipStatus as MembershipStatusType } from '@/lib/resolveAthletePostLoginRedirect';

interface MembershipData {
  id: string;
  status: string;
  created_at: string;
}

export default function MembershipStatus() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { t } = useI18n();
  
  const [membership, setMembership] = useState<MembershipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Buscar membership mais recente do usuário
  useEffect(() => {
    const fetchMembership = async () => {
      if (!tenant?.id || !currentUser?.id || !isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        // Primeiro tenta buscar por athlete vinculado
        const { data: athleteData } = await supabase
          .from('athletes')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('user_id', currentUser.id)
          .maybeSingle() as { data: { id: string } | null };

        let data: MembershipData | null = null;

        if (athleteData?.id) {
          const result = await supabase
            .from('memberships')
            .select('id, status, created_at')
            .eq('tenant_id', tenant.id)
            .eq('athlete_id', athleteData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle() as { data: MembershipData | null };
          data = result.data;
        } else {
          const result = await supabase
            .from('memberships')
            .select('id, status, created_at')
            .eq('tenant_id', tenant.id)
            .eq('applicant_profile_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle() as { data: MembershipData | null };
          data = result.data;
        }

        setMembership(data);
      } catch (error) {
        console.error('Error fetching membership:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembership();
  }, [tenant?.id, currentUser?.id, isAuthenticated]);

  // Redirect se status não for PENDING_REVIEW
  useEffect(() => {
    if (isLoading || !tenantSlug) return;

    const status = membership?.status?.toUpperCase() as MembershipStatusType;
    
    // Se não for PENDING_REVIEW, redirecionar para o destino correto
    if (status !== 'PENDING_REVIEW') {
      const redirectPath = resolveAthletePostLoginRedirect({
        tenantSlug,
        membershipStatus: status || null,
      });
      navigate(redirectPath, { replace: true });
    }
  }, [membership, isLoading, tenantSlug, navigate]);

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

  const createdDate = membership?.created_at
    ? new Date(membership.created_at).toLocaleDateString('pt-BR', {
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
        </motion.div>

        {/* Status Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center">
                <Clock className="h-8 w-8 text-warning" />
              </div>
              <CardTitle className="text-xl">
                {t('membershipStatus.pendingReview')}
              </CardTitle>
              <CardDescription>
                {tenant?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p>{t('membershipStatus.pendingReviewDesc')}</p>
              </div>

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

              <Button
                disabled
                className="w-full"
                size="lg"
              >
                {t('membershipStatus.accessPortal')}
              </Button>

              <p className="text-xs text-muted-foreground">
                {t('membershipSuccess.accessViaEmail')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
