

# PI-P7.1.2 — i18n Hardening (Residual Sweep)

**Status:** Pronto para implementacao
**Tipo:** Higienizacao tecnica final
**Escopo:** Eliminar TODOS os usos residuais de Intl.*, toLocale*, date-fns fora de formatters.ts
**Impacto funcional:** Zero
**Risco de regressao:** Nulo
**Mudanca de comportamento:** Nenhuma

---

## 1. Diagnostico Completo do Codebase

A analise global revelou as seguintes violacoes residuais:

### 1.1 Violacoes `new Intl.*` (4 arquivos)

| Arquivo | Violacao | Linhas |
|---------|----------|--------|
| `AdminDashboard.tsx` | `formatAdminDate` e `formatAdminCurrency` locais | 223-240 |
| `TenantDashboard.tsx` | `Intl.DateTimeFormat` inline | 242-246 |
| `MembershipList.tsx` | `Intl.DateTimeFormat` inline | 141-144 |
| `exportCsv.ts` | `Intl.DateTimeFormat` + `Intl.NumberFormat` | 94-113 |

### 1.2 Violacoes `toLocaleDateString` (10 arquivos)

| Arquivo | Violacao | Linhas |
|---------|----------|--------|
| `PublicVerifyDocument.tsx` | `formatDate` local com hardcoded pt-BR | 234-244 |
| `TenantStatusBanner.tsx` | `toLocaleDateString` com locale map | 48-54 |
| `AthleteArea.tsx` | `formatDate` local hardcoded | 270-273 |
| `ApprovalsList.tsx` | `formatDate` local hardcoded | 131-136 |
| `MembershipStatus.tsx` | `toLocaleDateString` inline | 205-210 |
| `TenantControl.tsx` | `formatDate` local hardcoded | 331-337 |
| `AthletesList.tsx` | `formatDate` local hardcoded | 234-237 |
| `TenantBillingDialog.tsx` | `formatDate` local hardcoded | 138-144 |
| `VerifyMembership.tsx` | `formatDate` local hardcoded | 123-126 |
| `BillingTimeline.tsx` | `toLocaleDateString` com locale map | 66-73 |
| `BillingStatusBanner.tsx` | `toLocaleDateString` com locale map | 89-97 |

### 1.3 Violacoes `toLocaleString` (3 arquivos)

| Arquivo | Violacao | Linhas |
|---------|----------|--------|
| `AdminDashboard.tsx` | `toLocaleString('pt-BR')` para numeros | 385, 416 |
| `AuditLog.tsx` | `formatDate` com `toLocaleString` hardcoded | 67-75 |
| `AdminDiagnostics.tsx` | `toLocaleString()` sem locale | 87-90 |

### 1.4 Violacoes `date-fns` (17 arquivos)

| Arquivo | Tipo | Uso |
|---------|------|-----|
| `TenantDashboard.tsx` | `format`, `subMonths`, etc | Calculos + formatacao |
| `FederationDashboard.tsx` | `format` + `ptBR` hardcoded | Formatacao |
| `GradingHistoryCard.tsx` | `format` + locale switch | Formatacao |
| `MyEventsCard.tsx` | `format` + `ptBR` hardcoded | Formatacao |
| `AlertsPanel.tsx` | `formatDistanceToNow` | Tempo relativo |
| `DigitalMembershipCard.tsx` | `format` + locale switch | Formatacao |
| `admin/AuditLog.tsx` | `format` + `ptBR` hardcoded | Formatacao |
| `JobsHealthCard.tsx` | `formatDistanceToNow` | Tempo relativo |
| `SystemHealthCard.tsx` | `format`, `subDays` | Calculos + formatacao |
| `CardDiagnosticsPanel.tsx` | `format` | Formatacao |
| `PortalEvents.tsx` | `format` + locale switch | Formatacao |
| `admin/SystemHealth.tsx` | `formatDistanceToNow` | Tempo relativo |
| `SecurityTimeline.tsx` | `format` + `formatDistanceToNow` | Ambos |
| `CriticalEventsCard.tsx` | `formatDistanceToNow` | Tempo relativo |
| `EventCard.tsx` | `format` + `ptBR` hardcoded | Formatacao |
| `CreateEventDialog.tsx` | `format` | Date picker (interno) |
| `BracketViewer.tsx` | Possivel uso | Verificar |

