
# P1.2.B — LANDING PAGE: HERO BANNER + LOGOS DE PARCEIROS (SUPERADMIN)

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO criar CMS genérico
- ❌ NÃO alterar Edge Functions existentes
- ❌ NÃO impactar tenants
- ✅ APENAS Superadmin
- ✅ APENAS Landing Page
- ✅ Configuração Institucional simples

---

## ARQUITETURA IDENTIFICADA

| Aspecto | Atual | Proposto |
|---------|-------|----------|
| Rotas Admin | `/admin`, `/admin/diagnostics`, `/admin/tenants/:tenantId/control` | Adicionar `/admin/landing` |
| Proteção | `isGlobalSuperadmin` (via `useCurrentUser`) | Mesmo padrão |
| Padrão de Query | `enabled: isGlobalSuperadmin` | Mesmo padrão |
| i18n | Arquivos `src/locales/*.ts` | Adicionar chaves `admin.landing.*` e `landing.partnersTitle` |

---

## 1️⃣ MIGRAÇÃO — NOVAS TABELAS

### Arquivo: Nova migração SQL

```sql
-- Tabela 1: Configuração da Landing (hero)
CREATE TABLE IF NOT EXISTS public.platform_landing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_image_url text,
  hero_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir registro padrão (único registro)
INSERT INTO public.platform_landing_config (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Tabela 2: Parceiros / Logos
CREATE TABLE IF NOT EXISTS public.platform_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para ordenação
CREATE INDEX idx_platform_partners_order ON public.platform_partners(display_order);
```

### RLS Policies

```sql
-- Leitura pública (Landing Page)
ALTER TABLE public.platform_landing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_partners ENABLE ROW LEVEL SECURITY;

-- SELECT público
CREATE POLICY "Public read platform_landing_config"
  ON public.platform_landing_config FOR SELECT
  USING (true);

CREATE POLICY "Public read active platform_partners"
  ON public.platform_partners FOR SELECT
  USING (is_active = true);

-- INSERT/UPDATE/DELETE apenas SUPERADMIN
CREATE POLICY "Superadmin manage platform_landing_config"
  ON public.platform_landing_config FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmin manage platform_partners"
  ON public.platform_partners FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());
```

---

## 2️⃣ FRONTEND — LANDING PAGE

### Arquivo: `src/pages/Landing.tsx`

**2.1. Adicionar imports e query para config**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
```

**2.2. Adicionar queries dentro do componente**

```typescript
// Fetch landing config
const { data: landingConfig } = useQuery({
  queryKey: ['platform-landing-config'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('platform_landing_config')
      .select('hero_image_url, hero_enabled')
      .single();
    if (error) return null;
    return data;
  },
  staleTime: 5 * 60 * 1000, // 5 min cache
});

// Fetch active partners
const { data: partners } = useQuery({
  queryKey: ['platform-partners'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('platform_partners')
      .select('id, name, logo_url')
      .eq('is_active', true)
      .order('display_order');
    if (error) return [];
    return data;
  },
  staleTime: 5 * 60 * 1000,
});
```

**2.3. Modificar Hero Section (linhas 59-115)**

Adicionar background condicional:

```tsx
<section className="relative overflow-hidden">
  {/* Background: Hero image if enabled, otherwise gradient */}
  {landingConfig?.hero_enabled && landingConfig?.hero_image_url ? (
    <div 
      className="absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${landingConfig.hero_image_url})` }}
    >
      <div className="absolute inset-0 bg-background/80" /> {/* Overlay */}
    </div>
  ) : (
    <div className="absolute inset-0 bg-gradient-glow opacity-50" />
  )}
  
  {/* Header e conteúdo permanecem iguais */}
  ...
