
# PI-P7.1.1 — UX & i18n Hardening (Refino Técnico Pós-P7.1)

**Status:** PLAN (Aguardando aprovação)
**Escopo:** Refino técnico dos ajustes introduzidos no P7.1
**Impacto funcional:** Zero
**Risco de regressão:** Muito baixo
**Mudança de comportamento:** Nenhuma (somente padronização interna)

---

## 1. Diagnóstico do Estado Atual

### 1.1 Fontes de Inconsistência Identificadas

A busca revelou **95 usos diretos de `Intl.*`** e **155 usos de `toLocaleDateString/toLocaleString`** espalhados pelo código, apesar de `formatters.ts` já existir.

| Padrão Problemático | Arquivos | Ocorrências |
|---------------------|----------|-------------|
| `new Intl.NumberFormat('pt-BR', ...)` | 10 | ~25 |
| `new Intl.DateTimeFormat(...)` inline | 6 | ~12 |
| `.toLocaleDateString('pt-BR')` | 15+ | ~50 |
| `.toLocaleString('pt-BR')` | 5 | ~8 |
| `date-fns` com locale switch manual | 1 | 1 |

### 1.2 Arquivos com Maior Dívida Técnica

```text
CRÍTICO (formatação hardcoded 'pt-BR'):
├── src/components/athlete/EditablePersonalData.tsx      — formatDate local
├── src/components/athlete/DocumentsSection.tsx          — formatDate local
├── src/components/athlete/ProvisionalCard.tsx           — formatDate local
├── src/components/membership/YouthMembershipForm.tsx    — formatCurrency local
├── src/components/membership/AdultMembershipForm.tsx    — formatCurrency local
├── src/components/membership/RenewalBanner.tsx          — toLocaleDateString hardcoded
├── src/pages/MembershipDetails.tsx                      — formatDate + formatCurrency locais
├── src/pages/MembershipRenew.tsx                        — formatCurrency + toLocaleDateString
├── src/pages/ApprovalDetails.tsx                        — formatDate + formatCurrency locais
├── src/pages/AthleteGradingsPage.tsx                    — formatDate local
├── src/pages/EventDetails.tsx                           — Intl inline em JSX
├── src/pages/PublicEventDetails.tsx                     — Intl inline em JSX
├── src/pages/VerifyCard.tsx                             — toLocaleDateString inline
├── src/pages/VerifyDiploma.tsx                          — toLocaleDateString inline
└── src/components/events/EventRegistrationButton.tsx   — Intl inline em JSX

PARCIALMENTE MIGRADO (usa locale dinâmico mas Intl direto):
├── src/pages/AdminDashboard.tsx                         — formatAdminDate/formatAdminCurrency
├── src/pages/TenantDashboard.tsx                        — Intl.DateTimeFormat inline
├── src/pages/MembershipList.tsx                         — Intl.DateTimeFormat inline
├── src/pages/TenantBilling.tsx                          — Intl.NumberFormat com locale
├── src/lib/exportCsv.ts                                 — Intl com locale
└── src/components/billing/ManualOverrideBanner.tsx      — toLocaleDateString com ternário

LEGACY (date-fns):
└── src/components/portal/MembershipStatusCard.tsx       — date-fns format()
```

### 1.3 Tipagem de Locale

```text
Atualmente existem DOIS tipos:
├── src/contexts/I18nContext.tsx → export type Locale = "pt-BR" | "en" | "es"
└── src/lib/i18n/formatters.ts   → export type LocaleCode = 'pt-BR' | 'en' | 'es'

Precisam ser UNIFICADOS.
```

### 1.4 `formatAuditEvent.ts` Ainda Formata Localmente

```typescript
// Linha 93
const amount = amountCents !== undefined ? `R$ ${(amountCents / 100).toFixed(2)}` : '';

// Linha 216
description: amountCents !== undefined 
  ? `Valor: R$ ${(amountCents / 100).toFixed(2)}` 
  : 'Pagamento processado',
```

---

## 2. Decisões Arquiteturais

### 2.1 Tipo Canônico de Locale

```typescript
// src/lib/i18n/formatters.ts (fonte única)
export type AppLocale = 'pt-BR' | 'en' | 'es';

// src/contexts/I18nContext.tsx
import { type AppLocale } from '@/lib/i18n/formatters';
export type Locale = AppLocale; // Alias para compatibilidade
```

### 2.2 Regra de Uso Exclusivo

```text
❌ PROIBIDO:
   - new Intl.DateTimeFormat(...) fora de formatters.ts
   - new Intl.NumberFormat(...) fora de formatters.ts
   - .toLocaleDateString() em qualquer arquivo
   - .toLocaleString() para datas/moedas
   - date-fns format() com locale switch manual

✅ PERMITIDO:
   - formatDate(value, locale)
   - formatDateTime(value, locale)
   - formatCurrency(amountCents, locale, currency?)
   - formatNumber(value, locale, options?)
   - formatRelativeTime(date, locale)
```

### 2.3 Estratégia para `formatAuditEvent`

