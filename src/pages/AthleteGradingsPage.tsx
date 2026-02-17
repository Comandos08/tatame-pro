import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Award, 
  Calendar, 
  FileText, 
  Loader2, 
  Plus,
  ExternalLink,
  Building2,
  User,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { AppShell } from '@/layouts/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ExportCsvButton } from '@/components/export/ExportCsvButton';
import { formatDateForCsv } from '@/lib/exportCsv';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate } from '@/lib/i18n/formatters';
import type { AthleteGrading, GradingScheme, GradingLevel } from '@/types/grading';
import { AthleteBadgesList } from '@/components/badges/AthleteBadgesList';
import { AdminBadgeManager } from '@/components/badges/AdminBadgeManager';
import { BadgeTimeline } from '@/components/badges/BadgeTimeline';

interface Athlete {
  id: string;
  full_name: string;
  email: string;
  tenant_id: string;
}

interface Academy {
  id: string;
  name: string;
}

interface Coach {
  id: string;
  full_name: string;
}

export default function AthleteGradingsPage() {
  const { tenantSlug: _tenantSlug, athleteId } = useParams<{ tenantSlug: string; athleteId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { t, locale } = useI18n();
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // PI-POL-001D: Override state
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  
  const [formData, setFormData] = useState({
    grading_scheme_id: '',
    grading_level_id: '',
    academy_id: '',
    coach_id: '',
    promotion_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Fetch athlete with profile_id
  const { data: athlete, isLoading: athleteLoading } = useQuery({
    queryKey: ['athlete', athleteId],
    queryFn: async () => {
      if (!athleteId) throw new Error('Missing athleteId');
      const { data, error } = await supabase
        .from('athletes')
        .select('id, full_name, email, tenant_id, profile_id')
        .eq('id', athleteId)
        .single();
      if (error) throw error;
      return data as Athlete & { profile_id: string | null };
    },
    enabled: !!athleteId,
  });

  // Check if athlete has ACTIVE membership (for governance banner)
  const { data: hasActiveMembership } = useQuery({
    queryKey: ['athlete-active-membership', athlete?.profile_id, tenant?.id],
    queryFn: async () => {
      if (!athlete?.profile_id || !tenant?.id) return false;
      
      const { data, error } = await supabase
        .from('memberships')
        .select('id')
        .eq('applicant_profile_id', athlete.profile_id)
        .eq('tenant_id', tenant.id)
        .in('status', ['ACTIVE', 'APPROVED'])
        .maybeSingle();
      
      if (error) return false;
      return !!data;
    },
    enabled: !!athlete?.profile_id && !!tenant?.id,
  });

  // Fetch gradings
  const { data: gradings, isLoading: gradingsLoading } = useQuery({
    queryKey: ['athlete-gradings', athleteId],
    queryFn: async () => {
      if (!athleteId) throw new Error('Missing athleteId');
      const { data, error } = await supabase
        .from('athlete_gradings')
        .select(`
          *,
          grading_levels:grading_level_id (
            id, code, display_name, order_index,
            grading_schemes:grading_scheme_id (id, name, sport_type)
          ),
          academies:academy_id (id, name),
          coaches:coach_id (id, full_name),
          diplomas:diploma_id (id, serial_number, pdf_url, status)
        `)
        .eq('athlete_id', athleteId)
        .order('promotion_date', { ascending: false });
      if (error) throw error;
      return data as AthleteGrading[];
    },
    enabled: !!athleteId,
  });

  // Fetch grading schemes
  const { data: schemes } = useQuery({
    queryKey: ['grading-schemes', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grading_schemes')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as GradingScheme[];
    },
    enabled: !!tenant?.id,
  });

  // Fetch levels for selected scheme
  const { data: levels } = useQuery({
    queryKey: ['grading-levels', formData.grading_scheme_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grading_levels')
        .select('*')
        .eq('grading_scheme_id', formData.grading_scheme_id)
        .eq('is_active', true)
        .order('order_index');
      if (error) throw error;
      return data as GradingLevel[];
    },
    enabled: !!formData.grading_scheme_id,
  });

  // Fetch academies
  const { data: academies } = useQuery({
    queryKey: ['academies', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academies')
        .select('id, name')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Academy[];
    },
    enabled: !!tenant?.id,
  });

  // Fetch coaches
  const { data: coaches } = useQuery({
    queryKey: ['coaches', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaches')
        .select('id, full_name')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as Coach[];
    },
    enabled: !!tenant?.id,
  });

  // PI-POL-001D: Register grading only (no diploma)
  const handleRegisterGradingOnly = async () => {
    if (!formData.grading_level_id || !athleteId || !tenant?.id) {
      toast.error(t('grading.membershipRequired'));
      return;
    }

    setIsGenerating(true);
    try {
      const { error } = await supabase
        .from('athlete_gradings')
        .insert({
          tenant_id: tenant.id,
          athlete_id: athleteId,
          grading_level_id: formData.grading_level_id,
          academy_id: formData.academy_id || null,
          coach_id: formData.coach_id || null,
          promotion_date: formData.promotion_date,
          notes: formData.notes || null,
          diploma_id: null,
          is_official: false,
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['athlete-gradings', athleteId] });
      toast.success(t('grading.registerOnly.success'));
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(t('common.error'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset form helper
  const resetForm = () => {
    setFormData({
      grading_scheme_id: '',
      grading_level_id: '',
      academy_id: '',
      coach_id: '',
      promotion_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setOverrideEnabled(false);
    setOverrideReason('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.grading_level_id || !athleteId) {
      toast.error('Selecione um nível de graduação');
      return;
    }

    setIsGenerating(true);
    try {
      // Build request body
      const body: Record<string, unknown> = {
        athleteId,
        gradingLevelId: formData.grading_level_id,
        academyId: formData.academy_id || undefined,
        coachId: formData.coach_id || undefined,
        promotionDate: formData.promotion_date,
        notes: formData.notes || undefined,
      };

      // PI-POL-001D: Include override if enabled and no active membership
      if (overrideEnabled && hasActiveMembership === false) {
        body.officiality_override = {
          enabled: true,
          reason: overrideReason.trim(),
          granted_by_profile_id: currentUser?.id,
        };
      }

      const response = await supabase.functions.invoke('generate-diploma', {
        body,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      if (!result.success) {
        // PI-POL-001C: Handle MEMBERSHIP_REQUIRED with user-friendly message
        if (result.error === 'MEMBERSHIP_REQUIRED') {
          toast.error(t('grading.membershipRequired'));
          return;
        }
        // PI-POL-001D: Handle override forbidden
        if (result.error === 'OFFICIALITY_OVERRIDE_FORBIDDEN') {
          toast.error(t('grading.override.forbidden'));
          return;
        }
        throw new Error(result.error || 'Erro ao gerar diploma');
      }

      queryClient.invalidateQueries({ queryKey: ['athlete-gradings', athleteId] });
      toast.success('Graduação registrada e diploma gerado!');
      setIsDialogOpen(false);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro: ' + message);
    } finally {
      setIsGenerating(false);
    }
  };

  const isLoading = athleteLoading || gradingsLoading;


  // CSV columns for export
  const csvColumns = useMemo(() => [
    { key: 'athlete', label: 'Atleta', format: () => athlete?.full_name || '' },
    { 
      key: 'level', 
      label: 'Nível/Faixa', 
      format: (_: unknown, row: AthleteGrading) => {
        const level = row.grading_levels as unknown as GradingLevel | undefined;
        return level?.display_name || '-';
      }
    },
    { 
      key: 'sport', 
      label: 'Esporte', 
      format: (_: unknown, row: AthleteGrading) => {
        const level = row.grading_levels as unknown as (GradingLevel & { grading_schemes?: GradingScheme }) | undefined;
        return level?.grading_schemes?.sport_type || '-';
      }
    },
    { key: 'promotion_date', label: 'Data Graduação', format: (v: unknown) => formatDateForCsv(v as string) },
    { 
      key: 'academy', 
      label: 'Academia', 
      format: (_: unknown, row: AthleteGrading) => {
        const academy = row.academies as unknown as { name: string } | undefined;
        return academy?.name || '-';
      }
    },
    { 
      key: 'coach', 
      label: 'Professor', 
      format: (_: unknown, row: AthleteGrading) => {
        const coach = row.coaches as unknown as { full_name: string } | undefined;
        return coach?.full_name || '-';
      }
    },
    { 
      key: 'diploma', 
      label: 'Diploma Emitido', 
      format: (_: unknown, row: AthleteGrading) => {
        const diploma = row.diplomas as unknown as { status: string } | undefined;
        return diploma?.status === 'ISSUED' ? 'Sim' : 'Não';
      }
    },
  ], [athlete?.full_name]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Histórico de Graduações
            </h1>
            {athlete && (
              <div>
                <p className="text-muted-foreground">{athlete.full_name}</p>
                <AthleteBadgesList athleteId={athlete.id} surface="ATHLETE_PROFILE" className="mt-1" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ExportCsvButton
              filename={`graduacoes_${athlete?.full_name?.replace(/\s+/g, '_') || 'atleta'}`}
              columns={csvColumns}
              data={gradings || []}
              isLoading={isLoading}
            />
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar Graduação
            </Button>
          </div>
        </div>

        {/* PI-POL-001C: Governance banner when athlete has no ACTIVE membership */}
        {hasActiveMembership === false && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning">
                {t('grading.noActiveMembership.title')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('grading.noActiveMembership.desc')}
              </p>
            </div>
          </div>
        )}

        {/* PI A4: Admin Badge Management */}
        {athlete && tenant && (
          <AdminBadgeManager athleteId={athlete.id} tenantId={tenant.id} />
        )}

        {/* PI A5: Badge Timeline (read-only) */}
        {athlete && (
          <BadgeTimeline athleteId={athlete.id} />
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !gradings?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Award className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {t('empty.gradings.title')}
              </p>
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                {t('empty.gradings.registerFirst')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {gradings.map((grading, index) => {
              const level = grading.grading_levels as unknown as GradingLevel & { 
                grading_schemes: GradingScheme 
              };
              const academy = grading.academies as unknown as Academy | null;
              const coach = grading.coaches as unknown as Coach | null;
              const diploma = grading.diplomas as unknown as { 
                id: string; 
                serial_number: string; 
                pdf_url: string | null;
                status: string;
              } | null;

              return (
                <motion.div
                  key={grading.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Award className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg">
                              {level?.display_name}
                            </h3>
                            {level?.grading_schemes?.sport_type && (
                              <Badge variant="outline">
                                {level.grading_schemes.sport_type}
                              </Badge>
                            )}
                          </div>
                          {level?.grading_schemes?.name && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {level.grading_schemes.name}
                            </p>
                          )}
                          
                          <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(grading.promotion_date, locale)}
                            </div>
                            {academy && (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-4 w-4" />
                                {academy.name}
                              </div>
                            )}
                            {coach && (
                              <div className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                {coach.full_name}
                              </div>
                            )}
                          </div>

                          {grading.notes && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              "{grading.notes}"
                            </p>
                          )}
                        </div>

                        {diploma && (
                          <div className="flex-shrink-0">
                            {diploma.pdf_url ? (
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={diploma.pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Ver Diploma
                                  <ExternalLink className="ml-2 h-3 w-3" />
                                </a>
                              </Button>
                            ) : (
                              <Badge variant="secondary">
                                {diploma.serial_number}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Registrar Nova Graduação</DialogTitle>
              <DialogDescription>
                Registre uma promoção de faixa/nível para {athlete?.full_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="scheme">Esquema de Graduação</Label>
                <Select
                  value={formData.grading_scheme_id}
                  onValueChange={(value) => setFormData({ 
                    ...formData, 
                    grading_scheme_id: value,
                    grading_level_id: '' 
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o esquema" />
                  </SelectTrigger>
                  <SelectContent>
                    {schemes?.map((scheme) => (
                      <SelectItem key={scheme.id} value={scheme.id}>
                        {scheme.sport_type ? `${scheme.name} (${scheme.sport_type})` : scheme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Nível/Faixa</Label>
                <Select
                  value={formData.grading_level_id}
                  onValueChange={(value) => setFormData({ ...formData, grading_level_id: value })}
                  disabled={!formData.grading_scheme_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels?.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.order_index}. {level.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="academy">Academia (opcional)</Label>
                <Select
                  value={formData.academy_id}
                  onValueChange={(value) => setFormData({ ...formData, academy_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a academia" />
                  </SelectTrigger>
                  <SelectContent>
                    {academies?.map((academy) => (
                      <SelectItem key={academy.id} value={academy.id}>
                        {academy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coach">Coach Graduador (opcional)</Label>
                <Select
                  value={formData.coach_id}
                  onValueChange={(value) => setFormData({ ...formData, coach_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches?.map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promotion_date">Data da Promoção</Label>
                <input
                  type="date"
                  id="promotion_date"
                  value={formData.promotion_date}
                  onChange={(e) => setFormData({ ...formData, promotion_date: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas sobre a graduação..."
                  rows={3}
                />
              </div>

              {/* PI-POL-001D: Override section */}
              {hasActiveMembership === false && (
                <div className="space-y-4 p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="override-switch" className="font-medium">
                        {t('grading.override.title')}
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('grading.override.desc')}
                      </p>
                    </div>
                    <Switch
                      id="override-switch"
                      checked={overrideEnabled}
                      onCheckedChange={setOverrideEnabled}
                    />
                  </div>

                  {overrideEnabled && (
                    <div className="space-y-2">
                      <Label htmlFor="override-reason">
                        {t('grading.override.reasonLabel')} *
                      </Label>
                      <Textarea
                        id="override-reason"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder={t('grading.override.reasonPlaceholder')}
                        rows={3}
                        className={overrideReason.trim().length > 0 && overrideReason.trim().length < 8 ? 'border-destructive' : ''}
                      />
                      {overrideReason.trim().length > 0 && overrideReason.trim().length < 8 && (
                        <p className="text-sm text-destructive">
                          {t('grading.override.reasonTooShort')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              {/* Botão A: Registrar apenas graduação */}
              <Button
                type="button"
                variant="outline"
                onClick={handleRegisterGradingOnly}
                disabled={isGenerating || !formData.grading_level_id}
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('grading.registerOnly')}
              </Button>

              {/* Botão B: Registrar e gerar diploma */}
              <Button
                type="submit"
                disabled={
                  isGenerating ||
                  !formData.grading_level_id ||
                  (hasActiveMembership === false && !overrideEnabled) ||
                  (hasActiveMembership === false && overrideEnabled && overrideReason.trim().length < 8)
                }
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('grading.registerAndIssue')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
