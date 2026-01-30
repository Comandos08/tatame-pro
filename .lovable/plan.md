

# PROMPT UX/03 — Impersonation Awareness + Context Clarity

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivos a MODIFICAR | 6 |
| Arquivos a CRIAR | 0 |
| Risco de regressão | Baixíssimo |
| Schema alterado | ZERO |
| Lógica de negócio | ZERO |

---

## DIAGNÓSTICO TÉCNICO

### Contexto Já Disponível

| Dado | Fonte | Disponível |
|------|-------|-----------|
| `isImpersonating` | `useImpersonation()` | ✅ |
| `session.targetTenantName` | `useImpersonation()` | ✅ |
| `tenant.name` | `useTenant()` | ✅ |
| Rota atual | `useLocation()` | ✅ |

### i18n Keys Existentes

```typescript
'impersonation.activeBanner': 'Modo Impersonation'
'impersonation.expiresIn': 'Expira em'
'impersonation.endSession': 'Encerrar Impersonation'
```

### Novas Keys Necessárias

```typescript
// pt-BR
'impersonation.operatingAs': 'Operando como'
'impersonation.tenant': 'Tenant'
'impersonation.mode': 'Modo'
'impersonation.modeAdmin': 'Admin'
'impersonation.modePortal': 'Portal'
'impersonation.modeOnboarding': 'Onboarding'
'impersonation.modePublic': 'Público'
'impersonation.supportMode': 'modo suporte'
'impersonation.badge': 'Impersonation'
```

---

## ALTERAÇÕES EXATAS

### 1. MODIFICAR: `src/locales/pt-BR.ts`

**Objetivo:** Adicionar novas keys de impersonation

**Linhas a adicionar após linha ~1435:**

```typescript
'impersonation.operatingAs': 'Operando como',
'impersonation.tenant': 'Tenant',
'impersonation.mode': 'Modo',
'impersonation.modeAdmin': 'Admin',
'impersonation.modePortal': 'Portal',
'impersonation.modeOnboarding': 'Onboarding',
'impersonation.modePublic': 'Público',
'impersonation.supportMode': 'modo suporte',
'impersonation.badge': 'Impersonation',
```

---

### 2. MODIFICAR: `src/locales/en.ts`

**Objetivo:** Adicionar novas keys em inglês

**Keys:**
```typescript
'impersonation.operatingAs': 'Operating as',
'impersonation.tenant': 'Tenant',
'impersonation.mode': 'Mode',
'impersonation.modeAdmin': 'Admin',
'impersonation.modePortal': 'Portal',
'impersonation.modeOnboarding': 'Onboarding',
'impersonation.modePublic': 'Public',
'impersonation.supportMode': 'support mode',
'impersonation.badge': 'Impersonation',
```

---

### 3. MODIFICAR: `src/locales/es.ts`

**Objetivo:** Adicionar novas keys em espanhol

**Keys:**
```typescript
'impersonation.operatingAs': 'Operando como',
'impersonation.tenant': 'Tenant',
'impersonation.mode': 'Modo',
'impersonation.modeAdmin': 'Admin',
'impersonation.modePortal': 'Portal',
'impersonation.modeOnboarding': 'Onboarding',
'impersonation.modePublic': 'Público',
'impersonation.supportMode': 'modo soporte',
'impersonation.badge': 'Impersonation',
```

---

### 4. MODIFICAR: `src/components/impersonation/ImpersonationBanner.tsx`

**Objetivo:** Adicionar contexto de navegação (modo) e tenant explícito

**Alterações:**

1. Adicionar import de `useLocation`:
```typescript
import { useLocation } from 'react-router-dom';
```

2. Adicionar derivação do modo de navegação:
```typescript
const location = useLocation();

const navigationMode = useMemo(() => {
  const path = location.pathname;
  if (path.includes('/app/onboarding')) return t('impersonation.modeOnboarding');
  if (path.includes('/app')) return t('impersonation.modeAdmin');
  if (path.includes('/portal')) return t('impersonation.modePortal');
  return t('impersonation.modePublic');
}, [location.pathname, t]);
```

3. Adicionar exibição expandida no banner:
```tsx
{/* Left: Icon + Message + Context */}
<div className="flex items-center gap-3 flex-wrap">
  <div className="flex items-center gap-2">
    {isExpiringSoon ? (
      <AlertTriangle className="h-5 w-5 animate-pulse" />
    ) : (
      <Shield className="h-5 w-5" />
    )}
    <span className="font-semibold text-sm md:text-base">
      {t('impersonation.activeBanner')}
    </span>
  </div>
  <span className="hidden sm:inline text-sm opacity-90">—</span>
  <div className="hidden sm:flex items-center gap-2 text-sm">
    <span className="opacity-80">{t('impersonation.tenant')}:</span>
    <span className="font-medium">{session.targetTenantName}</span>
    <span className="opacity-50">•</span>
    <span className="opacity-80">{t('impersonation.mode')}:</span>
    <span className="font-medium">{navigationMode}</span>
  </div>
</div>
```

---

### 5. MODIFICAR: `src/components/auth/AuthenticatedHeader.tsx`