```typescript
// Nova assinatura (compatível com contexto não-React)
export function formatAuditEvent(
  eventType: string,
  metadata: Record<string, unknown>,
  locale: AppLocale = 'pt-BR'  // Parâmetro opcional com fallback
): FormattedAuditEvent;

// Uso nos componentes React:
const { locale } = useI18n();
const formatted = formatAuditEvent(event.type, event.metadata, locale);
```

---

## 3. Arquivos a Modificar

### 3.1 Infraestrutura (2 arquivos)

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/i18n/formatters.ts` | Renomear `LocaleCode` → `AppLocale`, documentar regras |
| `src/contexts/I18nContext.tsx` | Importar `AppLocale` de formatters, alias `Locale = AppLocale` |

### 3.2 Utilitário de Auditoria (1 arquivo)

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/formatAuditEvent.ts` | Adicionar parâmetro `locale`, usar `formatCurrency` |

### 3.3 Substituição de Hardcoded (20 arquivos)

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `src/components/athlete/EditablePersonalData.tsx` | Remover `formatDate` local, usar `formatters.formatDate` |
| `src/components/athlete/DocumentsSection.tsx` | Remover `formatDate` local |
| `src/components/athlete/ProvisionalCard.tsx` | Remover `formatDate` local |
| `src/components/membership/YouthMembershipForm.tsx` | Remover `formatCurrency` local, corrigir `toLocaleDateString` |
| `src/components/membership/AdultMembershipForm.tsx` | Remover `formatCurrency` local |
| `src/components/membership/RenewalBanner.tsx` | Substituir `toLocaleDateString` |
| `src/components/billing/ManualOverrideBanner.tsx` | Usar `formatDate` de formatters |
| `src/components/portal/MembershipStatusCard.tsx` | Remover date-fns, usar `formatDate` |
| `src/components/tenant/TenantStatusBanner.tsx` | Usar `formatDate` de formatters |
| `src/components/billing/BillingStatusBanner.tsx` | Usar `formatDate` de formatters |
| `src/components/events/EventRegistrationButton.tsx` | Usar `formatCurrency` |
| `src/pages/MembershipDetails.tsx` | Remover helpers locais |
| `src/pages/MembershipRenew.tsx` | Remover `formatCurrency` local + `toLocaleDateString` |
| `src/pages/ApprovalDetails.tsx` | Remover helpers locais |
| `src/pages/AthleteGradingsPage.tsx` | Remover `formatDate` local |
| `src/pages/EventDetails.tsx` | Usar `formatCurrency` |
| `src/pages/PublicEventDetails.tsx` | Usar `formatCurrency` |
| `src/pages/VerifyCard.tsx` | Substituir `toLocaleDateString` inline |
| `src/pages/VerifyDiploma.tsx` | Substituir `toLocaleDateString` inline |
| `src/pages/TenantDiagnostics.tsx` | Substituir `toLocaleString` |

### 3.4 Consolidação de Já Migrados (5 arquivos)

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/AdminDashboard.tsx` | Remover `formatAdminDate`/`formatAdminCurrency`, usar formatters |
| `src/pages/TenantDashboard.tsx` | Remover `Intl.DateTimeFormat` inline |
| `src/pages/MembershipList.tsx` | Remover `Intl.DateTimeFormat` inline |
| `src/pages/TenantBilling.tsx` | Usar `formatCurrency` de formatters |
| `src/lib/exportCsv.ts` | Usar formatters diretamente |

---

## 4. Ordem de Execução

```text
FASE 1 — Infraestrutura
│
├── 1.1 Atualizar src/lib/i18n/formatters.ts
│       - Renomear LocaleCode → AppLocale
│       - Adicionar header de documentação
│       - Exportar AppLocale como tipo principal
│
├── 1.2 Atualizar src/contexts/I18nContext.tsx
│       - Importar AppLocale de formatters
│       - Manter alias Locale = AppLocale
│
└── 1.3 Refatorar src/lib/formatAuditEvent.ts
        - Adicionar parâmetro locale opcional
        - Substituir R$ hardcoded por formatCurrency
        - Importar formatCurrency de formatters

