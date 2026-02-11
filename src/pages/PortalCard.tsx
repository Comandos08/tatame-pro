import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { LoadingState } from '@/components/ux/LoadingState';
import { PortalLayout } from '@/layouts/PortalLayout';
import { PortalAccessGate } from '@/components/portal/PortalAccessGate';
import { DigitalMembershipCard } from '@/components/card/DigitalMembershipCard';
import { ProvisionalCard } from '@/components/athlete/ProvisionalCard';
import { useAthletePhoto } from '@/hooks/useAthletePhoto';

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
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  membership_id: string;
}

export default function PortalCard() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();

  // Query athlete
  const { data: athlete, isLoading: athleteLoading, error: athleteError } = useQuery<AthleteData | null>({
    queryKey: ['portal-athlete-card', currentUser?.id, tenant?.id],
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

  // Query membership
  const { data: membership, isLoading: membershipLoading } = useQuery<MembershipData | null>({
    queryKey: ['portal-membership-card', athlete?.id],
    queryFn: async (): Promise<MembershipData | null> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, status, payment_status, start_date, end_date, type, created_at')
        .eq('athlete_id', athlete!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        payment_status: data.payment_status,
        start_date: data.start_date,
        end_date: data.end_date,
        type: data.type,
        created_at: data.created_at ?? '',
      };
    },
    enabled: !!athlete?.id,
  });

  // Query digital card
  const { data: digitalCard, isLoading: cardLoading } = useQuery<DigitalCardData | null>({
    queryKey: ['portal-digital-card-full', membership?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digital_cards')
        .select('id, pdf_url, valid_until, content_hash_sha256, membership_id')
        .eq('membership_id', membership!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!membership?.id,
  });

  // Query athlete photo from storage
  const { data: athletePhoto } = useAthletePhoto(athlete?.id);

  const isLoading = athleteLoading || membershipLoading || cardLoading;

  if (!tenant) return <LoadingState titleKey="common.loading" />;

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
        isLoading={isLoading && !cardLoading}
        error={athleteError as Error | null}
      >
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link to={`/${tenant.slug}/portal`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Link>
          </Button>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">{t('portal.myCard')}</h1>
              <p className="text-muted-foreground">{t('portal.myCardDesc')}</p>
            </div>
          </div>
        </div>

        {/* Card Content */}
        {cardLoading ? (
          <Card className="max-w-sm mx-auto">
            <CardContent className="p-6">
              <Skeleton className="h-12 w-32 mx-auto mb-6" />
              <Skeleton className="h-24 w-24 rounded-full mx-auto mb-4" />
              <Skeleton className="h-6 w-48 mx-auto mb-4" />
              <Skeleton className="h-[180px] w-[180px] mx-auto mb-4" />
              <div className="flex gap-3">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
            </CardContent>
          </Card>
        ) : digitalCard && membership ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <DigitalMembershipCard
              athleteName={athlete?.full_name || ''}
              athletePhoto={athletePhoto}
              tenantName={tenant.name}
              tenantLogo={tenant.logoUrl}
              tenantSlug={tenant.slug}
              membershipId={membership.id}
              membershipStatus={membership.status}
              validUntil={digitalCard.valid_until || membership.end_date}
              pdfUrl={digitalCard.pdf_url}
              contentHash={digitalCard.content_hash_sha256}
            />
          </motion.div>
        ) : membership ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ProvisionalCard
              athleteName={athlete?.full_name || ''}
              tenantName={tenant.name}
              tenantSlug={tenant.slug}
              membershipId={membership.id}
              membershipStatus={membership.status}
              paymentStatus={membership.payment_status}
              endDate={membership.end_date}
            />
          </motion.div>
        ) : null}
      </PortalAccessGate>
    </PortalLayout>
  );
}
