import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserCog, Plus, Edit, Loader2, AlertCircle, Award, Link as LinkIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';

import { useI18n } from '@/contexts/I18nContext';
import { usePermissions } from '@/hooks/usePermissions';
import { LoadingState } from '@/components/ux/LoadingState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { ACADEMY_COACH_ROLE_LABELS, AcademyCoachRole } from '@/types/academy';

interface Coach {
  id: string;
  full_name: string;
  main_sport: string | null;
  rank: string | null;
  is_active: boolean;
  profile_id: string | null;
  academy_coaches: {
    id: string;
    role: AcademyCoachRole;
    academy: {
      id: string;
      name: string;
    };
  }[];
}

interface Academy {
  id: string;
  name: string;
}

export default function CoachesList() {
  const { tenant } = useTenant();
  
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [linkingCoach, setLinkingCoach] = useState<Coach | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    main_sport: '',
    rank: '',
    profile_email: '',
  });
  const [linkData, setLinkData] = useState({
    academy_id: '',
    role: 'INSTRUCTOR' as AcademyCoachRole,
  });

  const { can: canFeature } = usePermissions();
  const canManage = canFeature('TENANT_COACHES');

  const { data: coaches, isLoading, error } = useQuery({
    queryKey: ['coaches', tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      
      const { data, error } = await supabase
        .from('coaches')
        .select(`
          *,
          academy_coaches(
            id,
            role,
            academy:academies(id, name)
          )
        `)
        .eq('tenant_id', tenant.id)
        .order('full_name');
      
      if (error) throw error;
      return data as Coach[];
    },
    enabled: !!tenant,
  });

  const { data: academies } = useQuery({
    queryKey: ['academies-list', tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      
      const { data, error } = await supabase
        .from('academies')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as Academy[];
    },
    enabled: !!tenant,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!tenant) throw new Error('Tenant not found');
      
      let profileId: string | null = null;
      
      // Try to find profile by email if provided
      if (data.profile_email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', data.profile_email)
          .maybeSingle();
        
        if (profile) {
          profileId = profile.id;
        }
      }
      
      const { error } = await supabase
        .from('coaches')
        .insert({
          tenant_id: tenant.id,
          full_name: data.full_name,
          main_sport: data.main_sport || tenant.sportTypes?.[0] || null,
          rank: data.rank || null,
          profile_id: profileId,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaches'] });
      setIsCreateOpen(false);
      resetForm();
      toast.success(t('admin.coaches.createSuccess'));
    },
    onError: (error) => {
      toast.error(t('admin.coaches.createError'));
      logger.error(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase
        .from('coaches')
        .update({
          full_name: data.full_name,
          main_sport: data.main_sport || null,
          rank: data.rank || null,
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaches'] });
      setEditingCoach(null);
      resetForm();
      toast.success(t('admin.coaches.updateSuccess'));
    },
    onError: (error) => {
      toast.error(t('admin.coaches.updateError'));
      logger.error(error);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('coaches')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaches'] });
      toast.success(t('admin.coaches.statusUpdated'));
    },
    onError: (error) => {
      toast.error(t('admin.coaches.statusError'));
      logger.error(error);
    },
  });

  const linkAcademyMutation = useMutation({
    mutationFn: async ({ coachId, academyId, role }: { coachId: string; academyId: string; role: AcademyCoachRole }) => {
      if (!tenant) throw new Error('Tenant not found');
      
      const { error } = await supabase
        .from('academy_coaches')
        .insert({
          tenant_id: tenant.id,
          coach_id: coachId,
          academy_id: academyId,
          role,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaches'] });
      setIsLinkOpen(false);
      setLinkingCoach(null);
      toast.success(t('admin.coaches.linkSuccess'));
    },
    onError: (error: Error & { code?: string }) => {
      if (error.code === '23505') {
        toast.error(t('admin.coaches.alreadyLinked'));
      } else {
        toast.error(t('admin.coaches.linkError'));
      }
      logger.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      full_name: '',
      main_sport: '',
      rank: '',
      profile_email: '',
    });
  };

  const openEditDialog = (coach: Coach) => {
    setEditingCoach(coach);
    setFormData({
      full_name: coach.full_name,
      main_sport: coach.main_sport || '',
      rank: coach.rank || '',
      profile_email: '',
    });
  };

  const openLinkDialog = (coach: Coach) => {
    setLinkingCoach(coach);
    setLinkData({ academy_id: '', role: 'INSTRUCTOR' });
    setIsLinkOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.full_name) {
      toast.error(t('admin.coaches.nameRequired'));
      return;
    }
    
    if (editingCoach) {
      updateMutation.mutate({ id: editingCoach.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleLink = () => {
    if (!linkingCoach || !linkData.academy_id) {
      toast.error(t('admin.coaches.selectAcademy'));
      return;
    }
    
    linkAcademyMutation.mutate({
      coachId: linkingCoach.id,
      academyId: linkData.academy_id,
      role: linkData.role,
    });
  };

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  const formJSX = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">{t('admin.coaches.formName')}</Label>
        <Input
          id="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          placeholder={t('admin.coaches.formNamePlaceholder')}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="main_sport">{t('admin.coaches.formSport')}</Label>
          <Input
            id="main_sport"
            value={formData.main_sport}
            onChange={(e) => setFormData({ ...formData, main_sport: e.target.value })}
            placeholder={t('admin.coaches.formSportPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rank">{t('admin.coaches.formRank')}</Label>
          <Input
            id="rank"
            value={formData.rank}
            onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
            placeholder={t('admin.coaches.formRankPlaceholder')}
          />
        </div>
      </div>
      {!editingCoach && (
        <div className="space-y-2">
          <Label htmlFor="profile_email">{t('admin.coaches.formEmail')}</Label>
          <Input
            id="profile_email"
            type="email"
            value={formData.profile_email}
            onChange={(e) => setFormData({ ...formData, profile_email: e.target.value })}
            placeholder={t('admin.coaches.formEmailPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">
            {t('admin.coaches.formEmailHint')}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold">{t('admin.coaches.title')}</h1>
            <p className="text-muted-foreground">
              {t('admin.coaches.description')} {tenant.name}
            </p>
          </div>
          {canManage && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('admin.coaches.newCoach')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('admin.coaches.createTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('admin.coaches.createDesc')}
                  </DialogDescription>
                </DialogHeader>
                {formJSX}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t('admin.coaches.create')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </motion.div>

        {/* Link Academy Dialog */}
        <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.coaches.linkTitle')}</DialogTitle>
              <DialogDescription>
                {t('admin.coaches.linkDesc').replace('{name}', linkingCoach?.full_name || '')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('admin.coaches.academyLabel')}</Label>
                <Select value={linkData.academy_id} onValueChange={(v) => setLinkData({ ...linkData, academy_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.coaches.selectAcademyPlaceholder')} />
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
                <Label>{t('admin.coaches.roleLabel')}</Label>
                <Select value={linkData.role} onValueChange={(v) => setLinkData({ ...linkData, role: v as AcademyCoachRole })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACADEMY_COACH_ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLinkOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleLink} disabled={linkAcademyMutation.isPending}>
                {linkAcademyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('admin.coaches.link')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">{t('admin.coaches.loadError')}</p>
            </CardContent>
          </Card>
        ) : coaches && coaches.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {coaches.map((coach, index) => (
              <motion.div
                key={coach.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="card-hover h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <UserCog className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{coach.full_name}</CardTitle>
                          <CardDescription className="text-xs">
                            {coach.main_sport || t('admin.coaches.allSports')}
                          </CardDescription>
                        </div>
                      </div>
                      {canManage && (
                        <Switch
                          // Coerce nullable/undefined API values to boolean so
                          // the Switch stays controlled across the first
                          // render (otherwise React logs the
                          // "changing from uncontrolled to controlled" warning).
                          checked={!!coach.is_active}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: coach.id, isActive: checked })
                          }
                        />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {coach.rank && (
                      <div className="flex items-center gap-2 text-sm">
                        <Award className="h-3 w-3 text-primary" />
                        <span>{coach.rank}</span>
                      </div>
                    )}
                    
                    {coach.academy_coaches && coach.academy_coaches.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t('admin.coaches.academiesLabel')}</p>
                        <div className="flex flex-wrap gap-1">
                          {coach.academy_coaches.map((ac) => (
                            <Badge key={ac.id} variant="outline" className="text-xs">
                              {ac.academy?.name} ({ACADEMY_COACH_ROLE_LABELS[ac.role]})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="pt-2 flex gap-2">
                      <Badge variant={coach.is_active ? 'default' : 'secondary'}>
                        {coach.is_active ? t('status.active') : t('admin.coaches.inactive')}
                      </Badge>
                    </div>
                    
                    {canManage && (
                      <div className="pt-2 flex gap-2">
                        <Dialog open={editingCoach?.id === coach.id} onOpenChange={(open) => !open && setEditingCoach(null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(coach)}>
                              <Edit className="h-3 w-3 mr-2" />
                              {t('common.edit')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{t('admin.coaches.editTitle')}</DialogTitle>
                              <DialogDescription>
                                {t('admin.coaches.editDesc')}
                              </DialogDescription>
                            </DialogHeader>
                            {formJSX}
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditingCoach(null)}>
                                {t('common.cancel')}
                              </Button>
                              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {t('common.save')}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button variant="outline" size="sm" onClick={() => openLinkDialog(coach)}>
                          <LinkIcon className="h-3 w-3 mr-2" />
                          {t('admin.coaches.linkAcademy')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <UserCog className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-display font-bold text-xl mb-2">{t('admin.coaches.emptyTitle')}</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-md">
                {t('admin.coaches.emptyDesc')}
              </p>
              {canManage && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('admin.coaches.createFirst')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
