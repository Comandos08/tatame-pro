

# P-HOME-HEADER-01 — REORGANIZAÇÃO DO HEADER PÚBLICO

## SAFE MODE · VISUAL ONLY · ZERO AUTH CONTEXT

---

## RESUMO DOS AJUSTES OBRIGATÓRIOS CONFIRMADOS

| Requisito | Status | Implementação |
|-----------|--------|---------------|
| Separação rígida (sem AuthContext/TenantContext) | ✅ | Nenhuma importação de contexts de auth/tenant/guards |
| Back button substitui totalmente a navegação | ✅ | `showBackButton ? <BackOnly /> : <FullNav />` |
| Altura h-14 fixa | ✅ | `className="h-14"` + `flex h-full` interno |
| Rankings apenas em modo tenant | ✅ | Só aparece no bloco `{!showBackButton && ...}` do tenant |
| Tema/idioma fora do header | ✅ | Removidos os DropdownMenus de Globe/Moon |
| Mobile-first: "Entrar" sempre visível | ✅ | Sem `hidden` no botão Entrar |
| CTA principal nunca escondido em mobile | ✅ | `hidden sm:flex` apenas no CTA secundário |

---

## MUDANÇAS NO ARQUIVO

### Arquivo: `src/components/PublicHeader.tsx`

**ANTES (234 linhas):**
```text
- InstitutionalSeal no header
- DropdownMenu de idioma (Globe)
- DropdownMenu de tema (Sun/Moon)
- TriggerButton forwardRef
- localeLabels map
- py-4 variável
- Rankings visível mesmo com showBackButton
- 7+ elementos à direita no modo TATAME
```

**DEPOIS (~130 linhas):**
```text
- Sem InstitutionalSeal
- Sem DropdownMenus
- Sem TriggerButton
- Sem localeLabels
- h-14 fixo
- Rankings nunca coexiste com showBackButton
- 4 elementos à direita no modo TATAME
- 5 elementos à direita no modo Tenant (ou 1 se back)
```

---

## CÓDIGO FINAL

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Trophy } from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
import logoTatameLight from '@/assets/logoTatameLight.png';
import logoTatameDark from '@/assets/logoTatameDark.png';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';

interface Tenant {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
}

interface PublicHeaderProps {
  tenant?: Tenant | null;
  showBackButton?: boolean;
  backTo?: string;
}

