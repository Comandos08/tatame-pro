import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
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
        .select('id, status, payment_status, start_date, end_date, type, created_at')
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
        {/* Portal Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">{t('portal.title')}</h1>
              <p className="text-muted-foreground">{t('portal.welcome')}</p>
            </div>
          </div>
        </div>

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
        </div>
      </PortalAccessGate>
    </PortalLayout>
  );
}
