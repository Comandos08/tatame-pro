import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Palette, Globe, Building2, Loader2, Check, Mail } from 'lucide-react';
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
import { logger } from '@/lib/logger';
import { LoadingState } from '@/components/ux/LoadingState';
import { BrandingUploadSection } from '@/components/settings/BrandingUploadSection';
import { hexToHsl } from '@/lib/colorUtils';
import { AdminBadgeCatalog } from '@/components/badges/AdminBadgeCatalog';
import { auditEvent } from '@/lib/audit/auditEvent';

export default function TenantSettings() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [description, setDescription] = useState('');
  const [defaultLocale, setDefaultLocale] = useState<string>('pt-BR');
  const [primaryColor, setPrimaryColor] = useState('#dc2626');
  const [billingEmail, setBillingEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [cardTemplateUrl, setCardTemplateUrl] = useState<string | null>(null);
  const [diplomaTemplateUrl, setDiplomaTemplateUrl] = useState<string | null>(null);

  // Declared via useCallback (stable) and before the consuming effect — the
  // React Compiler flags function-declaration hoisting across the useEffect
  // boundary as "Cannot access variable before it is declared". Capturing
  // `tenant?.id` into a primitive keeps the inferred and declared deps aligned.
  const tenantId = tenant?.id;
  const fetchTenantDetails = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data } = await supabase
      .from('tenants')
      .select('default_locale, billing_email, logo_url, card_template_url, diploma_template_url')
      .eq('id', tenantId)
      .single();

    if (data) {
      setDefaultLocale(data.default_locale || 'pt-BR');
      setBillingEmail(data.billing_email || '');
      setLogoUrl(data.logo_url);
      setCardTemplateUrl(data.card_template_url);
      setDiplomaTemplateUrl(data.diploma_template_url);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (tenant) {
      setDescription(tenant.description || '');
      setPrimaryColor(tenant.primaryColor || '#dc2626');
      setLogoUrl(tenant.logoUrl || null);
      fetchTenantDetails();
    }
  }, [tenant, fetchTenantDetails]);

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
          billing_email: billingEmail || null,
          logo_url: logoUrl,
          card_template_url: cardTemplateUrl,
          diploma_template_url: diplomaTemplateUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);

      if (error) throw error;

      // Log audit event (B3 — best-effort)
      auditEvent({
        event_type: 'TENANT_SETTINGS_UPDATED',
        tenant_id: tenant.id,
        profile_id: null, // resolved by RLS
        target_type: 'TENANT',
        target_id: tenant.id,
        metadata: {
          changes: {
            description: description !== tenant.description,
            default_locale: true,
            primary_color: primaryColor !== tenant.primaryColor,
            branding: true,
          }
        },
      });

      toast.success(t('settings.saveSuccess'));
    } catch (error) {
      logger.error('Error saving settings:', error);
      toast.error(t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function handleBrandingUpdate(field: string, url: string | null) {
    if (field === 'logo_url') setLogoUrl(url);
    if (field === 'card_template_url') setCardTemplateUrl(url);
    if (field === 'diploma_template_url') setDiplomaTemplateUrl(url);
  }

  if (!tenant) return <LoadingState titleKey="common.loading" />;

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

            {/* Billing Email */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  E-mail de Faturamento
                </CardTitle>
                <CardDescription>
                  E-mail para receber notificações de cobrança e faturas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="billingEmail">E-mail</Label>
                  <Input
                    id="billingEmail"
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder="financeiro@suaorganizacao.com"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se não preenchido, os e-mails serão enviados para os administradores do tenant.
                  </p>
                </div>
              </CardContent>
            </Card>
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
                  {/* Preview now uses same CSS variable pattern as production buttons */}
                  <div 
                    className="mt-4 flex gap-2"
                    style={{ '--tenant-primary': hexToHsl(primaryColor) } as React.CSSProperties}
                  >
                    <Button variant="tenant" size="sm">
                      Botão Primário
                    </Button>
                    <Button variant="tenant-outline" size="sm">
                      Botão Outline
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Badge Catalog Management */}
            <AdminBadgeCatalog tenantId={tenant.id} />

            {/* Branding Assets Upload */}
            <BrandingUploadSection
              tenantId={tenant.id}
              logoUrl={logoUrl}
              cardTemplateUrl={cardTemplateUrl}
              diplomaTemplateUrl={diplomaTemplateUrl}
              onUpdate={handleBrandingUpdate}
            />

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