**Total: 30+ arquivos, ~80 violacoes**

---

## 2. Decisao Arquitetural: date-fns

### 2.1 Usos Permitidos (NAO sao violacoes)

```typescript
// Calculos de data (sem formatacao visual)
import { subMonths, startOfMonth, addDays } from 'date-fns';
const lastMonth = subMonths(new Date(), 1);
```

### 2.2 Usos Proibidos (VIOLACOES)

```typescript
// Formatacao visual
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
format(date, "dd 'de' MMMM", { locale: ptBR }); // ❌

// Tempo relativo
import { formatDistanceToNow } from 'date-fns';
formatDistanceToNow(date, { addSuffix: true }); // ❌ → usar formatRelativeTime
```

### 2.3 Estrategia

- `format()` com locale → substituir por `formatDate()`
- `formatDistanceToNow()` → substituir por `formatRelativeTime()`
- `subMonths`, `startOfMonth`, etc → MANTER (calculos, nao formatacao)

---

## 3. Arquivos a Modificar (Ordem de Execucao)

### FASE 1 — Limpeza de `new Intl.*` (4 arquivos)

| # | Arquivo | Acao |
|---|---------|------|
| 1 | `AdminDashboard.tsx` | Remover `formatAdminDate`/`formatAdminCurrency`, usar formatters |
| 2 | `TenantDashboard.tsx` | Remover Intl inline, usar `formatRelativeTime` |
| 3 | `MembershipList.tsx` | Remover Intl inline, usar `formatDate` |
| 4 | `exportCsv.ts` | Delegar para formatters (ja usa locale param) |

### FASE 2 — Limpeza de `toLocaleDateString` (10 arquivos)

| # | Arquivo | Acao |
|---|---------|------|
| 5 | `PublicVerifyDocument.tsx` | Adicionar `useI18n`, usar `formatDate` |
| 6 | `TenantStatusBanner.tsx` | Usar `formatDate` de formatters |
| 7 | `AthleteArea.tsx` | Remover `formatDate` local |
| 8 | `ApprovalsList.tsx` | Remover `formatDate` local |
| 9 | `MembershipStatus.tsx` | Usar `formatDate` |
| 10 | `TenantControl.tsx` | Remover `formatDate` local |
| 11 | `AthletesList.tsx` | Remover `formatDate` local |
| 12 | `TenantBillingDialog.tsx` | Remover `formatDate` local |
| 13 | `VerifyMembership.tsx` | Remover `formatDate` local |
| 14 | `BillingTimeline.tsx` | Usar `formatDate` de formatters |
| 15 | `BillingStatusBanner.tsx` | Usar `formatDate` de formatters |

### FASE 3 — Limpeza de `toLocaleString` (2 arquivos restantes)

| # | Arquivo | Acao |
|---|---------|------|
| 16 | `AuditLog.tsx` | Usar `formatDateTime` |
| 17 | `AdminDiagnostics.tsx` | Usar `formatDateTime` |

### FASE 4 — Limpeza de `date-fns format/formatDistanceToNow` (15 arquivos)

| # | Arquivo | Acao |
|---|---------|------|
| 18 | `GradingHistoryCard.tsx` | Remover date-fns, usar `formatDate` |
| 19 | `MyEventsCard.tsx` | Remover date-fns, usar `formatDate` |
| 20 | `DigitalMembershipCard.tsx` | Remover date-fns, usar `formatDate` |
| 21 | `EventCard.tsx` | Remover date-fns, usar `formatDate` |
| 22 | `PortalEvents.tsx` | Remover date-fns format, usar `formatDate` |
| 23 | `FederationDashboard.tsx` | Remover date-fns format, usar `formatDate` |
| 24 | `admin/AuditLog.tsx` | Remover date-fns, usar `formatDateTime` |
| 25 | `SecurityTimeline.tsx` | Remover format/formatDistanceToNow, usar formatters |
| 26 | `AlertsPanel.tsx` | Usar `formatRelativeTime` |
| 27 | `JobsHealthCard.tsx` | Usar `formatRelativeTime` |
| 28 | `CriticalEventsCard.tsx` | Usar `formatRelativeTime` |
| 29 | `admin/SystemHealth.tsx` | Usar `formatRelativeTime` |
| 30 | `SystemHealthCard.tsx` | Manter calculos, remover format se houver |
| 31 | `CardDiagnosticsPanel.tsx` | Verificar e ajustar |
| 32 | `CreateEventDialog.tsx` | Verificar (pode ser date-picker interno) |