FASE 2 — Componentes com helpers locais (remover duplicação)
│
├── 2.1 src/components/athlete/*.tsx (3 arquivos)
├── 2.2 src/components/membership/*.tsx (3 arquivos)
├── 2.3 src/components/billing/*.tsx (2 arquivos)
├── 2.4 src/components/portal/MembershipStatusCard.tsx
├── 2.5 src/components/tenant/TenantStatusBanner.tsx
└── 2.6 src/components/events/EventRegistrationButton.tsx

FASE 3 — Páginas com Intl inline ou toLocaleDateString
│
├── 3.1 src/pages/Membership*.tsx (3 arquivos)
├── 3.2 src/pages/Approval*.tsx (1 arquivo)
├── 3.3 src/pages/Athlete*.tsx (1 arquivo)
├── 3.4 src/pages/Event*.tsx (2 arquivos)
├── 3.5 src/pages/Verify*.tsx (2 arquivos)
├── 3.6 src/pages/Tenant*.tsx (3 arquivos)
└── 3.7 src/pages/Admin*.tsx (1 arquivo)

FASE 4 — Utilitários
│
└── 4.1 src/lib/exportCsv.ts

FASE 5 — Verificação Final
│
└── 5.1 Grep global: 'new Intl\.' + 'toLocaleDateString' + 'toLocaleString'
        Resultado esperado: 0 ocorrências fora de formatters.ts
```

---

## 5. Detalhes Técnicos de Implementação

### 5.1 Atualização de `formatters.ts`

```typescript
/**
 * 🌐 I18n Formatting Utilities — SAFE GOLD
 * PI-P7.1.1: Centralização definitiva de formatação de datas, moedas e números
 * 
 * REGRAS ARQUITETURAIS:
 * ❌ PROIBIDO usar Intl.* diretamente fora deste arquivo
 * ❌ PROIBIDO usar .toLocaleDateString() / .toLocaleString() em qualquer lugar
 * ❌ PROIBIDO usar date-fns com locale switch manual
 * ✅ OBRIGATÓRIO usar APENAS estas funções exportadas
 * 
 * FUNÇÕES DISPONÍVEIS:
 * - formatDate(value, locale, options?)      → "15 de jan. de 2025"
 * - formatDateTime(value, locale, options?)  → "15 de jan. de 2025, 14:30"
 * - formatCurrency(cents, locale, currency?) → "R$ 150,00"
 * - formatNumber(value, locale, options?)    → "1.234,56"
 * - formatRelativeTime(date, locale)         → "há 5 minutos"
 */

export type AppLocale = 'pt-BR' | 'en' | 'es';

// Alias para compatibilidade com código existente
export type LocaleCode = AppLocale;

// ... resto das funções existentes
```

### 5.2 Padrão de Substituição em Componentes

**Antes:**
```tsx
const formatDate = (dateString: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('pt-BR');
};
```

**Depois:**
```tsx
import { formatDate } from '@/lib/i18n/formatters';
import { useI18n } from '@/contexts/I18nContext';

const { locale } = useI18n();

// No JSX:
{formatDate(dateString, locale)}
```

### 5.3 Padrão para `formatAuditEvent`

**Antes:**
```typescript
case 'MEMBERSHIP_PAID': {
  const amount = amountCents !== undefined ? `R$ ${(amountCents / 100).toFixed(2)}` : '';
  return { ... };
}
```

**Depois:**
```typescript
import { formatCurrency, type AppLocale } from '@/lib/i18n/formatters';

export function formatAuditEvent(
  eventType: string,
  metadata: Record<string, unknown>,
  locale: AppLocale = 'pt-BR'
): FormattedAuditEvent {
  // ...
  case 'MEMBERSHIP_PAID': {
    const amount = amountCents !== undefined 
      ? formatCurrency(amountCents, locale) 
      : '';
    return { ... };
  }
}
```

---

## 6. Critérios de Aceite (SAFE GOLD)

| Critério | Validação |
|----------|-----------|
| Nenhum `Intl.*` fora de formatters.ts | `grep -r "new Intl\." src/ \| grep -v formatters.ts` → 0 resultados |
| Nenhum `toLocaleDateString` no código | `grep -r "toLocaleDateString" src/` → 0 resultados |
| Nenhum `toLocaleString` para datas | `grep -r "toLocaleString" src/ \| grep -v "value.toLocaleString"` → 0 resultados |
| `formatRelativeTime` documentado | Header de formatters.ts atualizado |
| `formatAuditEvent` sem lógica de formatação própria | Code review |
| Tipagem unificada `AppLocale` | `grep -r "LocaleCode \| Locale" src/` → apenas aliases |
| Zero mudança visual | Comparação antes/depois em pt-BR, en, es |
| Zero mudança funcional | Fluxos intactos |

---

## 7. Fora de Escopo (Hard Freeze)

| Item | Motivo |
|------|--------|
| Nova UX | Não é objetivo |
| Novos componentes | Não é objetivo |
| Novos idiomas | Fora do ciclo |
| Mudança de layout | Fora do ciclo |
| Segurança / RLS | Fora do domínio |
| Performance | Sem impacto |

---

## 8. Resumo Executivo

| Categoria | Arquivos |
|-----------|----------|
| Infraestrutura | 2 |
| Utilitário de Auditoria | 1 |
| Componentes | 11 |
| Páginas | 13 |
| Utilitários | 1 |
| **Total** | **28 arquivos** |

**Resultado esperado:**

1. **Fonte única de verdade:** `src/lib/i18n/formatters.ts`
2. **Tipo canônico:** `AppLocale` exportado e usado em todo o sistema
3. **Zero duplicação:** Nenhum `formatDate`, `formatCurrency` local em componentes
4. **Disciplina arquitetural:** Regras documentadas no header do arquivo
5. **Histórico limpo:** Sem "remendos silenciosos" — tudo rastreável via PI-P7.1.1
