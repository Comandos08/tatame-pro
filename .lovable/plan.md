
# PI-P7.1 — UX Corrections (S3/S2) + i18n Formatting Hardening

**Status:** PLAN (Aguardando aprovação)
**Escopo:** Correções de UX priorizadas do PI-P7.0 (S3 e S2) + centralização de formatação
**Impacto funcional:** Baixo (mudança visual/comportamental previsível)
**Risco de regressão:** Controlado (mudanças localizadas + utilitários centralizados)

---

## 1. Diagnóstico do Estado Atual

### 1.1 Análise de Arquivos

| Problema | Arquivos Afetados | Evidência |
|----------|-------------------|-----------|
| Sidebar sem indicador ativo | `AppShell.tsx` linha 274-294 | Usa `Link` em vez de `NavLink` |
| Datas hardcoded `pt-BR` | 11 arquivos (55 ocorrências) | `toLocaleDateString('pt-BR')` |
| Moedas hardcoded `R$` | 3 arquivos (5+ ocorrências) | `R$ ${...toLocaleString('pt-BR')}` |
| NotFound genérico | `NotFound.tsx` | Texto fixo, sem detecção de contexto |
| Erro default genérico | `IdentityErrorScreen.tsx` | Apenas "tente novamente" |
| Onboarding required | `TenantOnboarding.tsx` | Alert só dentro do step |

### 1.2 Recursos Existentes Identificados

```text
✅ NavLink component em src/components/NavLink.tsx (já existe!)
✅ I18nContext com locale dinâmico (pt-BR, en, es)
✅ time.ts para utilitários de tempo
✅ Estrutura de locales completa (2500+ keys)
```

### 1.3 Arquivos a Criar

```text
src/lib/i18n/formatters.ts  — Formatação centralizada de datas/moedas
```

### 1.4 Arquivos a Modificar

```text
Prioridade S3 (Alta):
├── src/layouts/AppShell.tsx              — Sidebar active indicator
├── src/lib/i18n/formatters.ts            — CRIAR (centralização)
├── src/pages/TenantDashboard.tsx         — Datas
├── src/components/athlete/ProvisionalCard.tsx
├── src/components/athlete/DocumentsSection.tsx
├── src/pages/MembershipList.tsx
├── src/pages/MembershipDetails.tsx
├── src/pages/ApprovalDetails.tsx
├── src/pages/AthleteArea.tsx
├── src/components/athlete/EditablePersonalData.tsx
├── src/pages/VerifyMembership.tsx
├── src/pages/AthletesList.tsx
└── src/lib/exportCsv.ts

Prioridade S2 (Média):
├── src/pages/AdminDashboard.tsx          — Moedas
├── src/lib/formatAuditEvent.ts           — Moedas
├── src/pages/NotFound.tsx                — Contextualização
├── src/components/identity/IdentityErrorScreen.tsx — Erro default
├── src/pages/TenantOnboarding.tsx        — Required highlight
└── src/locales/*.ts                      — Novas keys i18n
```

---

## 2. Implementação Detalhada

### 2.1 Criar `src/lib/i18n/formatters.ts`

