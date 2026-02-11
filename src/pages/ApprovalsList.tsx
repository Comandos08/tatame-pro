import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Clock, AlertCircle, Loader2, ChevronRight, User, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { EmptyStateCard } from '@/components/ux/EmptyStateCard';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { LoadingState } from '@/components/ux/LoadingState';
import { formatDateTime } from '@/lib/i18n/formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { ExportCsvButton } from '@/components/export/ExportCsvButton';
import { formatDateForCsv, formatCurrencyForCsv } from '@/lib/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';

// Type for applicant_data JSONB
interface ApplicantData {
  full_name: string;
  email: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  national_id?: string;
  city?: string;
  state?: string;
}

interface MembershipApplication {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  price_cents: number;
  currency: string;
  applicant_data: ApplicantData | null;
  applicant_profile_id: string | null;
  academy: {
    id: string;
    name: string;
  } | null;
}

export default function ApprovalsList() {
  const { tenant } = useTenant();
  const { currentUser, hasRole, isGlobalSuperadmin } = useCurrentUser();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { t, locale } = useI18n();
  const { can: canFeature } = usePermissions();

  // Check if user has approval permissions (backend contract)
  const canApprove = canFeature('TENANT_APPROVALS');

  const { data: memberships, isLoading, error } = useQuery({
    queryKey: ['pending-approvals', tenant?.id, currentUser?.id],
    queryFn: async () => {
      if (!tenant || !currentUser) return [];

      // Query memberships with PENDING_REVIEW status using applicant_data
      let query = supabase
        .from('memberships')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          start_date,
          end_date,
          price_cents,
          currency,
          applicant_data,
          applicant_profile_id,
          academy_id,
          academy:academies(id, name)
        `)
        .eq('tenant_id', tenant.id)
        .eq('status', 'PENDING_REVIEW')
        .order('created_at', { ascending: true });

      // If user is a HEAD_COACH, filter by their academies
      if (!isGlobalSuperadmin && !hasRole('ADMIN_TENANT', tenant.id)) {
        // Get coach's academies where they are HEAD_COACH
        const { data: coachData } = await supabase
          .from('coaches')
          .select('id')
          .eq('profile_id', currentUser.id)
          .eq('tenant_id', tenant.id)
          .maybeSingle();

        if (coachData) {
          const { data: academyLinks } = await supabase
            .from('academy_coaches')
            .select('academy_id')
            .eq('coach_id', coachData.id)
            .eq('role', 'HEAD_COACH')
            .eq('is_active', true);

          if (academyLinks && academyLinks.length > 0) {
            const academyIds = academyLinks.map(l => l.academy_id);
            query = query.in('academy_id', academyIds);
          } else {
            // No academies to approve for
            return [];
          }
        } else {
          return [];
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as MembershipApplication[];
    },
    enabled: !!tenant && !!currentUser && canApprove,
  });

  const formatDisplayDate = (dateString: string) => {
    return formatDateTime(dateString, locale);
  };

  // CSV columns for export
  const csvColumns = useMemo(() => [
    { 
      key: 'applicant', 
      label: t('approval.athleteData'), 
      format: (_: unknown, row: MembershipApplication) => row.applicant_data?.full_name || '' 
    },
    { 
      key: 'email', 
      label: 'E-mail', 
      format: (_: unknown, row: MembershipApplication) => row.applicant_data?.email || '' 
    },
    { key: 'status', label: 'Status', format: (v: unknown) => MEMBERSHIP_STATUS_LABELS[v as MembershipStatus] || String(v) },
    { key: 'payment_status', label: 'Pagamento', format: (v: unknown) => PAYMENT_STATUS_LABELS[v as PaymentStatus] || String(v) },
    { key: 'created_at', label: 'Data Solicitação', format: (v: unknown) => formatDateForCsv(v as string) },
    { key: 'start_date', label: 'Início', format: (v: unknown) => formatDateForCsv(v as string | null) },
    { key: 'end_date', label: 'Fim', format: (v: unknown) => formatDateForCsv(v as string | null) },
    { key: 'academy', label: 'Academia', format: (_: unknown, row: MembershipApplication) => row.academy?.name || '-' },
    { key: 'price_cents', label: 'Valor', format: (_: unknown, row: MembershipApplication) => formatCurrencyForCsv(row.price_cents, row.currency) },
  ], [t]);

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  if (!canApprove) {
    return (
      <AppShell>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-muted-foreground">{t('common.accessDenied')}</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

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
              {t('approval.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('approval.subtitle')} {tenant.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ExportCsvButton
              filename={`filiacoes_pendentes_${tenant?.slug || 'export'}`}
              columns={csvColumns}
              data={memberships || []}
              isLoading={isLoading}
            />
            <Badge variant="outline" className="w-fit">
              <Clock className="h-3 w-3 mr-1" />
              {memberships?.length || 0} {t('approval.pending')}
            </Badge>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">{t('common.error')}</p>
            </CardContent>
          </Card>
        ) : memberships && memberships.length > 0 ? (
          <div className="grid gap-4">
            {memberships.map((membership, index) => (
              <motion.div
                key={membership.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="card-hover cursor-pointer group"
                  onClick={() => navigate(`/${tenantSlug}/app/approvals/${membership.id}`)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                        <Clock className="h-6 w-6 text-warning" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-medium flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {membership.applicant_data?.full_name || 'Nome não disponível'}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            #{membership.id.substring(0, 8).toUpperCase()}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {membership.applicant_data?.email || 'Email não disponível'}
                        </p>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          <StatusBadge 
                            status={membership.status} 
                            label={MEMBERSHIP_STATUS_LABELS[membership.status]}
                          />
                          <StatusBadge 
                            status={membership.payment_status} 
                            label={PAYMENT_STATUS_LABELS[membership.payment_status]}
                          />
                          {membership.academy && (
                            <Badge variant="outline">
                              {membership.academy.name}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {t('approval.requestedAt')} {formatDisplayDate(membership.created_at)}
                        </div>
                      </div>

                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <EmptyStateCard
                icon={ClipboardCheck}
                titleKey="empty.approvals.admin.title"
                descriptionKey="empty.approvals.admin.desc"
                hintKey="empty.approvals.admin.hint"
                variant="inline"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