**Total: 32 arquivos a modificar**

---

## 4. Padrao de Substituicao

### 4.1 `toLocaleDateString` → `formatDate`

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

const { locale } = useI18n();
// Uso: formatDate(dateString, locale)
```

### 4.2 `toLocaleString` → `formatDateTime`

**Antes:**
```typescript
return new Date(dateStr).toLocaleString('pt-BR', {...});
```

**Depois:**
```typescript
return formatDateTime(dateStr, locale);
```

### 4.3 `formatDistanceToNow` → `formatRelativeTime`

**Antes:**
```typescript
import { formatDistanceToNow } from 'date-fns';
{formatDistanceToNow(new Date(date), { addSuffix: true })}
```

**Depois:**
```typescript
import { formatRelativeTime } from '@/lib/i18n/formatters';
{formatRelativeTime(date, locale)}
```

### 4.4 `date-fns format` → `formatDate`

**Antes:**
```typescript
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
format(date, "dd 'de' MMMM", { locale: ptBR })
```

**Depois:**
```typescript
import { formatDate } from '@/lib/i18n/formatters';
formatDate(date, locale, { dateStyle: 'long' })
```

### 4.5 `Intl.NumberFormat` para numeros (nao moeda)

**Antes:**
```typescript
{stat.value.toLocaleString('pt-BR')}
```

**Depois:**
```typescript
import { formatNumber } from '@/lib/i18n/formatters';
{formatNumber(stat.value, locale)}
```

---

## 5. Arquivos que NAO Serao Modificados

| Arquivo | Motivo |
|---------|--------|
| `formatters.ts` | Fonte canonica (onde Intl.* e permitido) |
| `chart.tsx` | `toLocaleString()` em contexto de UI numerica generica |
| Arquivos com apenas calculos date-fns | `subMonths`, `addDays` sao calculos, nao formatacao |

---

## 6. Criterios de Aceite (SAFE GOLD)

### 6.1 Validacao por Grep

```bash
# Nenhum Intl.* fora de formatters.ts
grep -r "new Intl\." src/ | grep -v formatters.ts
# Resultado esperado: 0 linhas

# Nenhum toLocaleDateString
grep -r "toLocaleDateString" src/
# Resultado esperado: 0 linhas

# Nenhum toLocaleString para datas/moedas
grep -r "toLocaleString" src/ | grep -E "(Date|'pt-BR')" 
# Resultado esperado: 0 linhas

# Nenhum date-fns format com locale hardcoded
grep -r "{ locale: ptBR }" src/
# Resultado esperado: 0 linhas

# Nenhum formatDistanceToNow
grep -r "formatDistanceToNow" src/
# Resultado esperado: 0 linhas
```

### 6.2 Validacao Visual

| Item | Resultado Esperado |
|------|-------------------|
| Datas em pt-BR | Inalteradas |
| Datas em en | Formato americano correto |
| Datas em es | Formato espanhol correto |
| Moedas | Corretas por locale |
| Tempos relativos | "ha 5 min" / "5 minutes ago" |

---

## 7. Fora de Escopo (Hard Freeze)

| Item | Motivo |
|------|--------|
| Novas features | Nao aplicavel |
| UX changes | Nao aplicavel |
| Performance | Nao impacta |
| Seguranca / RLS | Fora do dominio |
| Novos idiomas | Nao faz parte |
| Calculos date-fns | Permitidos (nao sao formatacao) |

---

## 8. Resumo Executivo

| Categoria | Arquivos |
|-----------|----------|
| `new Intl.*` | 4 |
| `toLocaleDateString` | 10 |
| `toLocaleString` | 2 |
| `date-fns format/formatDistanceToNow` | 15 |
| **Total** | **~32 arquivos** |

**Resultado esperado apos PI-P7.1.2:**

1. **Tema i18n/formatting ENCERRADO**
2. **100% conformidade SAFE GOLD**
3. **`formatters.ts` como fonte unica real**
4. **Zero excecoes ou residuos tecnicos**
5. **Sistema validavel por grep**
6. **Historico limpo, rastreavel e defensavel**

