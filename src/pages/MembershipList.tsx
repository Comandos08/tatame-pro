import React from 'react';
import { motion } from 'framer-motion';
import { FileText, CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { EmptyStateCard } from '@/components/ux/EmptyStateCard';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useI18n, Locale } from '@/contexts/I18nContext';
import { LoadingState } from '@/components/ux/LoadingState';
import { formatDate } from '@/lib/i18n/formatters';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';

interface MembershipWithAthlete {
  id: string;
  status: MembershipStatus;
  start_date: string | null;
  end_date: string | null;
  payment_status: PaymentStatus;
  price_cents: number;
  currency: string;
  created_at: string;
  athlete: {
    id: string;
    full_name: string;
    email: string;
  };
  digital_cards: {
    id: string;
    qr_code_image_url: string;
    pdf_url: string;
  }[];
}

const statusIconConfig: Record<MembershipStatus, { icon: React.ElementType; bgColor: string }> = {
  DRAFT: { icon: FileText, bgColor: 'bg-muted' },
  PENDING_PAYMENT: { icon: CreditCard, bgColor: 'bg-warning/10' },
  PENDING_REVIEW: { icon: Clock, bgColor: 'bg-warning/10' },
  APPROVED: { icon: CheckCircle, bgColor: 'bg-info/10' },
  ACTIVE: { icon: CheckCircle, bgColor: 'bg-success/10' },
  EXPIRED: { icon: AlertCircle, bgColor: 'bg-muted' },
  CANCELLED: { icon: XCircle, bgColor: 'bg-destructive/10' },
};

export default function MembershipList() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  const { data: memberships, isLoading, error } = useQuery({
    queryKey: ['memberships', tenant?.id, currentUser?.id],
    queryFn: async () => {
      if (!tenant || !currentUser) return [];

      // Get athlete record for current user
      const { data: athlete } = await supabase
        .from('athletes')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('profile_id', currentUser.id)
        .maybeSingle();

      if (!athlete) {
        // Check if user is a guardian
        const { data: guardian } = await supabase
          .from('guardians')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('profile_id', currentUser.id)
          .maybeSingle();

        if (!guardian) return [];

        // Get linked athletes
        const { data: links } = await supabase
          .from('guardian_links')
          .select('athlete_id')
          .eq('guardian_id', guardian.id);

        if (!links?.length) return [];

        const athleteIds = links.map(l => l.athlete_id);

        const { data, error } = await supabase
          .from('memberships')
          .select(`
            id,
            status,
            start_date,
            end_date,
            payment_status,
            price_cents,
            currency,
            created_at,
            athlete:athletes(id, full_name, email),
            digital_cards(id, qr_code_image_url, pdf_url)
          `)
          .eq('tenant_id', tenant.id)
          .in('athlete_id', athleteIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data as unknown as MembershipWithAthlete[];
      }

      const { data, error: membershipError } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          start_date,
          end_date,
          payment_status,
          price_cents,
          currency,
          created_at,
          athlete:athletes(id, full_name, email),
          digital_cards(id, qr_code_image_url, pdf_url)
        `)
        .eq('tenant_id', tenant.id)
        .eq('athlete_id', athlete.id)
        .order('created_at', { ascending: false });

      if (membershipError) throw membershipError;
      return data as unknown as MembershipWithAthlete[];
    },
    enabled: !!tenant && !!currentUser,
  });

  const formatMembershipDate = (dateString: string | null) => {
    return formatDate(dateString, locale);
  };

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  return (
    <AppShell>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold">
              Minhas Filiações
            </h1>
            <p className="text-muted-foreground">
              Acompanhe o status das suas filiações na {tenant.name}
            </p>
          </div>
          <Button onClick={() => navigate(`/${tenantSlug}/membership/new`)}>
            Nova Filiação
          </Button>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">Erro ao carregar filiações</p>
            </CardContent>
          </Card>
        ) : memberships && memberships.length > 0 ? (
          <div className="grid gap-4">
            {memberships.map((membership, index) => {
              const iconConfig = statusIconConfig[membership.status];
              const StatusIcon = iconConfig.icon;
              const hasCard = membership.digital_cards && membership.digital_cards.length > 0;

              return (
                <motion.div
                  key={membership.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card 
                    className="card-hover cursor-pointer group"
                    onClick={() => navigate(`/${tenantSlug}/app/memberships/${membership.id}`)}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start gap-4">
                        <div className={`h-12 w-12 rounded-xl ${iconConfig.bgColor} flex items-center justify-center shrink-0`}>
                          <StatusIcon className="h-6 w-6" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">
                              {membership.athlete?.full_name}
                            </h3>
                            <Badge variant="outline" className="text-xs">
                              #{membership.id.substring(0, 8).toUpperCase()}
                            </Badge>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-3">
                            <StatusBadge 
                              status={membership.status} 
                              label={MEMBERSHIP_STATUS_LABELS[membership.status]}
                            />
                            <StatusBadge 
                              status={membership.payment_status} 
                              label={PAYMENT_STATUS_LABELS[membership.payment_status]}
                            />
                          </div>
                          
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span>Início: {formatMembershipDate(membership.start_date)}</span>
                            <span>Validade: {formatMembershipDate(membership.end_date)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {hasCard && (
                            <Badge variant="outline" className="hidden sm:flex gap-1 text-success border-success/30">
                              <CreditCard className="h-3 w-3" />
                              Carteira
                            </Badge>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <EmptyStateCard
                icon={FileText}
                titleKey="empty.memberships.athlete.title"
                descriptionKey="empty.memberships.athlete.desc"
                variant="inline"
                primaryAction={{
                  labelKey: 'empty.memberships.athlete.cta',
                  onClick: () => navigate(`/${tenantSlug}/membership/new`),
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