```typescript
/**
 * 🌐 I18n Formatting Utilities
 * PI-P7.1: Centralização de formatação de datas e moedas
 * 
 * SAFE GOLD: Todos os formatadores usam locale do contexto i18n.
 * PROIBIDO: Hardcode de 'pt-BR', 'R$' ou qualquer locale fixo.
 */

type LocaleCode = 'pt-BR' | 'en' | 'es';

// Mapear locale do app para Intl locale
const INTL_LOCALE_MAP: Record<LocaleCode, string> = {
  'pt-BR': 'pt-BR',
  'en': 'en-US',
  'es': 'es-ES',
};

/**
 * Obtém o locale Intl a partir do locale do app
 */
export function getIntlLocale(appLocale: LocaleCode): string {
  return INTL_LOCALE_MAP[appLocale] || 'pt-BR';
}

/**
 * Formata data usando locale dinâmico
 * @param date - Date, string ISO, ou timestamp
 * @param locale - Locale do app (pt-BR, en, es)
 * @param options - Opções de formatação (dateStyle: 'short' | 'medium' | 'long')
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  locale: LocaleCode,
  options: { dateStyle?: 'short' | 'medium' | 'long' } = { dateStyle: 'medium' }
): string {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (isNaN(dateObj.getTime())) return '-';
    
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: options.dateStyle,
    }).format(dateObj);
  } catch {
    return '-';
  }
}

/**
 * Formata data e hora usando locale dinâmico
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  locale: LocaleCode,
  options: { 
    dateStyle?: 'short' | 'medium' | 'long';
    timeStyle?: 'short' | 'medium' | 'long';
  } = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (isNaN(dateObj.getTime())) return '-';
    
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: options.dateStyle,
      timeStyle: options.timeStyle,
    }).format(dateObj);
  } catch {
    return '-';
  }
}

/**
 * Formata valor monetário usando locale dinâmico
 * @param amountMinor - Valor em centavos/unidades menores
 * @param locale - Locale do app
 * @param currency - Código da moeda (default: BRL)
 */
export function formatCurrency(
  amountMinor: number | null | undefined,
  locale: LocaleCode,
  currency: string = 'BRL'
): string {
  if (amountMinor === null || amountMinor === undefined) return '-';
  
  try {
    const amount = amountMinor / 100;
    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return '-';
  }
}

/**
 * Formata número usando locale dinâmico
 */
export function formatNumber(
  value: number | null | undefined,
  locale: LocaleCode,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined) return '-';
  
  try {
    return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
  } catch {
    return String(value);
  }
}
```

---

### 2.2 P7.1-S3-01 — Sidebar Active Indicator

**Arquivo:** `src/layouts/AppShell.tsx`

**Alteração:** Substituir `Link` por `NavLink` na navegação sidebar.

**Antes (linha 274-294):**
```tsx
<Link
  key={item.name}
  to={item.href}
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
>
```

**Depois:**
```tsx
import { NavLink } from '@/components/NavLink';

// Na navegação:
<NavLink
  key={item.name}
  to={item.href}
  end={item.href === `/${tenantSlug}/app`} // Exato match para dashboard
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
  aria-current="page"
>
```

**Também aplicar ao Help link (linha 287-293).**

---

### 2.3 P7.1-S3-02 — Substituição de Datas Hardcoded

**Padrão de substituição em cada arquivo:**

**Antes:**
```typescript
const formatDate = (dateString: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('pt-BR');
};
```

**Depois:**
```typescript
import { formatDate } from '@/lib/i18n/formatters';
import { useI18n } from '@/contexts/I18nContext';

// Dentro do componente:
const { locale } = useI18n();

// Uso:
{formatDate(dateString, locale)}
```

**Arquivos a modificar (11 no total):**

| Arquivo | Linhas | Uso |
|---------|--------|-----|
| `TenantDashboard.tsx` | 241 | Dashboard dates |
| `ProvisionalCard.tsx` | 69-72 | Card dates |
| `DocumentsSection.tsx` | 77-80 | Document dates |
| `MembershipList.tsx` | 140-143 | List dates |
| `MembershipDetails.tsx` | 290-293 | Details dates |
| `ApprovalDetails.tsx` | 365-368 | Approval dates |
| `AthleteArea.tsx` | 270-273 | Athlete dates |
| `EditablePersonalData.tsx` | 176-179 | Personal data dates |
| `VerifyMembership.tsx` | 123-126 | Verification dates |
| `AthletesList.tsx` | 234-237 | List dates |
| `exportCsv.ts` | 91-95 | Export dates |

---

### 2.4 P7.1-S2-01 — Substituição de Moedas Hardcoded

**Arquivo:** `src/pages/AdminDashboard.tsx` (linha 242)

