

# P1.4 — GOVERNANÇA VISÍVEL (SEM RUÍDO, SEM MARKETING)

## MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO criar novas rotas
- ❌ NÃO tocar em backend / Edge Functions
- ❌ NÃO alterar lógica existente
- ❌ NÃO criar CMS
- ❌ NÃO alterar auth / identity
- ❌ NÃO impactar tenants
- ❌ NÃO criar onboarding ou wizard
- ❌ NÃO adicionar CTAs obrigatórios
- ✅ APENAS UI informativa
- ✅ APENAS estados institucionais
- ✅ APENAS leitura (read-only)
- ✅ i18n obrigatório (pt / en / es)

---

## ARQUITETURA IDENTIFICADA

| Local | Estado Atual | Proposto |
|-------|--------------|----------|
| `src/components/institutional/` | Não existe | Criar diretório com componentes |
| PublicHeader | Sem selo institucional | Adicionar `InstitutionalSeal` |
| Footer (Landing/About) | Logo + "Sobre" + copyright | Adicionar `InstitutionalSeal` |
| AdminDashboard | `PostLoginInstitutionalBanner` | Adicionar `InstitutionalEnvironmentStatus` |
| TenantDashboard | `PostLoginInstitutionalBanner` | Adicionar `InstitutionalEnvironmentStatus` |
| AthletePortal | `PostLoginInstitutionalBanner` | Adicionar `InstitutionalEnvironmentStatus` |
| i18n | Sem chaves `institutional.*` | Adicionar 2 chaves |

---

## 1️⃣ NOVO COMPONENTE — InstitutionalSeal.tsx

### Localização

`src/components/institutional/InstitutionalSeal.tsx`

### Código

```tsx
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/contexts/I18nContext';

export function InstitutionalSeal() {
  const { t } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('institutional.seal')}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-center">
        <p>{t('institutional.sealTooltip')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

**Características:**
- Ícone `ShieldCheck` (discreto, institucional)
- Texto curto visível em telas maiores
- Tooltip explicativo no hover
- Zero impacto visual agressivo

---

## 2️⃣ NOVO COMPONENTE — InstitutionalEnvironmentStatus.tsx

### Localização

`src/components/institutional/InstitutionalEnvironmentStatus.tsx`

### Código

```tsx
import React from 'react';
import { useI18n } from '@/contexts/I18nContext';

export function InstitutionalEnvironmentStatus() {
  const { t } = useI18n();

  return (
    <div className="mb-4 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
      <span>{t('institutional.environment.active')}</span>
    </div>
  );
}
```

**Características:**
- Banner discreto, estilo informativo
- Não bloqueia navegação
- Cor neutra (muted)
- Apenas uma linha de texto

---

## 3️⃣ INDEX — src/components/institutional/index.ts

### Código

```tsx
export { InstitutionalSeal } from './InstitutionalSeal';
export { InstitutionalEnvironmentStatus } from './InstitutionalEnvironmentStatus';
```

---

## 4️⃣ PUBLICHEADER.TSX — INSERIR SELO

### Ponto de Inserção (modo sem tenant)

- **Linha:** 58 (dentro do `<div className="flex items-center gap-2">`)
- **Posição:** Após o logo, antes do Language Selector

### Código a Inserir

```tsx
// Import no topo
import { InstitutionalSeal } from '@/components/institutional';

// Dentro do header, no container flex direito, ANTES do Language Selector
<InstitutionalSeal />
```

### Posição Final na UI (sem tenant)

```text
[Logo TATAME] ......... [Selo] [Globe] [Theme] [Sobre] [Login] [Acessar Plataforma]
```

---

## 5️⃣ LANDING.TSX — FOOTER COM SELO

### Ponto de Alteração

- **Linha:** 320-332 (footer flex container)

### Código Atualizado

```tsx
// Import no topo
import { InstitutionalSeal } from '@/components/institutional';

// Footer atualizado
<footer className="py-8 border-t border-border">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-display font-bold">TATAME</span>
        </div>
        <InstitutionalSeal />
        <Link 
          to="/about" 
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('nav.about')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('landing.copyright').replace('{year}', new Date().getFullYear().toString())}
      </p>
    </div>
  </div>
</footer>
```

---

## 6️⃣ ABOUT.TSX — FOOTER COM SELO

### Ponto de Alteração

- **Linha:** 140-152 (footer section)

### Código Atualizado

```tsx
// Import no topo
import { InstitutionalSeal } from '@/components/institutional';

// Footer atualizado (igual ao Landing)
<footer className="py-8 border-t border-border">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-display font-bold">TATAME</span>
        </div>
        <InstitutionalSeal />
        <Link 
          to="/about" 
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('nav.about')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('landing.copyright').replace('{year}', new Date().getFullYear().toString())}
      </p>
    </div>
  </div>
</footer>
```

---

## 7️⃣ ADMINDASHBOARD.TSX — INSERIR STATUS

### Ponto de Inserção

- **Linha:** 348 (após `<PostLoginInstitutionalBanner />`)
- **Antes:** `<div className="mb-8">` (título do painel)

### Código a Inserir

```tsx
// Import no topo
import { InstitutionalEnvironmentStatus } from '@/components/institutional';

