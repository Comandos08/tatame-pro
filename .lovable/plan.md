
# PROMPT UX/01 — Logout + Header (Consistência Global)

## RESUMO DO DIAGNÓSTICO

| Métrica | Valor |
|---------|-------|
| Arquivos a CRIAR | 1 |
| Arquivos a MODIFICAR | 6 |
| Layouts afetados | AppShell ✅, PortalLayout ✅ |
| Risco de regressão | Baixo |

---

## DIAGNÓSTICO CONFIRMADO

### Arquitetura Atual de Layouts

O sistema utiliza 3 padrões de layout:

| Layout | Uso | Logout |
|--------|-----|--------|
| `AppShell` | Rotas `/app/*` (admin) | ✅ Presente (sidebar) |
| `PortalLayout` | Portal do atleta | ✅ Presente (header dropdown) |
| `PublicHeader` | Landing pages | ❌ Correto (não autenticado) |
| *(nenhum)* | Membership flows, Wizards | ❌ **PROBLEMA** |

### Páginas SEM Header Consistente (autenticadas)

| Página | Rota | Problema |
|--------|------|----------|
| `MembershipStatus.tsx` | `/:tenant/membership/status` | Sem header |
| `MembershipRenew.tsx` | `/:tenant/membership/renew` | Sem header |
| `MembershipSuccess.tsx` | `/:tenant/membership/success` | Sem header |
| `AdultMembershipForm.tsx` | `/:tenant/membership/adult` | Sem header |
| `IdentityWizard.tsx` | `/identity/wizard` | Logout inline, sem header |

### Páginas de Join (fluxo público-híbrido)

| Página | Rota | Situação |
|--------|------|----------|
| `JoinOrg.tsx` | `/join/org` | Logo TATAME (público) |
| `JoinAccount.tsx` | `/join/account` | Logo TATAME (público) |
| `JoinConfirm.tsx` | `/join/confirm` | **Requer login** — sem logout |

---

## ESTRATÉGIA TÉCNICA

### Abordagem: Criar `AuthenticatedHeader` Leve

Criar um componente minimalista de header para páginas autenticadas que não usam `AppShell` ou `PortalLayout`.

**Características:**
- Altura mínima (48px)
- Logo ou nome do tenant (se disponível)
- Botão de Logout sempre visível
- Sem navegação lateral
- Compatível com pages full-screen (wizards, forms)

---

## ALTERAÇÕES EXATAS

### 1. CRIAR: `src/components/auth/AuthenticatedHeader.tsx`

Componente leve que renderiza:
- Logo (tenant ou TATAME)
- User dropdown com Logout
- Theme toggle (opcional)
- Language selector (opcional)

```text
┌─────────────────────────────────────────────────────────┐
│  [Logo]                         [🌐] [☀️] [User ▾]     │
│                                          └─ Logout     │
└─────────────────────────────────────────────────────────┘
```

**Props:**
- `tenantName?: string`
- `tenantLogo?: string`
- `showBackButton?: boolean`
- `backTo?: string`

**Comportamento:**
- Se `isAuthenticated === true` → exibe header com logout
- Se `isAuthenticated === false` → não renderiza (página pública)

---

### 2. MODIFICAR: `src/pages/MembershipStatus.tsx`

**Local:** Container principal

**Antes:**
```tsx
<div className="min-h-screen bg-background">
  <div className="container max-w-2xl mx-auto px-4 py-8">
    ...
  </div>
</div>
```

**Depois:**
```tsx
<div className="min-h-screen bg-background">
  <AuthenticatedHeader 
    tenantName={tenant?.name}
    tenantLogo={tenant?.logoUrl}
  />
  <div className="container max-w-2xl mx-auto px-4 py-8">
    ...
  </div>
</div>
```

---

### 3. MODIFICAR: `src/pages/MembershipRenew.tsx`

**Local:** Container principal (linha ~223)

**Mesma abordagem:** Adicionar `<AuthenticatedHeader />` no topo.

---

### 4. MODIFICAR: `src/components/membership/MembershipSuccess.tsx`

**Local:** Container principal (linha ~56)

**Mesma abordagem:** Adicionar `<AuthenticatedHeader />` no topo.

---

### 5. MODIFICAR: `src/components/membership/AdultMembershipForm.tsx`

**Local:** Container principal do formulário

**Mesma abordagem:** Adicionar `<AuthenticatedHeader />` no topo.