**Antes:**
```typescript
{ labelKey: 'admin.monthlyRevenue', value: `R$ ${((billingMetrics?.monthlyRevenue || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, ...}
```

**Depois:**
```typescript
import { formatCurrency } from '@/lib/i18n/formatters';

{ labelKey: 'admin.monthlyRevenue', value: formatCurrency(billingMetrics?.monthlyRevenue || 0, locale), ...}
```

**Arquivo:** `src/lib/formatAuditEvent.ts` (linhas 93, 216)

**Antes:**
```typescript
const amount = amountCents !== undefined ? `R$ ${(amountCents / 100).toFixed(2)}` : '';
```

**Depois:**
```typescript
// Receber locale como parâmetro ou usar fallback
const amount = amountCents !== undefined 
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amountCents / 100)
  : '';
// Nota: formatAuditEvent pode não ter acesso ao contexto React, usar Intl direto com fallback
```

---

### 2.5 P7.1-S2-02 — Erro Default com Orientação Operacional

**Arquivo:** `src/locales/pt-BR.ts`

**Adicionar keys:**
```typescript
'identityError.default.title': 'Não foi possível verificar sua identidade',
'identityError.default.desc': 'Ocorreu um erro inesperado. Isso pode ser temporário.',
'identityError.default.hint': 'Você pode tentar novamente, sair e entrar de novo, ou contatar o suporte se o problema persistir.',
```

**Arquivo:** `src/locales/en.ts`
```typescript
'identityError.default.title': 'Could not verify your identity',
'identityError.default.desc': 'An unexpected error occurred. This may be temporary.',
'identityError.default.hint': 'You can try again, sign out and back in, or contact support if the problem persists.',
```

**Arquivo:** `src/locales/es.ts`
```typescript
'identityError.default.title': 'No se pudo verificar su identidad',
'identityError.default.desc': 'Ocurrió un error inesperado. Esto puede ser temporal.',
'identityError.default.hint': 'Puede intentarlo de nuevo, cerrar sesión y volver a entrar, o contactar al soporte si el problema persiste.',
```

**Arquivo:** `src/components/identity/IdentityErrorScreen.tsx`

**Adicionar hint ao default case:**
```typescript
default:
  return {
    icon: HelpCircle,
    iconVariant: 'muted',
    titleKey: 'identityError.default.title',
    descriptionKey: 'identityError.default.desc',
    hintKey: 'identityError.default.hint', // Nova prop
    actions: [
      { labelKey: 'common.retry', onClick: handleRetry },
      { labelKey: 'auth.logout', onClick: handleLogout },
      { labelKey: 'common.contactSupport', onClick: handleContactSupport },
    ],
  };
```

---

### 2.6 P7.1-S2-03 — NotFound Contextualizado

**Arquivo:** `src/pages/NotFound.tsx`

**Substituição completa:**

```tsx
import { useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Building2, Shield } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

type NotFoundContext = 'admin' | 'tenant' | 'public';

function deriveContext(pathname: string): NotFoundContext {
  if (pathname.startsWith('/admin')) return 'admin';
  // Tenant routes: /:slug/app/...
  const tenantAppMatch = pathname.match(/^\/[^/]+\/app/);
  if (tenantAppMatch) return 'tenant';
  return 'public';
}

const NotFound = () => {
  const location = useLocation();
  const { t } = useI18n();
  
  const context = deriveContext(location.pathname);

  // Log 404 for monitoring
  if (process.env.NODE_ENV === 'development') {
    console.warn("404 - Route not found:", location.pathname, "context:", context);
  }

  const config = {
    admin: {
      icon: Shield,
      titleKey: 'notFound.admin.title',
      descKey: 'notFound.admin.desc',
      ctaKey: 'notFound.admin.cta',
      ctaHref: '/admin',
    },
    tenant: {
      icon: Building2,
      titleKey: 'notFound.tenant.title',
      descKey: 'notFound.tenant.desc',
      ctaKey: 'notFound.tenant.cta',
      ctaHref: '/', // Will be dynamic based on tenant slug
    },
    public: {
      icon: Home,
      titleKey: 'notFound.public.title',
      descKey: 'notFound.public.desc',
      ctaKey: 'notFound.public.cta',
      ctaHref: '/',
    },
  }[context];

  // Extract tenant slug for tenant context
  const tenantSlugMatch = location.pathname.match(/^\/([^/]+)\/app/);
  const tenantSlug = tenantSlugMatch?.[1];
  const ctaHref = context === 'tenant' && tenantSlug 
    ? `/${tenantSlug}/app` 
    : config.ctaHref;

  const IconComponent = config.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <IconComponent className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-6xl font-display font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">{t(config.titleKey)}</p>
        <p className="text-sm text-muted-foreground">
          {t(config.descKey)}
        </p>
        <Button asChild className="mt-4">
          <Link to={ctaHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t(config.ctaKey)}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
```

**Novas keys i18n (pt-BR):**
```typescript
'notFound.admin.title': 'Página administrativa não encontrada',
'notFound.admin.desc': 'Esta página do painel administrativo não existe ou foi movida.',
'notFound.admin.cta': 'Voltar ao Admin',

'notFound.tenant.title': 'Página não encontrada',
'notFound.tenant.desc': 'A página que você está procurando não existe ou foi movida.',
'notFound.tenant.cta': 'Voltar ao Dashboard',

'notFound.public.title': 'Página não encontrada',
'notFound.public.desc': 'A página que você está procurando não existe ou foi movida.',
'notFound.public.cta': 'Voltar ao início',
```

---

### 2.7 P7.1-S2-04 — Onboarding Required Highlight

**Arquivo:** `src/pages/TenantOnboarding.tsx`

**Alteração na seção de step indicators (linhas 312-337):**

```tsx
{STEPS.map((step, idx) => {
  const config = stepConfig[step];
  const isComplete = 'complete' in config && config.complete;
  const isCurrent = step === currentStep;
  const isRequired = 'required' in config && config.required;
  const isRequiredIncomplete = isRequired && !isComplete;
  
  return (
    <button
      key={step}
      onClick={() => setCurrentStep(step)}
      className={`relative flex items-center justify-center h-10 w-10 rounded-full border-2 transition-all ${
        isCurrent 
          ? 'border-primary bg-primary text-primary-foreground' 
          : isComplete
          ? 'border-green-500 bg-green-500/10 text-green-500'
          : isRequiredIncomplete
          ? 'border-destructive bg-destructive/10 text-destructive'
          : 'border-muted bg-muted/50 text-muted-foreground'
      }`}
      title={isRequiredIncomplete ? t('onboarding.requiredStep') : undefined}
    >
      {isComplete ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <span className="text-sm font-medium">{idx + 1}</span>
      )}
      {/* Badge indicator for required incomplete */}
      {isRequiredIncomplete && !isCurrent && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
          !
        </span>
      )}
    </button>
  );
})}
```

---

### 2.8 P7.1-S2-05 — Mobile Menu Feedback

**Arquivo:** `src/layouts/AppShell.tsx`

**Alteração:** A correção do NavLink (S3-01) já resolve o problema principal. O estado ativo será visível quando o menu for reaberto.

**Opcional (baixa prioridade):** Fechar menu após navegação com animação suave.

```tsx
// Na navegação mobile, fechar sidebar após click
<NavLink
  key={item.name}
  to={item.href}
  onClick={() => setSidebarOpen(false)} // Fechar ao navegar
  // ... resto das props
