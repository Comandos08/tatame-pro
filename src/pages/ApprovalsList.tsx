import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Clock, AlertCircle, Loader2, ChevronRight, User, Calendar, FileText, CreditCard } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { EmptyStateCard } from '@/components/ux/EmptyStateCard';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useAccessContract } from '@/hooks/useAccessContract';
import { useI18n } from '@/contexts/I18nContext';

import { AccessDenied } from '@/components/auth/AccessDenied';
import { formatDateTime } from '@/lib/i18n/formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExportCsvButton } from '@/components/export/ExportCsvButton';
import { formatDateForCsv, formatCurrencyForCsv } from '@/lib/exportCsv';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/observability/logger';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';

const log = createLogger('ApprovalsList');

// --- Types ---

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
  athlete_id: string | null;
  athlete: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  profile: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  academy: {
    id: string;
    name: string;
  } | null;
}

// --- Helpers ---

function getDisplayName(m: MembershipApplication): string {
  return m.athlete?.full_name ?? m.profile?.name ?? m.applicant_data?.full_name ?? 'Nome não disponível';
}

function getDisplayEmail(m: MembershipApplication): string {
  return m.athlete?.email ?? m.profile?.email ?? m.applicant_data?.email ?? 'Email não disponível';
}

// --- Tab config ---

type ApprovalTab = 'PENDING_REVIEW' | 'PENDING_PAYMENT' | 'DRAFT';

const TAB_CONFIG: { value: ApprovalTab; label: string; icon: typeof Clock; statuses: MembershipStatus[] }[] = [
  { value: 'PENDING_REVIEW', label: 'Em revisão', icon: Clock, statuses: ['PENDING_REVIEW'] },
  { value: 'PENDING_PAYMENT', label: 'Aguardando pagamento', icon: CreditCard, statuses: ['PENDING_PAYMENT'] },
  { value: 'DRAFT', label: 'Rascunhos', icon: FileText, statuses: ['DRAFT'] },
];

// --- Component ---

