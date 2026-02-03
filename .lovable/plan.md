

# P-HOME-HEADER-01.1 — REINTRODUÇÃO DE IDIOMA + TEMA (APROVADO)

## SAFE MODE · VISUAL ONLY · ZERO AUTH · ZERO REGRESSÃO

---

## RESUMO DAS MUDANÇAS

Reintroduzir controles de **Idioma** (Globe) e **Tema** (Sun/Moon) no header público modo TATAME Home, com os seguintes ajustes obrigatórios aplicados:

| Ajuste Obrigatório | Implementação |
|--------------------|---------------|
| Reuso de HeaderSettingsDropdown | ✅ Mesmo padrão de languages array + checkmark |
| Theme toggle light/dark only | ✅ Sem opção "system" no header público |
| Tooltip obrigatório | ✅ Tooltip em ambos os controles |
| Escopo rigoroso | ✅ Apenas bloco `if (!tenant)` afetado |

---

## ARQUIVO A MODIFICAR

| Arquivo | Ação |
|---------|------|
| `src/components/PublicHeader.tsx` | EDITAR |

---

## MUDANÇAS ESPECÍFICAS

### 1. Imports Adicionais (linhas 3, 12-18, 20)

```typescript
// ADICIONAR aos imports
import { Globe, Sun, Moon, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Locale } from '@/contexts/I18nContext';
```

### 2. Hooks Atualizados (linha 25-26)

```typescript
// DE:
const { resolvedTheme } = useTheme();
const { t } = useI18n();

// PARA:
const { resolvedTheme, setTheme } = useTheme();
const { t, locale, setLocale } = useI18n();
```

### 3. Languages Array (após linha 29)

```typescript
// ADICIONAR dentro do bloco if (!tenant)
const languages: { code: Locale; label: string }[] = [
  { code: 'pt-BR', label: t('language.ptBR') },
  { code: 'en', label: t('language.en') },
  { code: 'es', label: t('language.es') },
];
```

### 4. Substituir Bloco de Navegação (linhas 43-61)

**REMOVER** o link "Sobre":
```tsx
{/* Link: Sobre (desktop only) */}
<Button variant="ghost" size="sm" className="hidden md:flex" asChild>
  <Link to="/about">{t('nav.about')}</Link>
</Button>
```

**ADICIONAR** utilities + CTAs:
```tsx
{/* Utilities — Language & Theme (secondary, icons only) */}
<div className="flex items-center gap-1">
  {/* Language Dropdown — same UX as HeaderSettingsDropdown */}
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Globe className="h-4 w-4" />
            <span className="sr-only">{t('language.select')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t('language.select')}
      </TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end">
      {languages.map((lang) => (
        <DropdownMenuItem
          key={lang.code}
          onClick={() => setLocale(lang.code)}
          className="flex items-center justify-between cursor-pointer"
        >
          {lang.label}
          {locale === lang.code && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>

  {/* Theme Toggle — light/dark only (no system in public header) */}
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        <span className="sr-only">{t('theme.select')}</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      {t('theme.select')}
    </TooltipContent>
  </Tooltip>
</div>

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
```

---

## LAYOUT FINAL

```text
[Logo TATAME] ────────────────── [🌐] [🌓] [Entrar] [Acessar Plataforma →]
                                   │     │     │            │
                                   │     │     │            └── primary (hidden < sm)
                                   │     │     └── outline (SEMPRE visível)
                                   │     └── ghost icon (theme: light↔dark)
                                   └── ghost icon (language dropdown)
```

---

## RESPONSIVIDADE

| Elemento | Mobile | Desktop |
|----------|--------|---------|
| Language (🌐) | ✅ visível | ✅ visível |
| Theme (🌓) | ✅ visível | ✅ visível |
| "Entrar" | ✅ **SEMPRE** | ✅ visível |
| "Acessar Plataforma" | ❌ hidden | ✅ visível (sm+) |

---

## O QUE NÃO MUDA

- ❌ Modo Tenant — intocado
- ❌ Nenhum AuthContext
- ❌ Nenhum TenantContext  
- ❌ Nenhuma nova key i18n
- ❌ Nenhum backend

---

## CRITÉRIOS DE ACEITE

```text
✅ Idioma visível (Globe + dropdown)
✅ Tema visível (Sun/Moon toggle light↔dark)
✅ Tooltips funcionais
✅ "Sobre" removido
✅ CTAs mantêm hierarquia
✅ Zero regressão
```