>
```

---

## 3. Novas Keys i18n Consolidadas

### `src/locales/pt-BR.ts` (adicionar):

```typescript
// P7.1 — NotFound Contextual
'notFound.admin.title': 'Página administrativa não encontrada',
'notFound.admin.desc': 'Esta página do painel administrativo não existe ou foi movida.',
'notFound.admin.cta': 'Voltar ao Admin',
'notFound.tenant.title': 'Página não encontrada',
'notFound.tenant.desc': 'A página que você está procurando não existe ou foi movida.',
'notFound.tenant.cta': 'Voltar ao Dashboard',
'notFound.public.title': 'Página não encontrada',
'notFound.public.desc': 'A página que você está procurando não existe ou foi movida.',
'notFound.public.cta': 'Voltar ao início',

// P7.1 — Identity Error Default Enhanced
'identityError.default.hint': 'Você pode tentar novamente, sair e entrar de novo, ou contatar o suporte se o problema persistir.',
```

### `src/locales/en.ts` (adicionar):

```typescript
// P7.1 — NotFound Contextual
'notFound.admin.title': 'Admin page not found',
'notFound.admin.desc': 'This admin panel page does not exist or has been moved.',
'notFound.admin.cta': 'Back to Admin',
'notFound.tenant.title': 'Page not found',
'notFound.tenant.desc': 'The page you are looking for does not exist or has been moved.',
'notFound.tenant.cta': 'Back to Dashboard',
'notFound.public.title': 'Page not found',
'notFound.public.desc': 'The page you are looking for does not exist or has been moved.',
'notFound.public.cta': 'Back to Home',

