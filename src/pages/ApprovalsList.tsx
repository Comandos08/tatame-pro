import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Clock, AlertCircle, Loader2, ChevronRight, ChevronLeft, User, Calendar, FileText, CreditCard, Search, X } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  // P2.3 — Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

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

  // P1.3 — Server-side paginated query filtered by active tab
  const { data: queryResult, isLoading: queryLoading, error: queryError } = useQuery({
    queryKey: ['pending-approvals', tenant?.id, currentUser?.id, activeTab, page, search],
    queryFn: async () => {
      if (!tenant || !currentUser) return { memberships: [], total: 0 };

      log.info('[APPROVALS_QUERY_EXEC]', {
        component: 'ApprovalsList',
        metadata: { tenantId: tenant.id, activeTab, page, search },
      });

      const tabConfig = TAB_CONFIG.find(t => t.value === activeTab)!;

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
        `, { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .in('status', tabConfig.statuses)
        .order('created_at', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

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
            query = query.in('academy_id', academyLinks.map(l => l.academy_id));
          } else {
            return { memberships: [], total: 0 };
          }
        } else {
          return { memberships: [], total: 0 };
        }
      }

      const { data, count, error } = await query;

      if (error) throw error;

      log.info('[APPROVALS_QUERY_SUCCESS]', {
        component: 'ApprovalsList',
        metadata: { count, page },
      });

      return { memberships: (data as unknown as MembershipApplication[]), total: count ?? 0 };
    },
    enabled: queryEnabled,
  });

  // Count queries — one per tab for badge display
  const { data: countResult } = useQuery({
    queryKey: ['pending-approvals-counts', tenant?.id, currentUser?.id],
    queryFn: async () => {
      if (!tenant || !currentUser) return { PENDING_REVIEW: 0, PENDING_PAYMENT: 0, DRAFT: 0 };
      const allStatuses: MembershipStatus[] = ['PENDING_REVIEW', 'PENDING_PAYMENT', 'DRAFT'];
      const { data } = await supabase
        .from('memberships')
        .select('status')
        .eq('tenant_id', tenant.id)
        .in('status', allStatuses);
      const rows = data ?? [];
      return {
        PENDING_REVIEW: rows.filter(r => r.status === 'PENDING_REVIEW').length,
        PENDING_PAYMENT: rows.filter(r => r.status === 'PENDING_PAYMENT').length,
        DRAFT: rows.filter(r => r.status === 'DRAFT').length,
      };
    },
    enabled: queryEnabled,
  });

  const memberships = useMemo(() => {
    if (!queryResult) return [];
    const rows = queryResult.memberships;
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(m =>
      getDisplayName(m).toLowerCase().includes(q) ||
      getDisplayEmail(m).toLowerCase().includes(q)
    );
  }, [queryResult, search]);

  const totalPages = Math.ceil((queryResult?.total ?? 0) / PAGE_SIZE);
  const counts = countResult ?? null;

  const formatDisplayDate = (dateString: string) => {
    return formatDateTime(dateString, locale);
  };

  // P2.3 — Bulk approve handler
  const handleBulkApprove = async () => {
    if (!selectedIds.size) return;
    setIsBulkProcessing(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map(id => supabase.functions.invoke('approve-membership', { body: { membershipId: id } }))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    await queryClient.invalidateQueries({ queryKey: ['pending-approvals', tenant?.id] });
    await queryClient.invalidateQueries({ queryKey: ['pending-approvals-counts', tenant?.id] });
    setSelectedIds(new Set());
    setIsBulkProcessing(false);
    const approveMsg = `${succeeded} aprovação(ões) concluída(s)${failed ? `, ${failed} falhou` : ''}`;
    if (failed) toast.error(approveMsg); else toast.success(approveMsg);
  };

  // P2.3 — Bulk reject handler
  const handleBulkReject = async () => {
    if (!selectedIds.size || !bulkRejectReason.trim()) return;
    setIsBulkProcessing(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map(id => supabase.functions.invoke('reject-membership', { body: { membershipId: id, reason: bulkRejectReason } }))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    await queryClient.invalidateQueries({ queryKey: ['pending-approvals', tenant?.id] });
    await queryClient.invalidateQueries({ queryKey: ['pending-approvals-counts', tenant?.id] });
    setSelectedIds(new Set());
    setBulkRejectOpen(false);
    setBulkRejectReason('');
    setIsBulkProcessing(false);
    const rejectMsg = `${succeeded} rejeição(ões) concluída(s)${failed ? `, ${failed} falhou` : ''}`;
    if (failed) toast.error(rejectMsg); else toast.success(rejectMsg);
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as ApprovalTab); setPage(0); setSearch(''); setSelectedIds(new Set()); }}>
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
                              {/* P2.3 — Bulk selection checkbox */}
                              {activeTab === 'PENDING_REVIEW' && (
                                <div className="flex items-center pt-1" onClick={e => toggleSelection(membership.id, e)}>
                                  <Checkbox
                                    checked={selectedIds.has(membership.id)}
                                    onCheckedChange={() => {}}
                                    aria-label={`Selecionar ${getDisplayName(membership)}`}
                                  />
                                </div>
                              )}
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

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Página {page + 1} de {totalPages} · {queryResult?.total ?? 0} registros
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* P2.3 — Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-background shadow-xl px-6 py-3">
          <span className="text-sm font-medium">{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
          <Button
            size="sm"
            onClick={handleBulkApprove}
            disabled={isBulkProcessing}
          >
            {isBulkProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Aprovar todos
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkRejectOpen(true)}
            disabled={isBulkProcessing}
          >
            Rejeitar todos
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* P2.3 — Bulk reject dialog */}
      <AlertDialog open={bulkRejectOpen} onOpenChange={setBulkRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar {selectedIds.size} solicitação(ões)</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da rejeição. Todos os solicitantes serão notificados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo da rejeição..."
            value={bulkRejectReason}
            onChange={e => setBulkRejectReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkRejectReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkReject}
              disabled={!bulkRejectReason.trim() || isBulkProcessing}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar rejeição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
