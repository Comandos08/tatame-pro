import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Download, 
  CreditCard, 
  Calendar, 
  User, 
  Mail, 
  Clock,
  AlertCircle,
  Loader2,
  QrCode,
  Award,
  FileText,
  ExternalLink,
  Building2,
  XCircle,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { LoadingState } from '@/components/ux/LoadingState';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';

import { ProvisionalCard } from '@/components/athlete/ProvisionalCard';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';

interface MembershipDetails {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  start_date: string | null;
  end_date: string | null;
  price_cents: number;
  currency: string;
  type: string;
  created_at: string;
  academy_id: string | null;
  preferred_coach_id: string | null;
  athlete: {
    id: string;
    full_name: string;
    email: string;
    birth_date: string;
    phone: string | null;
    gender: string;
  };
  academy: {
    id: string;
    name: string;
  } | null;
  coach: {
    id: string;
    full_name: string;
  } | null;
  digital_cards: {
    id: string;
    qr_code_image_url: string;
    pdf_url: string;
    valid_until: string;
  }[];
}

export default function MembershipDetailsPage() {
  const { tenant } = useTenant();
  const { hasRole, isGlobalSuperadmin } = useCurrentUser();
  const { session: impersonationSession } = useImpersonation();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantSlug, membershipId } = useParams();

  const isStaffOrCoach = isGlobalSuperadmin || 
    (tenant && hasRole('ADMIN_TENANT', tenant.id));

  // Cancel dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Reactivate dialog state
  const [isReactivateDialogOpen, setIsReactivateDialogOpen] = useState(false);
  const [reactivateReason, setReactivateReason] = useState('');

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!membershipId || cancelReason.trim().length < 5) {
        throw new Error(t('membership.cancel.reasonMinLength'));
      }

      const { data, error } = await supabase.functions.invoke(
        'cancel-membership-manual',
        {
          body: {
            membershipId,
            reason: cancelReason.trim(),
            impersonationId: impersonationSession?.impersonationId || undefined,
          },
        }
      );

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Failed to cancel');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      setIsCancelDialogOpen(false);
      setCancelReason('');
      toast.success(t('membership.cancel.success'));
      navigate(`/${tenantSlug}/app/memberships`);
    },
    onError: (error) => {
      toast.error(error.message || t('common.error'));
    },
  });

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: async () => {
      if (!membershipId || reactivateReason.trim().length < 5) {
        throw new Error(t('membership.reactivate.reasonMinLength'));
      }

      const { data, error } = await supabase.functions.invoke(
        'reactivate-membership-manual',
        {
          body: {
            membershipId,
            reason: reactivateReason.trim(),
            impersonationId: impersonationSession?.impersonationId || undefined,
          },
        }
      );

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Failed to reactivate');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      queryClient.invalidateQueries({ queryKey: ['membership-last-cancel-event'] });
      setIsReactivateDialogOpen(false);
      setReactivateReason('');
      toast.success(t('membership.reactivate.success'));
    },
    onError: (error) => {
      toast.error(error.message || t('common.error'));
    },
  });

  const { data: membership, isLoading, error } = useQuery({
    queryKey: ['membership', membershipId],
    queryFn: async () => {
      if (!membershipId) return null;

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
          type,
          created_at,
          academy_id,
          preferred_coach_id,
          athlete:athletes(id, full_name, email, birth_date, phone, gender),
          academy:academies!academy_id(id, name),
          coach:coaches!preferred_coach_id(id, full_name),
          digital_cards(id, qr_code_image_url, pdf_url, valid_until)
        `)
        .eq('id', membershipId)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as MembershipDetails;
    },
    enabled: !!membershipId,
  });

  // Fetch last cancellation audit event to determine if manual cancel
  const { data: lastCancelEvent } = useQuery({
    queryKey: ['membership-last-cancel-event', membershipId],
    queryFn: async () => {
      if (!membershipId || membership?.status !== 'CANCELLED') return null;
      
      const { data } = await supabase
        .from('audit_logs')
        .select('event_type, metadata')
        .eq('event_type', 'MEMBERSHIP_MANUAL_CANCELLED')
        .order('created_at', { ascending: false })
        .limit(20);
      
      // Find matching log for this membership
      const match = data?.find((log) => {
        const meta = log.metadata as { membership_id?: string } | null;
        return meta?.membership_id === membershipId;
      });
      
      return match || null;
    },
    enabled: !!membershipId && membership?.status === 'CANCELLED',
  });

  // Can reactivate only if:
  // - User is staff/admin
  // - Status is CANCELLED
  // - payment_status !== PAID
  // - Last cancel event was MANUAL (not GC)
  const canReactivateManually = isStaffOrCoach && 
    membership?.status === 'CANCELLED' &&
    membership?.payment_status !== 'PAID' &&
    lastCancelEvent?.event_type === 'MEMBERSHIP_MANUAL_CANCELLED';

  // Can cancel manually (existing logic)
  const canCancelManually = isStaffOrCoach && 
    membership && 
    ['DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW'].includes(membership.status) && 
    membership.payment_status !== 'PAID';

  // Fetch athlete gradings
  const { data: gradings, isLoading: gradingsLoading } = useQuery({
    queryKey: ['athlete-gradings-for-membership', membership?.athlete?.id],
    queryFn: async () => {
      if (!membership?.athlete?.id || !tenant?.id) return [];

      const { data, error } = await supabase
        .from('athlete_gradings')
        .select(`
          id,
          promotion_date,
          notes,
          grading_levels:grading_level_id (
            id, code, display_name, order_index,
            grading_schemes:grading_scheme_id (id, name, sport_type)
          ),
          academies:academy_id (id, name),
          coaches:coach_id (id, full_name),
          diplomas:diploma_id (id, serial_number, pdf_url, status)
        `)
        .eq('athlete_id', membership.athlete.id)
        .eq('tenant_id', tenant.id)
        .order('promotion_date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!membership?.athlete?.id && !!tenant?.id,
  });


  if (!tenant) return <LoadingState titleKey="common.loading" />;

  const digitalCard = membership?.digital_cards?.[0];

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/${tenantSlug}/app/memberships`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('memberships.backToList')}
          </Button>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || !membership ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">{t('memberships.notFound')}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Main Info Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2"
              >
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <CardTitle className="font-display text-2xl">
                          Filiação #{membership.id.substring(0, 8).toUpperCase()}
                        </CardTitle>
                        <CardDescription>
                          {tenant.name}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <StatusBadge 
                          status={membership.status} 
                          label={MEMBERSHIP_STATUS_LABELS[membership.status]}
                        />
                        <StatusBadge 
                          status={membership.payment_status} 
                          label={PAYMENT_STATUS_LABELS[membership.payment_status]}
                        />
                        {/* Manual Cancel Button - only for eligible statuses */}
                        {canCancelManually && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setIsCancelDialogOpen(true)}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            {t('membership.cancel.title')}
                          </Button>
                        )}
                        {/* Manual Reactivate Button - only for manually cancelled memberships */}
                        {canReactivateManually && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsReactivateDialogOpen(true)}
                            className="text-primary border-primary hover:bg-primary/10"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            {t('membership.reactivate.title')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Início</p>
                          <p className="font-medium">{formatDate(membership.start_date, locale)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Validade</p>
                          <p className="font-medium">{formatDate(membership.end_date, locale)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Valor</p>
                          <p className="font-medium">{formatCurrency(membership.price_cents, locale)}</p>
                        </div>
                      </div>
                      {membership.academy && (
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Academia</p>
                            <p className="font-medium">{membership.academy.name}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {membership.coach && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          Coach responsável: <span className="text-foreground font-medium">{membership.coach.full_name}</span>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Athlete Info Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {t('memberships.athleteData')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('memberships.fullName')}</p>
                      <p className="font-medium">{membership.athlete?.full_name}</p>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Data de nascimento</p>
                        <p className="font-medium">{formatDate(membership.athlete?.birth_date, locale)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Gênero</p>
                        <p className="font-medium capitalize">
                          {membership.athlete?.gender === 'MALE' ? 'Masculino' : 
                           membership.athlete?.gender === 'FEMALE' ? 'Feminino' : 'Outro'}
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" /> E-mail
                      </p>
                      <p className="font-medium">{membership.athlete?.email}</p>
                    </div>
                    {membership.athlete?.phone && (
                      <div>
                        <p className="text-sm text-muted-foreground">Telefone</p>
                        <p className="font-medium">{membership.athlete.phone}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Digital Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="h-5 w-5" />
                      {t('memberships.digitalCard')}
                    </CardTitle>
                    <CardDescription>
                      {digitalCard 
                        ? 'Sua carteira de atleta filiado'
                        : 'Disponível após aprovação'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {digitalCard ? (
                      <div className="space-y-4">
                        <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-center">
                          <img 
                            src={digitalCard.qr_code_image_url} 
                            alt="QR Code da Carteira Digital"
                            className="w-40 h-40 rounded-lg"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Válida até {formatDate(digitalCard.valid_until, locale)}
                        </p>
                        <Button 
                          className="w-full"
                          onClick={() => window.open(digitalCard.pdf_url, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('memberships.downloadPdf')}
                        </Button>
                      </div>
                    ) : membership ? (
                      <ProvisionalCard
                        athleteName={membership.athlete?.full_name || ''}
                        tenantName={tenant?.name || ''}
                        tenantSlug={tenantSlug || ''}
                        membershipId={membership.id}
                        membershipStatus={membership.status}
                        paymentStatus={membership.payment_status}
                        endDate={membership.end_date}
                        sportTypes={tenant?.sportTypes || []}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Gradings Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5" />
                        {isStaffOrCoach ? 'Graduações do Atleta' : 'Minhas Graduações'}
                      </CardTitle>
                      <CardDescription>
                        {t('memberships.gradingHistory')}
                      </CardDescription>
                    </div>
                    {isStaffOrCoach && membership.athlete && (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/${tenantSlug}/app/athletes/${membership.athlete.id}/gradings`}>
                          {t('memberships.manageGradings')}
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {gradingsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !gradings?.length ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Award className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground text-sm">
                        {t('empty.athleteGradings.desc')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {gradings?.map((grading) => {
                        const level = grading.grading_levels;
                        const scheme = level?.grading_schemes;
                        const diploma = grading.diplomas;
                        const academy = grading.academies;
                        const coach = grading.coaches;

                        return (
                          <div
                            key={grading.id}
                            className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                          >
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Award className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{level?.display_name}</span>
                                {scheme?.sport_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {scheme.sport_type}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {[scheme?.name, formatDate(grading.promotion_date, locale)].filter(Boolean).join(' • ')}
                              </p>
                              {(academy || coach) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {[academy?.name, coach?.full_name].filter(Boolean).join(' • ')}
                                </p>
                              )}
                            </div>
                            {diploma?.pdf_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(diploma.pdf_url, '_blank')}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Diploma
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </div>

      {/* Cancel Membership Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('membership.cancel.confirmTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('membership.cancel.confirmDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm">
              <p className="font-medium text-destructive mb-2">
                {t('membership.cancel.warningTitle')}
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>{t('membership.cancel.warningNoRetry')}</li>
                <li>{t('membership.cancel.warningPermanent')}</li>
                <li>{t('membership.cancel.warningAudited')}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancel-reason">
                {t('membership.cancel.reason')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cancel-reason"
                placeholder={t('membership.cancel.reasonPlaceholder')}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
              {cancelReason.length > 0 && cancelReason.length < 5 && (
                <p className="text-xs text-destructive">
                  {t('membership.cancel.reasonMinLength')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCancelDialogOpen(false)}
              disabled={cancelMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 5}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  {t('membership.cancel.confirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Membership Dialog */}
      <Dialog open={isReactivateDialogOpen} onOpenChange={setIsReactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <RotateCcw className="h-5 w-5" />
              {t('membership.reactivate.confirmTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('membership.reactivate.confirmDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm">
              <p className="font-medium text-primary mb-2">
                {t('membership.reactivate.infoTitle')}
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>{t('membership.reactivate.infoBackToDraft')}</li>
                <li>{t('membership.reactivate.infoNoAutoPayment')}</li>
                <li>{t('membership.reactivate.infoAudited')}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reactivate-reason">
                {t('membership.reactivate.reason')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reactivate-reason"
                placeholder={t('membership.reactivate.reasonPlaceholder')}
                value={reactivateReason}
                onChange={(e) => setReactivateReason(e.target.value)}
                rows={3}
              />
              {reactivateReason.length > 0 && reactivateReason.length < 5 && (
                <p className="text-xs text-destructive">
                  {t('membership.reactivate.reasonMinLength')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsReactivateDialogOpen(false)}
              disabled={reactivateMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending || reactivateReason.trim().length < 5}
            >
              {reactivateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('membership.reactivate.confirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