export default function PublicHeader({ tenant, showBackButton, backTo }: PublicHeaderProps) {
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();

  // MODE 1: TATAME HOME (no tenant)
  if (!tenant) {
    return (
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-full items-center justify-between px-4">
          {/* LEFT — Brand */}
          <Link to="/" className="flex items-center">
            <img 
              src={resolvedTheme === 'dark' ? logoTatameDark : logoTatameLight} 
              alt="TATAME" 
              className="h-8 w-auto object-contain" 
            />
          </Link>

          {/* RIGHT — Navigation + CTAs */}
          <nav className="flex items-center gap-2">
            {/* Link: Sobre (desktop only) */}
            <Button variant="ghost" size="sm" className="hidden md:flex" asChild>
              <Link to="/about">{t('nav.about')}</Link>
            </Button>

            {/* CTA: Entrar (ALWAYS visible - mobile-first) */}
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">{t('auth.login')}</Link>
            </Button>

            {/* CTA: Acessar Plataforma (primary, desktop) */}
            <Button size="sm" className="hidden sm:flex" asChild>
              <Link to="/login">
                {t('landing.accessPlatform')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>
    );
  }

  // MODE 2: TENANT PAGES
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-full items-center justify-between px-4">
        {/* LEFT — Brand */}
        <Link to={`/${tenant.slug}`} className="flex items-center gap-2">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <img src={iconLogo} alt={tenant.name} className="h-8 w-8 rounded-lg object-contain" />
          )}
          <span className="font-display text-base font-semibold truncate max-w-[150px] sm:max-w-none">
            {tenant.name}
          </span>
        </Link>

        {/* RIGHT — Navigation OR Back Button (MUTUALLY EXCLUSIVE) */}
        <nav className="flex items-center gap-2">
          {showBackButton ? (
            // BACK MODE: Only back button, NO other CTAs
            <Button variant="outline" size="sm" asChild>
              <Link to={backTo || `/${tenant.slug}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Link>
            </Button>
          ) : (
            // NAVIGATION MODE: Full navigation
            <>
              {/* Link: Eventos (desktop) */}
              <Button variant="ghost" size="sm" className="hidden sm:flex" asChild>
                <Link to={`/${tenant.slug}/events`}>{t('nav.events')}</Link>
              </Button>

              {/* Link: Rankings (TENANT ONLY, ghost + icon) */}
              <Button variant="ghost" size="sm" className="hidden md:flex" asChild>
                <Link to={`/${tenant.slug}/rankings`}>
                  <Trophy className="mr-2 h-4 w-4" />
                  Rankings
                </Link>
              </Button>

              {/* CTA: Entrar (ALWAYS visible - mobile-first) */}
              <Button variant="outline" size="sm" asChild>
                <Link to={`/${tenant.slug}/login`}>{t('auth.login')}</Link>
              </Button>

              {/* CTA: Acessar Portal (primary, uses tenant variant) */}
              <Button size="sm" variant="tenant" className="hidden sm:flex" asChild>
                <Link to={`/${tenant.slug}/portal`}>
                  {t('nav.accessPortal')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
```

---

## IMPORTS REMOVIDOS

```diff
- import { forwardRef } from 'react';
- import { Sun, Moon, Monitor, Globe, Check } from 'lucide-react';
- import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
- import { InstitutionalSeal } from '@/components/institutional';
```

---

## COMPARAÇÃO VISUAL

### MODO TATAME HOME

**Antes:**
```text
[Logo] │ <─────────────────────> │ [🏛️] [🌐] [🌙] [Sobre] [Entrar] [Acessar →]
        py-4                       7 elementos
```

**Depois:**
```text
[Logo] │ <─────────────────────> │ [Sobre] [Entrar] [Acessar →]
        h-14                       3 elementos
```

### MODO TENANT (navegação)

**Antes:**
```text
[Logo] TenantName │ <────> │ [🏆 Rankings] [🌐] [🌙] [Portal →]
        py-4                  4 elementos + toggles
```

**Depois:**
```text
[Logo] TenantName │ <────> │ [Eventos] [🏆 Rankings] [Entrar] [Portal →]
        h-14                  4 elementos, hierarquia clara
```

### MODO TENANT (back button)

**Antes:**
```text
[Logo] TenantName │ <────> │ [🏆 Rankings] [🌐] [🌙] [← Voltar]
                            Rankings ainda visível ❌
```

**Depois:**
```text
[Logo] TenantName │ <────> │ [← Voltar]
                            APENAS back button ✅
```

---

## GARANTIAS DE MOBILE-FIRST

| Elemento | Mobile (< 640px) | Desktop |
|----------|------------------|---------|
| Logo | ✅ Visível | ✅ Visível |
| Tenant Name | ✅ Truncado (150px) | ✅ Completo |
| "Entrar" | ✅ **SEMPRE visível** | ✅ Visível |
| "Sobre" | ❌ Hidden | ✅ Visível (md+) |
| "Eventos" | ❌ Hidden | ✅ Visível (sm+) |
| "Rankings" | ❌ Hidden | ✅ Visível (md+) |
| "Acessar Portal" | ❌ Hidden | ✅ Visível (sm+) |
| "Voltar" | ✅ **SEMPRE visível** | ✅ Visível |

---

## CONFIRMAÇÕES DOS AJUSTES OBRIGATÓRIOS

| Ajuste | Confirmação |
|--------|-------------|
| Nenhum AuthContext | ✅ Nenhuma importação de AuthContext |
| Nenhum TenantContext | ✅ Nenhuma importação de TenantContext |
| Nenhum guard | ✅ Zero guards |
| Back button exclusivo | ✅ `showBackButton ? <Back /> : <Nav />` |
| h-14 fixo | ✅ `className="h-14"` em ambos os modos |
| Proibido py-* | ✅ Removido `py-4`, usando `h-full` |
| Rankings só em tenant | ✅ Só aparece no bloco de tenant + navegação |
| Tema/idioma removidos | ✅ Nenhum DropdownMenu |
| "Entrar" sempre visível | ✅ Sem `hidden` no botão Entrar |
| CTA nunca escondido em mobile | ✅ "Entrar" sempre visível |

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/PublicHeader.tsx` | EDITAR | Refatoração completa |

---

## O QUE NÃO SERÁ ALTERADO

- ❌ Nenhum AuthContext
- ❌ Nenhum TenantContext
- ❌ Nenhum guard
- ❌ Nenhuma rota
- ❌ Nenhum AppShell
- ❌ Nenhuma Edge Function
- ❌ Nenhum banco

---

## CRITÉRIOS DE ACEITE

```text
✅ Header h-14 fixo
✅ Tema/idioma removidos do header
✅ "Entrar" sempre visível (mobile-first)
✅ Back button substitui totalmente navegação
✅ Rankings apenas em modo tenant (nunca TATAME Home)
✅ Zero importação de AuthContext/TenantContext/guards
✅ Zero regressão visual
```