// Após PostLoginInstitutionalBanner
<InstitutionalEnvironmentStatus />
```

---

## 8️⃣ TENANTDASHBOARD.TSX — INSERIR STATUS

### Ponto de Inserção

- **Linha:** 258 (após `<PostLoginInstitutionalBanner />`)
- **Antes:** `<div>` com welcome message

### Código a Inserir

```tsx
// Import no topo
import { InstitutionalEnvironmentStatus } from '@/components/institutional';

// Após PostLoginInstitutionalBanner
<InstitutionalEnvironmentStatus />
```

---

## 9️⃣ ATHLETEPORTAL.TSX — INSERIR STATUS

### Ponto de Inserção

- **Linha:** 218 (após `<PostLoginInstitutionalBanner />`)
- **Antes:** `{/* Header */}` comment

### Código a Inserir

```tsx
// Import no topo
import { InstitutionalEnvironmentStatus } from '@/components/institutional';

// Após PostLoginInstitutionalBanner
<InstitutionalEnvironmentStatus />
```

---

## 🔟 i18n — CHAVES pt-BR.ts

### Ponto de Inserção

- **Após:** chaves `postlogin.institutional.*` (linha ~556)

### Chaves a Adicionar

```typescript
  // Institutional governance
  'institutional.seal': 'Infraestrutura Institucional',
  'institutional.sealTooltip': 'Plataforma de governança e registro esportivo oficial, com rastreabilidade e neutralidade institucional.',
  'institutional.environment.active': 'Este ambiente opera sob governança institucional ativa, com registros estruturados e rastreáveis.',
```

---

## 1️⃣1️⃣ i18n — CHAVES en.ts

### Chaves a Adicionar

```typescript
  // Institutional governance
  'institutional.seal': 'Institutional Infrastructure',
  'institutional.sealTooltip': 'Official sports governance and registration platform with traceability and institutional neutrality.',
  'institutional.environment.active': 'This environment operates under active institutional governance with structured and traceable records.',
```

---

## 1️⃣2️⃣ i18n — CHAVES es.ts

### Chaves a Adicionar

```typescript
  // Institutional governance
  'institutional.seal': 'Infraestructura Institucional',
  'institutional.sealTooltip': 'Plataforma oficial de gobernanza y registro deportivo con trazabilidad y neutralidad institucional.',
  'institutional.environment.active': 'Este entorno opera bajo gobernanza institucional activa con registros estructurados y trazables.',
```

---

## 📦 RESUMO DE ALTERAÇÕES

| Arquivo | Ação | Impacto |
|---------|------|---------|
| `src/components/institutional/InstitutionalSeal.tsx` | CRIAR | Componente reutilizável (~25 linhas) |
| `src/components/institutional/InstitutionalEnvironmentStatus.tsx` | CRIAR | Componente reutilizável (~15 linhas) |
| `src/components/institutional/index.ts` | CRIAR | Barrel export (~3 linhas) |
| `src/components/PublicHeader.tsx` | EDITAR | +1 import, +1 componente |
| `src/pages/Landing.tsx` | EDITAR | +1 import, +1 componente no footer |
| `src/pages/About.tsx` | EDITAR | +1 import, +1 componente no footer |
| `src/pages/AdminDashboard.tsx` | EDITAR | +1 import, +1 componente |
| `src/pages/TenantDashboard.tsx` | EDITAR | +1 import, +1 componente |
| `src/pages/AthletePortal.tsx` | EDITAR | +1 import, +1 componente |
| `src/locales/pt-BR.ts` | EDITAR | +3 chaves |
| `src/locales/en.ts` | EDITAR | +3 chaves |
| `src/locales/es.ts` | EDITAR | +3 chaves |

**Total de linhas alteradas:** ~70 linhas
**Novos arquivos:** 3

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ Selos por tenant
- ❌ Estados dinâmicos
- ❌ Compliance técnico
- ❌ Auditoria
- ❌ Logs
- ❌ Backend
- ❌ Configuração
- ❌ Admin settings

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Esperado |
|------|----------|
| Selo aparece no PublicHeader (sem tenant) | ✅ |
| Selo aparece no Footer (Landing) | ✅ |
| Selo aparece no Footer (About) | ✅ |
| Tooltip do selo funciona | ✅ |
| Status aparece em AdminDashboard | ✅ |
| Status aparece em TenantDashboard | ✅ |
| Status aparece em AthletePortal | ✅ |
| i18n completo pt/en/es | ✅ |
| Zero impacto em auth/identity | ✅ |
| Zero impacto em fluxos | ✅ |
| UX discreta, sem ruído | ✅ |

---

## 🏁 RESULTADO ESPERADO

Após P1.4:

- ✅ Governança visível em toda a plataforma
- ✅ Selo institucional como identidade de infraestrutura
- ✅ Estado do ambiente clarifica contexto operacional
- ✅ Plataforma com postura institucional madura
- ✅ UX sem fricção, sem marketing
- ✅ Base pronta para P2 (Eventos, Registros, Rankings)
- ✅ Tatame deixa de "parecer software" e passa a parecer infraestrutura