export default function ApprovalsList() {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { currentUser, hasRole, isGlobalSuperadmin } = useCurrentUser();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ApprovalTab>('PENDING_REVIEW');

  // Access contract — explicit loading/error/ready flags
  const {
    can: canFeature,
    isLoading: accessLoading,
    isError: accessError,
  } = useAccessContract(tenant?.id);

  const canApprove = canFeature('TENANT_APPROVALS');
  const tenantResolved = !!tenant?.id;
  const userResolved = !!currentUser?.id;
  const accessReady = !accessLoading && !accessError;

  // Observability: mount + gating snapshot
  useEffect(() => {
    log.info('[APPROVALS_MOUNT]', {
      component: 'ApprovalsList',
      metadata: { tenantSlug, tenantId: tenant?.id, userId: currentUser?.id },
    });
  }, [tenantSlug, tenant?.id, currentUser?.id]);

  useEffect(() => {
    log.info('[APPROVALS_GATE]', {
      component: 'ApprovalsList',
      metadata: {
        tenantResolved,
        accessReady,
        accessLoading,
        accessError,
        canApprove,
        queryEnabled: tenantResolved && userResolved && accessReady && canApprove,
      },
    });
  }, [tenantResolved, accessReady, accessLoading, accessError, canApprove, userResolved]);

  // Force refetch when gating becomes ready (prevent stale empty cache)
  useEffect(() => {
    if (accessReady && canApprove && tenant?.id && currentUser?.id) {
      queryClient.invalidateQueries({
        queryKey: ['pending-approvals', tenant.id, currentUser.id],
      });
    }
  }, [accessReady, canApprove, tenant?.id, currentUser?.id, queryClient]);

  // Query — enabled only when all gates resolved
  const queryEnabled = tenantResolved && userResolved && accessReady && canApprove;

  const { data: allMemberships, isLoading: queryLoading, error: queryError } = useQuery({
    queryKey: ['pending-approvals', tenant?.id, currentUser?.id],
    queryFn: async () => {
      if (!tenant || !currentUser) return [];

      const allStatuses: MembershipStatus[] = ['PENDING_REVIEW', 'PENDING_PAYMENT', 'DRAFT'];

      log.info('[APPROVALS_QUERY_EXEC]', {
        component: 'ApprovalsList',
        metadata: { tenantId: tenant.id, statuses: allStatuses },
      });

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
          athlete_id,
          athlete:athletes!athlete_id(id, full_name, email),
          profile:profiles!applicant_profile_id(id, name, email),
          academy_id,
          academy:academies(id, name)
        `)
        .eq('tenant_id', tenant.id)
        .in('status', allStatuses)
        .order('created_at', { ascending: true });

      // HEAD_COACH: filter by their academies
      if (!isGlobalSuperadmin && !hasRole('ADMIN_TENANT', tenant.id)) {
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
            return [];
          }
        } else {
          return [];
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      const results = data as unknown as MembershipApplication[];

      log.info('[APPROVALS_QUERY_SUCCESS]', {
        component: 'ApprovalsList',
        metadata: {
          total: results.length,
          draft: results.filter(m => m.status === 'DRAFT').length,
          pending_review: results.filter(m => m.status === 'PENDING_REVIEW').length,
          pending_payment: results.filter(m => m.status === 'PENDING_PAYMENT').length,
        },
      });

      return results;
    },
    enabled: queryEnabled,
  });

  // Filter by active tab
  const memberships = useMemo(() => {
    if (!allMemberships) return [];
    const tabConfig = TAB_CONFIG.find(t => t.value === activeTab);
    if (!tabConfig) return [];
    return allMemberships.filter(m => tabConfig.statuses.includes(m.status));
  }, [allMemberships, activeTab]);

  // Counts — null when not yet loaded (shows placeholders)
  const counts = useMemo(() => {
    if (!allMemberships) return null;
    return {
      PENDING_REVIEW: allMemberships.filter(m => m.status === 'PENDING_REVIEW').length,
      PENDING_PAYMENT: allMemberships.filter(m => m.status === 'PENDING_PAYMENT').length,
      DRAFT: allMemberships.filter(m => m.status === 'DRAFT').length,
    };
  }, [allMemberships]);

  const formatDisplayDate = (dateString: string) => {
    return formatDateTime(dateString, locale);
  };

  // CSV columns for export
  const csvColumns = useMemo(() => [
    { 
      key: 'applicant', 
      label: t('approval.athleteData'), 
      format: (_: unknown, row: MembershipApplication) => getDisplayName(row) 
    },
    { 
      key: 'email', 
      label: 'E-mail', 
      format: (_: unknown, row: MembershipApplication) => getDisplayEmail(row) 
    },
    { key: 'status', label: 'Status', format: (v: unknown) => MEMBERSHIP_STATUS_LABELS[v as MembershipStatus] || String(v) },
    { key: 'payment_status', label: 'Pagamento', format: (v: unknown) => PAYMENT_STATUS_LABELS[v as PaymentStatus] || String(v) },
    { key: 'created_at', label: 'Data Solicitação', format: (v: unknown) => formatDateForCsv(v as string) },
    { key: 'start_date', label: 'Início', format: (v: unknown) => formatDateForCsv(v as string | null) },
    { key: 'end_date', label: 'Fim', format: (v: unknown) => formatDateForCsv(v as string | null) },
    { key: 'academy', label: 'Academia', format: (_: unknown, row: MembershipApplication) => row.academy?.name || '-' },
    { key: 'price_cents', label: 'Valor', format: (_: unknown, row: MembershipApplication) => formatCurrencyForCsv(row.price_cents, row.currency) },
  ], [t]);

  // ═══════════════════════════════════════
  //  DETERMINISTIC STATE MACHINE
  // ═══════════════════════════════════════

  // STATE A: Tenant not yet resolved
  if (tenantLoading || !tenantResolved) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  // STATE B: Access contract loading
  if (accessLoading) {
    return (
      <AppShell>
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.verifyingPermissions')}</p>
        </div>
      </AppShell>
    );
  }

  // STATE C: Access error or denied
  if (accessError || !canApprove) {
    return (
      <AppShell>
        <AccessDenied />
      </AppShell>
    );
  }

  // STATE D/E: Query loading or data ready (access granted)
  const totalCount = counts
    ? (counts.PENDING_REVIEW + counts.PENDING_PAYMENT + counts.DRAFT)
    : null;

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
              isLoading={queryLoading}
            />
            <Badge variant="outline" className="w-fit">
              <Clock className="h-3 w-3 mr-1" />
              {totalCount !== null ? `${totalCount} total` : '— total'}
            </Badge>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ApprovalTab)}>
          <TabsList>
            {TAB_CONFIG.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {counts ? (
                  counts[tab.value] > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-xs">
                      {counts[tab.value]}
                    </Badge>
                  )
                ) : (
                  <Skeleton className="ml-1 h-5 w-5 rounded-full" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_CONFIG.map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              {queryLoading ? (
                <div className="grid gap-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i}>
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex items-start gap-4">
                          <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                          <div className="flex-1 space-y-3">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-4 w-32" />
                            <div className="flex gap-2">
                              <Skeleton className="h-6 w-24" />
                              <Skeleton className="h-6 w-24" />
                            </div>
                            <Skeleton className="h-3 w-40" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : queryError ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                    <p className="text-muted-foreground">{t('common.error')}</p>
                  </CardContent>
                </Card>
              ) : memberships && memberships.length > 0 ? (
                <div className="grid gap-4">
                  {memberships.map((membership, index) => {
                    const displayName = getDisplayName(membership);
                    const displayEmail = getDisplayEmail(membership);
                    return (
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
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                                membership.status === 'DRAFT' ? 'bg-muted' : 'bg-warning/10'
                              }`}>
                                {membership.status === 'DRAFT' ? (
                                  <FileText className="h-6 w-6 text-muted-foreground" />
                                ) : (
                                  <Clock className="h-6 w-6 text-warning" />
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="font-medium flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {displayName}
                                  </h3>
                                  <Badge variant="outline" className="text-xs">
                                    #{membership.id.substring(0, 8).toUpperCase()}
                                  </Badge>
                                </div>
                                
                                <p className="text-sm text-muted-foreground mb-3">
                                  {displayEmail}
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

                                {membership.status === 'DRAFT' && (
                                  <p className="text-xs text-muted-foreground italic mb-2">
                                    Solicitação iniciada — aguardando completar etapas
                                  </p>
                                )}
                                
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
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <EmptyStateCard
                      icon={tab.value === 'PENDING_REVIEW' ? ClipboardCheck : tab.icon}
                      titleKey="empty.approvals.admin.title"
                      descriptionKey="empty.approvals.admin.desc"
                      hintKey="empty.approvals.admin.hint"
                      variant="inline"
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppShell>
  );
}