---

### 6. MODIFICAR: `src/pages/IdentityWizard.tsx`

**Local:** Container principal (linha ~220)

**Comportamento especial:**
- Já possui botão de logout inline
- Adicionar header para consistência visual
- Manter logout inline como fallback

---

### 7. MODIFICAR: `src/pages/JoinConfirm.tsx`

**Local:** Container principal

**Comportamento:** Adicionar header se usuário autenticado (etapa após login)

---

## IMPLEMENTAÇÃO DO COMPONENTE

```tsx
// src/components/auth/AuthenticatedHeader.tsx

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Globe, Sun, Moon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';
import iconLogo from '@/assets/iconLogo.png';

interface AuthenticatedHeaderProps {
  tenantName?: string;
  tenantLogo?: string | null;
  tenantSlug?: string;
}

export function AuthenticatedHeader({ 
  tenantName, 
  tenantLogo,
  tenantSlug 
}: AuthenticatedHeaderProps) {
  const { currentUser, isAuthenticated, signOut } = useCurrentUser();
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Não renderiza se não autenticado
  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await signOut();
    navigate(tenantSlug ? `/${tenantSlug}` : '/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container max-w-4xl mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link to={tenantSlug ? `/${tenantSlug}` : '/'} className="flex items-center gap-2">
          {tenantLogo ? (
            <img src={tenantLogo} alt={tenantName || ''} className="h-8 w-8 rounded object-cover" />
          ) : (
            <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded object-contain" />
          )}
          {tenantName && (
            <span className="font-semibold text-sm hidden sm:inline">{tenantName}</span>
          )}
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* User menu with logout */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline text-sm max-w-[100px] truncate">
                  {currentUser?.name || currentUser?.email?.split('@')[0]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
```

---

## FLUXO CORRIGIDO

```text
ANTES:
┌───────────────────────────────────┐
│ MembershipStatus.tsx              │
│                                   │
│  [Back button]                    │
│                                   │
│  ┌─────────────────────────────┐  │
│  │      Status Card            │  │
│  │      (sem logout!)          │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘

DEPOIS:
┌───────────────────────────────────┐
│ [Logo]           [☀️] [User ▾]   │ ← AuthenticatedHeader
│                        └─ Logout │
├───────────────────────────────────┤
│                                   │
│  ┌─────────────────────────────┐  │
│  │      Status Card            │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## VALIDAÇÃO

| Cenário | Antes | Depois |
|---------|-------|--------|
| `/membership/status` | ❌ Sem logout | ✅ Header com logout |
| `/membership/renew` | ❌ Sem logout | ✅ Header com logout |
| `/membership/success` | ❌ Sem logout | ✅ Header com logout |
| `/membership/adult` | ❌ Sem logout | ✅ Header com logout |
| `/identity/wizard` | ⚠️ Inline only | ✅ Header + inline |
| `/:tenant/app/*` | ✅ AppShell | ✅ Mantido |
| `/:tenant/portal` | ✅ PortalLayout | ✅ Mantido |
| Páginas públicas | ✅ PublicHeader | ✅ Mantido |

---

## GARANTIAS

- **ZERO alteração de lógica de autenticação**
- **ZERO alteração de guards**
- **ZERO alteração de fluxos existentes**
- **ZERO impacto em impersonação** (ImpersonationBanner permanece)
- **ZERO alteração de layout de AppShell/PortalLayout**
- **Componente aditivo, não substitutivo**

---

## SEÇÃO TÉCNICA

### Integração com ImpersonationBanner

O `ImpersonationBanner` é renderizado em `AppProviders.tsx`, portanto aparece em TODAS as páginas. A adição de `AuthenticatedHeader` não interfere:

```text
AppProviders.tsx:
  └─ ImpersonationBanner (global, z-50)
  └─ ImpersonationBannerSpacer (padding top)
  └─ children
       └─ AuthenticatedHeader (sticky top-0, z-40)
       └─ Page content
```

### Prioridade de Z-Index

| Componente | Z-Index | Posição |
|------------|---------|---------|
| ImpersonationBanner | 50 | Topo absoluto |
| AuthenticatedHeader | 40 | Abaixo do banner |
| AppShell sidebar | 50 | Lateral |
| Modal/Dialog | 50+ | Overlay |

### Responsividade

- Mobile: Logo apenas, nome do usuário abreviado
- Desktop: Logo + tenant name, nome completo do usuário
