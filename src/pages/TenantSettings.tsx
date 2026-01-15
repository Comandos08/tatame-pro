import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Palette, Globe, Building2, Loader2, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n, Locale } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function TenantSettings() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [description, setDescription] = useState('');
  const [defaultLocale, setDefaultLocale] = useState<string>('pt-BR');
  const [primaryColor, setPrimaryColor] = useState('#dc2626');

  useEffect(() => {
    if (tenant) {
      setDescription(tenant.description || '');
      setPrimaryColor(tenant.primaryColor || '#dc2626');
      // Fetch default_locale from database since it might not be in context
      fetchTenantDetails();
    }
  }, [tenant?.id]);

  async function fetchTenantDetails() {
    if (!tenant?.id) return;
    setLoading(true);
    
    const { data } = await supabase
      .from('tenants')
      .select('default_locale')
      .eq('id', tenant.id)
      .single();
    
    if (data) {
      setDefaultLocale(data.default_locale || 'pt-BR');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!tenant?.id) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          description,
          default_locale: defaultLocale,
          primary_color: primaryColor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);

      if (error) throw error;

      // Log audit event
      await supabase.from('audit_logs').insert({
        tenant_id: tenant.id,
        event_type: 'TENANT_SETTINGS_UPDATED',
        metadata: {
          changes: {
            description: description !== tenant.description,
            default_locale: true,
            primary_color: primaryColor !== tenant.primaryColor,
          }
        }
      });

      toast.success(t('settings.saveSuccess'));
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (!tenant) return null;

  const languages: { code: Locale; label: string }[] = [
    { code: 'pt-BR', label: t('language.ptBR') },
    { code: 'en', label: t('language.en') },
    { code: 'es', label: t('language.es') },
  ];

  // Preset colors
  const presetColors = [
    '#dc2626', // Red
    '#ea580c', // Orange
    '#ca8a04', // Yellow
    '#16a34a', // Green
    '#0891b2', // Cyan
    '#2563eb', // Blue
    '#7c3aed', // Violet
    '#db2777', // Pink
  ];

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="font-display text-3xl font-bold mb-2 flex items-center gap-3"
          >
            <Settings className="h-8 w-8 text-primary" />
            {t('settings.title')}
          </motion.h1>
          <p className="text-muted-foreground">{t('settings.generalDesc')}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* General Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {t('settings.general')}
                </CardTitle>
                <CardDescription>{t('settings.generalDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('settings.organizationName')}</Label>
                  <Input 
                    value={tenant.name} 
                    disabled 
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    O nome da organização não pode ser alterado por aqui.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('settings.description')}</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('settings.descriptionPlaceholder')}
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Language Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {t('settings.language')}
                </CardTitle>
                <CardDescription>{t('settings.languageDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>{t('settings.language')}</Label>
                  <Select value={defaultLocale} onValueChange={setDefaultLocale}>
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Branding Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  {t('settings.branding')}
                </CardTitle>
                <CardDescription>{t('settings.brandingDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('settings.primaryColor')}</Label>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      {presetColors.map(color => (
                        <button
                          key={color}
                          onClick={() => setPrimaryColor(color)}
                          className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
                          style={{ 
                            backgroundColor: color,
                            borderColor: primaryColor === color ? 'white' : 'transparent',
                            boxShadow: primaryColor === color ? `0 0 0 2px ${color}` : 'none'
                          }}
                        >
                          {primaryColor === color && (
                            <Check className="h-4 w-4 text-white mx-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-12 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-28 font-mono"
                        placeholder="#dc2626"
                      />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-6 p-4 border rounded-lg bg-muted/50">
                  <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
                  <div className="flex items-center gap-4">
                    <div 
                      className="h-12 w-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="font-bold" style={{ color: primaryColor }}>{tenant.name}</div>
                      <div className="text-sm text-muted-foreground">{description || 'Descrição da organização'}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button style={{ backgroundColor: primaryColor }} size="sm">
                      Botão Primário
                    </Button>
                    <Button variant="outline" size="sm" style={{ borderColor: primaryColor, color: primaryColor }}>
                      Botão Outline
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="lg">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('common.save')
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