**Objetivo:** Adicionar badge discreto quando impersonando

**Alterações:**

1. Adicionar import:
```typescript
import { useImpersonation } from '@/contexts/ImpersonationContext';
```

2. Dentro do componente, obter estado:
```typescript
const { isImpersonating } = useImpersonation();
```

3. Adicionar badge no header, ao lado do user dropdown:
```tsx
{/* Actions */}
<div className="flex items-center gap-2">
  {/* Impersonation badge */}
  {isImpersonating && (
    <span className="rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200 text-xs px-2 py-0.5 font-medium">
      {t('impersonation.badge')}
    </span>
  )}
  
  {/* Theme toggle */}
  ...
</div>
```

---

### 6. MODIFICAR: `src/layouts/AppShell.tsx`

**Objetivo:** Mostrar "Operando como: [Tenant]" no topo da sidebar

**Alterações:**

1. Adicionar import:
```typescript
import { useImpersonation } from '@/contexts/ImpersonationContext';
```

2. Dentro do componente:
```typescript
const { isImpersonating, session } = useImpersonation();
```

3. Após o logo na sidebar (após o botão X de fechar), adicionar:
```tsx
{/* Impersonation context indicator */}
{isImpersonating && session && (
  <div className="mx-4 mb-2 rounded-md bg-yellow-100 dark:bg-yellow-900/30 px-3 py-2 text-xs">
    <span className="text-yellow-800 dark:text-yellow-200 opacity-80">
      {t('impersonation.operatingAs')}:
    </span>
    <strong className="block truncate text-yellow-900 dark:text-yellow-100">
      {session.targetTenantName}
    </strong>
  </div>
)}
```

---

### 7. MODIFICAR: `src/layouts/PortalLayout.tsx`

**Objetivo:** Mostrar "(modo suporte)" discretamente no header

**Alterações:**

1. Adicionar import:
```typescript
import { useImpersonation } from '@/contexts/ImpersonationContext';
```

2. Dentro do componente:
```typescript
const { isImpersonating } = useImpersonation();
```

3. Após o nome do tenant no header, adicionar:
```tsx
<span className="font-display font-semibold text-foreground hidden sm:inline">
  {tenantName}
</span>
{isImpersonating && (
  <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
    ({t('impersonation.supportMode')})
  </span>
)}
```

---

## FLUXO VISUAL RESULTANTE

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚠️ MODO IMPERSONATION — Tenant: Acme Corp • Modo: Admin     [60m] [X]  │  ← Banner Global
├─────────────────────────────────────────────────────────────────────────┤
│ [Logo] Acme Corp                    [Impersonation] [☀️] [User ▾]      │  ← Header/AppShell
├────────────────┬────────────────────────────────────────────────────────┤
│ Operando como: │                                                        │
│ Acme Corp      │                                                        │  ← Sidebar
│ ────────────── │              Page Content                              │
│ Dashboard      │                                                        │
│ Athletes       │                                                        │
│ ...            │                                                        │
└────────────────┴────────────────────────────────────────────────────────┘
```

---

## VALIDAÇÃO

| Cenário | Antes | Depois |
|---------|-------|--------|
| Admin normal | Nenhum indicador | Nenhum indicador ✅ |
| Impersonando `/app` | Banner apenas | Banner + Badge + Sidebar + Modo "Admin" ✅ |
| Impersonando `/portal` | Banner apenas | Banner + Badge + "(modo suporte)" ✅ |
| Impersonando `/onboarding` | Banner apenas | Banner + Badge + Modo "Onboarding" ✅ |
| Exit impersonation | Banner some | Todos indicadores somem ✅ |

---

## GARANTIAS

- **ZERO alteração de lógica de autenticação**
- **ZERO alteração de guards**
- **ZERO alteração de permissões**
- **ZERO schema alterado**
- **100% aditivo** — apenas leitura de estado existente
- **Totalmente reversível** — pode remover sem impacto

---

## SEÇÃO TÉCNICA

### Derivação de Modo (Navigation Mode)

A lógica de derivação de modo é puramente baseada na rota:

```typescript
const navigationMode = useMemo(() => {
  const path = location.pathname;
  // Onboarding primeiro (mais específico)
  if (path.includes('/app/onboarding')) return 'Onboarding';
  // Admin routes
  if (path.includes('/app')) return 'Admin';
  // Portal routes
  if (path.includes('/portal')) return 'Portal';
  // Fallback
  return 'Public';
}, [location.pathname]);
```

### Cores do Badge/Indicadores

Usando cores amarelas (warning) para indicar estado especial:
- Light: `bg-yellow-100 text-yellow-800`
- Dark: `bg-yellow-900/50 text-yellow-200`

Estas cores são consistentes com o `ImpersonationBanner` existente que usa `bg-warning`.

### Z-Index e Posicionamento

| Componente | Z-Index | Comportamento |
|------------|---------|---------------|
| ImpersonationBanner | 100 (fixed) | Sempre no topo |
| AuthenticatedHeader | 40 (sticky) | Abaixo do banner |
| AppShell sidebar | 50 | Lateral, abaixo do banner |

Os novos indicadores são **inline** e não afetam z-index.

