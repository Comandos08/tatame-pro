import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { User, Clock, ArrowRight } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { PortalLayout } from '@/layouts/PortalLayout';
import { PortalAccessGate } from '@/components/portal/PortalAccessGate';
import { MembershipStatusCard } from '@/components/portal/MembershipStatusCard';
import { PaymentStatusCard } from '@/components/portal/PaymentStatusCard';
import { DigitalCardSection } from '@/components/portal/DigitalCardSection';
import { DiplomasListCard } from '@/components/portal/DiplomasListCard';
import { GradingHistoryCard } from '@/components/portal/GradingHistoryCard';
import { MyEventsCard } from '@/components/portal/MyEventsCard';
import { MembershipTimeline } from '@/components/membership/MembershipTimeline';
import { InAppNotice } from '@/components/notifications/InAppNotice';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';

interface AthleteData {
  id: string;
  full_name: string;
  tenant_id: string;
}

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  created_at: string;
  reviewed_at?: string | null;
  rejected_at?: string | null;
  webhook_processed_at?: string | null;
}

interface DigitalCardData {
  id: string;
  qr_code_image_url: string | null;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  membership_id: string;
}

interface DiplomaData {
  id: string;
  serial_number: string;
  promotion_date: string;
  status: string;
  pdf_url: string | null;
  grading_level_id: string;
}

interface GradingData {
  id: string;
  promotion_date: string;
  grading_level_id: string;
  academy_id: string | null;
  coach_id: string | null;
  notes: string | null;
}

export default function AthletePortal() {
  const { tenant } = useTenant();
  const { tenantSlug } = useParams();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();

  // Query 1: Athlete
  const {
    data: athlete,
    isLoading: athleteLoading,
    error: athleteError,
  } = useQuery<AthleteData | null>({
    queryKey: ['portal-athlete', currentUser?.id, tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, full_name, tenant_id')
        .eq('profile_id', currentUser!.id)
        .eq('tenant_id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id && !!tenant?.id,
  });

  // Query 2: Membership (most recent)
  const { data: membership, isLoading: membershipLoading } = useQuery<MembershipData | null>({
    queryKey: ['portal-membership', athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, status, payment_status, start_date, end_date, type, created_at, reviewed_at, rejected_at, webhook_processed_at')
        .eq('athlete_id', athlete!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!athlete?.id,
  });

  // Query 3: Digital Card
  const { data: digitalCard } = useQuery<DigitalCardData | null>({
    queryKey: ['portal-digital-card', membership?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digital_cards')
        .select('id, qr_code_image_url, pdf_url, valid_until, content_hash_sha256, membership_id')
        .eq('membership_id', membership!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!membership?.id,
  });

  // Query 4: Diplomas
  const { data: diplomas = [] } = useQuery<DiplomaData[]>({
    queryKey: ['portal-diplomas', athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diplomas')
        .select('id, serial_number, promotion_date, status, pdf_url, grading_level_id')
        .eq('athlete_id', athlete!.id)
        .eq('status', 'ISSUED')
        .order('promotion_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!athlete?.id,
  });

  // Query 5: Gradings
  const { data: gradings = [] } = useQuery<GradingData[]>({
    queryKey: ['portal-gradings', athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_gradings')
        .select('id, promotion_date, grading_level_id, academy_id, coach_id, notes')
        .eq('athlete_id', athlete!.id)
        .order('promotion_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!athlete?.id,
  });

  const isLoading = athleteLoading || membershipLoading;

  // P4B-4: Calculate days until expiry for next action card
  const daysUntilExpiry = membership?.end_date 
    ? differenceInDays(new Date(membership.end_date), new Date())
    : null;

  // P4B-4: Dynamic welcome message based on status
  const getWelcomeMessage = () => {
    const status = membership?.status?.toUpperCase();
    switch (status) {
      case 'ACTIVE':
        return t('portal.welcomeActive');
      case 'APPROVED':
        return t('portal.welcomeApproved');
      case 'PENDING_REVIEW':
        return t('portal.welcomePending');
      default:
        return t('portal.welcome');
    }
  };

  if (!tenant) {
    return null;
  }

  return (
    <PortalLayout
      athleteName={athlete?.full_name || 'Atleta'}
      tenantName={tenant.name}
      tenantLogo={tenant.logoUrl}
      tenantSlug={tenant.slug}
    >
      <PortalAccessGate
        athlete={athlete ?? null}
        membership={membership ?? null}
        isLoading={isLoading}
        error={athleteError as Error | null}
      >
        {/* P4B-4: Enhanced Portal Header with status badge */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-display font-bold">{t('portal.title')}</h1>
                {membership && (
                  <StatusBadge 
                    status={membership.status.toUpperCase() as 'ACTIVE' | 'APPROVED' | 'PENDING_REVIEW' | 'EXPIRED' | 'CANCELLED' | 'REJECTED'} 
                  />
                )}
              </div>
              <p className="text-muted-foreground">{getWelcomeMessage()}</p>
            </div>
          </div>
        </div>

        {/* P4B-4: Next Action Card - Expiring Soon */}
        {daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      {t('portal.expiringIn').replace('{days}', String(daysUntilExpiry))}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('portal.renewReminder')}</p>
                  </div>
                </div>
                <Button asChild variant="tenant-outline" size="sm" className="gap-2">
                  <Link to={`/${tenantSlug}/membership/renew`}>
                    {t('renewal.renewNow')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* In-App Notifications */}
        <InAppNotice membership={membership} tenantSlug={tenant.slug} />

        {/* Portal Content */}
        <div className="space-y-6">
          {/* Row 1: Membership Status + Payment */}
          <div className="grid gap-6 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {membership && (
                <MembershipStatusCard
                  status={membership.status}
                  type={membership.type}
                  startDate={membership.start_date}
                  endDate={membership.end_date}
                />
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {membership && (
                <PaymentStatusCard paymentStatus={membership.payment_status} />
              )}
            </motion.div>
          </div>

          {/* Row 2: Digital Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <DigitalCardSection
              digitalCard={digitalCard ?? null}
              athleteName={athlete?.full_name || ''}
              tenantSlug={tenant.slug}
              showFullCardLink
            />
          </motion.div>

          {/* Row 3: Diplomas + Gradings */}
          <div className="grid gap-6 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <DiplomasListCard diplomas={diplomas} tenantSlug={tenant.slug} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <GradingHistoryCard gradings={gradings} />
            </motion.div>
          </div>

          {/* Row 4: Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <MembershipTimeline membership={membership} />
          </motion.div>

          {/* Row 5: Meus Eventos */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <MyEventsCard athleteId={athlete?.id} tenantSlug={tenant.slug} showFullHistoryLink />
          </motion.div>
        </div>
      </PortalAccessGate>
    </PortalLayout>
  );
}