</section>
```

**2.4. Adicionar seção de Parceiros (após Features, antes do CTA)**

Inserir após linha 163 (fechamento da seção Features):

```tsx
{/* Partners Section */}
{partners && partners.length > 0 && (
  <section className="py-16 border-t border-border">
    <div className="container mx-auto px-4">
      <motion.div
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={stagger}
        className="text-center"
      >
        <motion.h3 
          variants={fadeInUp}
          className="text-muted-foreground text-sm uppercase tracking-wider mb-8"
        >
          {t('landing.partnersTitle')}
        </motion.h3>
        <motion.div 
          variants={fadeInUp}
          className="flex flex-wrap items-center justify-center gap-8 md:gap-12"
        >
          {partners.map((partner) => (
            <div 
              key={partner.id}
              className="h-12 grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100"
            >
              <img 
                src={partner.logo_url} 
                alt={partner.name}
                className="h-full w-auto object-contain"
              />
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  </section>
)}
```

---

## 3️⃣ PÁGINA ADMIN — LANDING SETTINGS

### Arquivo: `src/pages/AdminLandingSettings.tsx` (NOVO)

```typescript
/**
 * SUPERADMIN ONLY — Landing Page Configuration
 * Manages hero banner and partner logos
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Image, Users, Save, Plus, Trash2, 
  Loader2, Check, X, GripVertical 
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
  const { data: landingConfig, isLoading: configLoading } = useQuery({
    queryKey: ['admin-landing-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_landing_config')
        .select('*')
        .single();
      if (error) throw error;
      return data as LandingConfig;
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
```

---

## 4️⃣ ROTA ADMIN — REGISTRO

### Arquivo: `src/App.tsx`

Adicionar import e rota:

```typescript
// Adicionar import (linha ~23)
import AdminLandingSettings from "@/pages/AdminLandingSettings";

// Adicionar rota (após linha 66)
<Route path="/admin/landing" element={<AdminLandingSettings />} />
```

---

## 5️⃣ LINK NO ADMIN DASHBOARD

### Arquivo: `src/pages/AdminDashboard.tsx`

Adicionar link para a nova página (na área de ações do header ou como card):

```typescript
// Após PlatformHealthCard ou CardDiagnosticsPanel (~linha 418)
<Card className="card-hover cursor-pointer" onClick={() => navigate('/admin/landing')}>
  <CardHeader className="flex flex-row items-center gap-4">
    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
      <Image className="h-5 w-5 text-primary" />
    </div>
    <div>
      <CardTitle className="text-base">{t('admin.landing.title')}</CardTitle>
      <CardDescription>{t('admin.landing.cardDesc')}</CardDescription>
    </div>
  </CardHeader>
</Card>
```

Adicionar import:
```typescript
import { Image } from 'lucide-react'; // Adicionar ao import existente
```

---

## 6️⃣ CHAVES i18n

### Arquivo: `src/locales/pt-BR.ts`

```typescript
// Landing Partners (após landing.copyright, ~linha 589)
'landing.partnersTitle': 'Organizações que confiam',

// Admin Landing (~linha 600, nova seção)
'admin.landing.title': 'Configurações da Landing',
'admin.landing.subtitle': 'Hero e parceiros',
'admin.landing.cardDesc': 'Gerenciar banner e logos de parceiros',
'admin.landing.heroSection': 'Banner Hero',
'admin.landing.heroDesc': 'Configure a imagem de fundo da seção principal',
'admin.landing.heroEnabled': 'Ativar imagem de hero',
'admin.landing.heroImageUrl': 'URL da imagem',
'admin.landing.preview': 'Pré-visualização',
'admin.landing.partnersSection': 'Parceiros',
'admin.landing.partnersDesc': 'Logos de federações e organizações parceiras',
'admin.landing.addPartner': 'Adicionar Parceiro',
'admin.landing.editPartner': 'Editar Parceiro',
'admin.landing.partnerDialogDesc': 'Configure os dados do parceiro',
'admin.landing.partnerName': 'Nome',
'admin.landing.partnerLogoUrl': 'URL do Logo',
'admin.landing.partnerLogo': 'Logo',
'admin.landing.partnerOrder': 'Ordem',
'admin.landing.partnerActive': 'Ativo',
'admin.landing.noPartners': 'Nenhum parceiro cadastrado',
```

### Arquivo: `src/locales/en.ts`

```typescript
'landing.partnersTitle': 'Organizations that trust us',

'admin.landing.title': 'Landing Settings',
'admin.landing.subtitle': 'Hero and partners',
'admin.landing.cardDesc': 'Manage banner and partner logos',
'admin.landing.heroSection': 'Hero Banner',
'admin.landing.heroDesc': 'Configure the main section background image',
'admin.landing.heroEnabled': 'Enable hero image',
'admin.landing.heroImageUrl': 'Image URL',
'admin.landing.preview': 'Preview',
'admin.landing.partnersSection': 'Partners',
'admin.landing.partnersDesc': 'Logos from partner federations and organizations',
'admin.landing.addPartner': 'Add Partner',
'admin.landing.editPartner': 'Edit Partner',
'admin.landing.partnerDialogDesc': 'Configure partner details',
'admin.landing.partnerName': 'Name',
'admin.landing.partnerLogoUrl': 'Logo URL',
'admin.landing.partnerLogo': 'Logo',
'admin.landing.partnerOrder': 'Order',
'admin.landing.partnerActive': 'Active',
'admin.landing.noPartners': 'No partners registered',
```

### Arquivo: `src/locales/es.ts`

```typescript
'landing.partnersTitle': 'Organizaciones que confían',

'admin.landing.title': 'Configuración de Landing',
'admin.landing.subtitle': 'Hero y socios',
'admin.landing.cardDesc': 'Gestionar banner y logos de socios',
'admin.landing.heroSection': 'Banner Hero',
'admin.landing.heroDesc': 'Configure la imagen de fondo de la sección principal',
'admin.landing.heroEnabled': 'Activar imagen hero',
'admin.landing.heroImageUrl': 'URL de la imagen',
'admin.landing.preview': 'Vista previa',
'admin.landing.partnersSection': 'Socios',
'admin.landing.partnersDesc': 'Logos de federaciones y organizaciones socias',
'admin.landing.addPartner': 'Agregar Socio',
'admin.landing.editPartner': 'Editar Socio',
'admin.landing.partnerDialogDesc': 'Configure los datos del socio',
'admin.landing.partnerName': 'Nombre',
'admin.landing.partnerLogoUrl': 'URL del Logo',
'admin.landing.partnerLogo': 'Logo',
'admin.landing.partnerOrder': 'Orden',
'admin.landing.partnerActive': 'Activo',
'admin.landing.noPartners': 'Ningún socio registrado',
```

---

## 📦 RESUMO DE ARQUIVOS MODIFICADOS

| Arquivo | Ação | Tipo |
|---------|------|------|
| `supabase/migrations/new_migration.sql` | CRIAR | Migration |
| `src/pages/Landing.tsx` | EDITAR | Frontend |
| `src/pages/AdminLandingSettings.tsx` | CRIAR | Frontend |
| `src/pages/AdminDashboard.tsx` | EDITAR | Frontend |
| `src/App.tsx` | EDITAR | Rota |
| `src/locales/pt-BR.ts` | EDITAR | i18n (+19 chaves) |
| `src/locales/en.ts` | EDITAR | i18n (+19 chaves) |
| `src/locales/es.ts` | EDITAR | i18n (+19 chaves) |

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ CMS genérico
- ❌ Upload de arquivos (apenas URLs)
- ❌ Versionamento / histórico
- ❌ SEO avançado
- ❌ Eventos
- ❌ Conteúdo por tenant
- ❌ Permissões novas
- ❌ Editor visual / drag-and-drop

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Hero pode ser alterado sem deploy | ✅ |
| Logos exibem corretamente na Landing | ✅ |
| Apenas SUPERADMIN acessa /admin/landing | ✅ |
| Landing funciona sem config (fallback) | ✅ |
| Nenhum impacto em tenants | ✅ |
| Código simples e legível | ✅ |
| Console sem erros | ✅ |

❌ Qualquer violação → P1.2.B REPROVADO

---

## 🏁 RESULTADO FINAL

Após P1.2.B:

- ✅ Controle de autoridade institucional
- ✅ Reação a acordos e parcerias
- ✅ Landing transmite prova social
- ✅ Produto continua enxuto
- ✅ Nenhum risco arquitetural
