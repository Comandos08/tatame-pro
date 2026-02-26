/**
 * SUPERADMIN ONLY — Landing Page Configuration
 * Manages hero banner and partner logos
 * P1.2.B — Institutional control without CMS complexity
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Image, Users, Save, Plus, Trash2, 
  Loader2 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import iconLogo from '@/assets/iconLogo.png';

interface LandingConfig {
  id: string;
  hero_image_url: string | null;
  hero_enabled: boolean;
}

interface Partner {
  id: string;
  name: string;
  logo_url: string;
  is_active: boolean;
  display_order: number;
}

export default function AdminLandingSettings() {
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  // States for hero config
  const [heroEnabled, setHeroEnabled] = useState(true);
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroSaving, setHeroSaving] = useState(false);

  // States for partner dialog
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [partnerLogoUrl, setPartnerLogoUrl] = useState('');
  const [partnerOrder, setPartnerOrder] = useState(0);
  const [partnerActive, setPartnerActive] = useState(true);

  // Redirect if not superadmin
  useEffect(() => {
    if (!authLoading && !isGlobalSuperadmin) {
      navigate('/portal');
    }
  }, [authLoading, isGlobalSuperadmin, navigate]);

  // Fetch landing config
  const { data: landingConfig } = useQuery({
    queryKey: ['admin-landing-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_landing_config')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LandingConfig | null;
    },
    enabled: isGlobalSuperadmin,
  });

  // Fetch partners
  const { data: partners, isLoading: partnersLoading } = useQuery({
    queryKey: ['admin-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_partners')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data as Partner[];
    },
    enabled: isGlobalSuperadmin,
  });

  // Sync config to state
  useEffect(() => {
    if (landingConfig) {
      setHeroEnabled(landingConfig.hero_enabled);
      setHeroImageUrl(landingConfig.hero_image_url || '');
    }
  }, [landingConfig]);

  // Save hero config
  const saveHeroConfig = async () => {
    if (!landingConfig) return;
    setHeroSaving(true);
    try {
      const { error } = await supabase
        .from('platform_landing_config')
        .update({
          hero_enabled: heroEnabled,
          hero_image_url: heroImageUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', landingConfig.id);
      
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['admin-landing-config'] });
      queryClient.invalidateQueries({ queryKey: ['platform-landing-config'] });
      toast.success(t('common.save') + ' ✓');
    } catch (err) {
      toast.error(t('common.error'));
    } finally {
      setHeroSaving(false);
    }
  };

  // Save partner mutation
  const savePartnerMutation = useMutation({
    mutationFn: async () => {
      if (editingPartner) {
        // Update
        const { error } = await supabase
          .from('platform_partners')
          .update({
            name: partnerName,
            logo_url: partnerLogoUrl,
            display_order: partnerOrder,
            is_active: partnerActive,
          })
          .eq('id', editingPartner.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('platform_partners')
          .insert({
            name: partnerName,
            logo_url: partnerLogoUrl,
            display_order: partnerOrder,
            is_active: partnerActive,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      queryClient.invalidateQueries({ queryKey: ['platform-partners'] });
      toast.success(t('common.save') + ' ✓');
      closePartnerDialog();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  // Delete partner
  const deletePartner = async (id: string) => {
    const { error } = await supabase
      .from('platform_partners')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(t('common.error'));
    } else {
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      queryClient.invalidateQueries({ queryKey: ['platform-partners'] });
      toast.success(t('common.delete') + ' ✓');
    }
  };

  const openPartnerDialog = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setPartnerName(partner.name);
      setPartnerLogoUrl(partner.logo_url);
      setPartnerOrder(partner.display_order);
      setPartnerActive(partner.is_active);
    } else {
      setEditingPartner(null);
      setPartnerName('');
      setPartnerLogoUrl('');
      setPartnerOrder((partners?.length || 0) + 1);
      setPartnerActive(true);
    }
    setPartnerDialogOpen(true);
  };

  const closePartnerDialog = () => {
    setPartnerDialogOpen(false);
    setEditingPartner(null);
  };

  if (authLoading || !isGlobalSuperadmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <img src={iconLogo} alt="TATAME" className="h-10 w-10 rounded-xl object-contain" />
            <div>
              <h1 className="font-display text-lg font-bold">{t('admin.landing.title')}</h1>
              <p className="text-xs text-muted-foreground">{t('admin.landing.subtitle')}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Hero Section Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              {t('admin.landing.heroSection')}
            </CardTitle>
            <CardDescription>{t('admin.landing.heroDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="hero-enabled">{t('admin.landing.heroEnabled')}</Label>
              <Switch
                id="hero-enabled"
                checked={heroEnabled}
                onCheckedChange={setHeroEnabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-url">{t('admin.landing.heroImageUrl')}</Label>
              <Input
                id="hero-url"
                placeholder="https://..."
                value={heroImageUrl}
                onChange={(e) => setHeroImageUrl(e.target.value)}
                disabled={!heroEnabled}
              />
            </div>
            {heroImageUrl && heroEnabled && (
              <div className="border rounded-lg p-2 bg-muted/50">
                <p className="text-xs text-muted-foreground mb-2">{t('admin.landing.preview')}</p>
                <img 
                  src={heroImageUrl} 
                  alt="Preview" 
                  className="max-h-32 object-contain mx-auto rounded"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            <Button onClick={saveHeroConfig} disabled={heroSaving}>
              {heroSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t('common.save')}
            </Button>
          </CardContent>
        </Card>

        {/* Partners Config */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t('admin.landing.partnersSection')}
                </CardTitle>
                <CardDescription>{t('admin.landing.partnersDesc')}</CardDescription>
              </div>
              <Button onClick={() => openPartnerDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                {t('admin.landing.addPartner')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {partnersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : partners && partners.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.landing.partnerOrder')}</TableHead>
                    <TableHead>{t('admin.landing.partnerName')}</TableHead>
                    <TableHead>{t('admin.landing.partnerLogo')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell>{partner.display_order}</TableCell>
                      <TableCell className="font-medium">{partner.name}</TableCell>
                      <TableCell>
                        <img 
                          src={partner.logo_url} 
                          alt={partner.name}
                          className="h-8 w-auto object-contain"
                          onError={(e) => { e.currentTarget.src = iconLogo; }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={partner.is_active ? 'default' : 'secondary'}>
                          {partner.is_active ? t('status.active') : t('gradingLevels.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openPartnerDialog(partner)}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive"
                            onClick={() => deletePartner(partner.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('admin.landing.noPartners')}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Partner Dialog */}
      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPartner ? t('admin.landing.editPartner') : t('admin.landing.addPartner')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.landing.partnerDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="partner-name">{t('admin.landing.partnerName')}</Label>
              <Input
                id="partner-name"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Federação XYZ"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-logo">{t('admin.landing.partnerLogoUrl')}</Label>
              <Input
                id="partner-logo"
                value={partnerLogoUrl}
                onChange={(e) => setPartnerLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-order">{t('admin.landing.partnerOrder')}</Label>
              <Input
                id="partner-order"
                type="number"
                value={partnerOrder}
                onChange={(e) => setPartnerOrder(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="partner-active">{t('admin.landing.partnerActive')}</Label>
              <Switch
                id="partner-active"
                checked={partnerActive}
                onCheckedChange={setPartnerActive}
              />
            </div>
            {partnerLogoUrl && (
              <div className="border rounded-lg p-2 bg-muted/50">
                <p className="text-xs text-muted-foreground mb-2">{t('admin.landing.preview')}</p>
                <img 
                  src={partnerLogoUrl} 
                  alt="Preview" 
                  className="h-12 object-contain mx-auto"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePartnerDialog}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => savePartnerMutation.mutate()}
              disabled={!partnerName || !partnerLogoUrl || savePartnerMutation.isPending}
            >
              {savePartnerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