// P7.1 — Identity Error Default Enhanced
'identityError.default.hint': 'You can try again, sign out and back in, or contact support if the problem persists.',
```

### `src/locales/es.ts` (adicionar):

```typescript
// P7.1 — NotFound Contextual
'notFound.admin.title': 'Página administrativa no encontrada',
'notFound.admin.desc': 'Esta página del panel administrativo no existe o fue movida.',
'notFound.admin.cta': 'Volver al Admin',
'notFound.tenant.title': 'Página no encontrada',
'notFound.tenant.desc': 'La página que busca no existe o fue movida.',
'notFound.tenant.cta': 'Volver al Dashboard',
'notFound.public.title': 'Página no encontrada',
'notFound.public.desc': 'La página que busca no existe o fue movida.',
'notFound.public.cta': 'Volver al inicio',

// P7.1 — Identity Error Default Enhanced
'identityError.default.hint': 'Puede intentarlo de nuevo, cerrar sesión y volver a entrar, o contactar al soporte si el problema persiste.',
```

---

## 4. Ordem de Execução

```text
1. Criar src/lib/i18n/formatters.ts
   ↓
2. Modificar AppShell.tsx (NavLink + sidebar active)
   ↓
3. Substituir datas hardcoded (11 arquivos)
   ↓
4. Substituir moedas hardcoded (2 arquivos)
   ↓
5. Adicionar keys i18n nos 3 locales
   ↓
6. Modificar NotFound.tsx (contextualização)
   ↓
7. Modificar IdentityErrorScreen.tsx (hint)
   ↓
8. Modificar TenantOnboarding.tsx (required highlight)
```

---

## 5. Critérios de Aceite

| Critério | Validação |
|----------|-----------|
| Sidebar mostra rota ativa | Navegar e verificar destaque visual |
| Datas respeitam locale | Trocar idioma EN/ES e verificar formato |
| Moedas usam Intl | Verificar formatação dinâmica |
| Erro default tem orientação | Forçar erro e ver hint |
| 404 contextualizado | Testar /admin/x, /tenant/app/x, /x |
| Onboarding required visível | Step incompleto obrigatório tem badge |
| Zero alteração em RLS/segurança | Apenas UI/formatting |

---

## 6. Fora de Escopo (Hard Freeze)

| Item | Motivo |
|------|--------|
| Preview de emissão de documentos | S1 |
| Filtros avançados em ApprovalsList | S1 |
| Redesign de tabela admin | S1 |
| Reestruturação do i18n | Apenas formatters |
| Mudanças em segurança/RLS | Fora do PI |

---

## 7. Resumo Executivo

| Item | Tipo | Arquivos |
|------|------|----------|
| Formatters centralizados | Criar | 1 |
| Sidebar active | Modificar | 1 |
| Datas hardcoded | Modificar | 11 |
| Moedas hardcoded | Modificar | 2 |
| NotFound contextual | Modificar | 1 |
| Identity error hint | Modificar | 1 |
| Onboarding required | Modificar | 1 |
| Keys i18n | Modificar | 3 |

**Total: 1 arquivo a criar, 20 arquivos a modificar**

---

## 8. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Mudança de formato de data quebra expectativas | Usar `dateStyle: 'medium'` (consistente) |
| Currency sem tenant config | Fallback BRL, mas locale dinâmico |
| Sidebar active em rotas dinâmicas | NavLink com `end` prop para dashboard |
| Regressão visual | Mudanças minimalistas, sem mexer em layout |
