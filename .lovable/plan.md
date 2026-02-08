
# PI-P7.1.1-F — UX & i18n Hardening (Final Closure)

**Status:** Pronto para implementacao
**Tipo:** Fechamento tecnico definitivo
**Escopo:** Eliminacao total de usos residuais de Intl.* e toLocale* fora de formatters.ts
**Impacto funcional:** Zero
**Risco de regressao:** Nulo

---

## 1. Diagnostico Completo

A analise dos 6 arquivos pendentes revelou as seguintes violacoes:

| Arquivo | Violacao | Linhas |
|---------|----------|--------|
| `EventDetails.tsx` | `date-fns format()` com locale ptBR | 5-6, 220, 223, 336 |
| `EventDetails.tsx` | `new Intl.NumberFormat('pt-BR', ...)` | 394 |
| `PublicEventDetails.tsx` | `date-fns format()` com locale ptBR | 5-6, 182, 242, 247-248 |
| `PublicEventDetails.tsx` | `new Intl.NumberFormat('pt-BR', ...)` | 325-328 |
| `VerifyCard.tsx` | `toLocaleDateString("pt-BR")` | 230, 238 |
| `VerifyDiploma.tsx` | `toLocaleDateString("pt-BR")` | 315 |
| `TenantDiagnostics.tsx` | `toLocaleString()` sem locale | 85 |
| `TenantBilling.tsx` | `new Intl.NumberFormat(...)` local | 108-118 |
| `TenantBilling.tsx` | `toLocaleDateString()` local | 120-131 |

**Total: 6 arquivos, ~15 violacoes**

---

## 2. Plano de Implementacao

### 2.1 EventDetails.tsx

**Remover:**
```typescript
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
```

**Adicionar:**
```typescript
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';
```

**Substituicoes:**
- Linha 220: `format(startDate, "dd 'de' MMMM", { locale: ptBR })` → `formatDate(startDate, locale)`
- Linha 223: `format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })` → `formatDate(endDate, locale)`
- Linha 336: `format(new Date(reg.created_at), 'dd/MM/yyyy')` → `formatDate(reg.created_at, locale, { dateStyle: 'short' })`
- Linha 394: `new Intl.NumberFormat('pt-BR', {...}).format(cat.price_cents / 100)` → `formatCurrency(cat.price_cents, locale, cat.currency)`

**Obter locale:**
```typescript
const { t, locale } = useI18n(); // ja existe t, adicionar locale
```

---

### 2.2 PublicEventDetails.tsx

**Remover:**
```typescript
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
```

**Adicionar:**
```typescript
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';
```

**Substituicoes:**
- Linha 182: `format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')` → comparacao direta de datas (sem formatacao visual)
- Linha 242: `format(startDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })` → `formatDate(startDate, locale, { dateStyle: 'long' })`
- Linhas 247-248: `format(startDate/endDate, ...)` → `formatDate(..., locale)`
- Linhas 325-328: `new Intl.NumberFormat('pt-BR', {...})` → `formatCurrency(category.price_cents, locale, category.currency)`

**Obter locale:**
```typescript
const { t, locale } = useI18n(); // adicionar locale
```

---

### 2.3 VerifyCard.tsx

**Adicionar:**
```typescript
import { formatDate } from '@/lib/i18n/formatters';
```

**Substituicoes:**
- Linha 230: `new Date(verification.issuedAt).toLocaleDateString("pt-BR")` → `formatDate(verification.issuedAt, locale)`
- Linha 238: `new Date(verification.validUntil).toLocaleDateString("pt-BR")` → `formatDate(verification.validUntil, locale)`

**Obter locale:**
```typescript
const { t, locale } = useI18n(); // adicionar locale
```

---

### 2.4 VerifyDiploma.tsx

**Adicionar:**
```typescript
import { formatDate } from '@/lib/i18n/formatters';
```

**Substituicoes:**
- Linha 315: `new Date(verification.promotionDate).toLocaleDateString("pt-BR")` → `formatDate(verification.promotionDate, locale)`

**Obter locale:**
```typescript
const { t, locale } = useI18n(); // adicionar locale
```

---

### 2.5 TenantDiagnostics.tsx

**Adicionar:**
```typescript
import { formatDateTime } from '@/lib/i18n/formatters';
```

**Substituicoes:**
- Linha 83-86: Funcao `formatTimestamp` local → usar `formatDateTime` de formatters

**Antes:**
```typescript
const formatTimestamp = (ts: string | null) => {
  if (!ts) return t('diagnostics.noData');
  return new Date(ts).toLocaleString();
};
```

**Depois:**
```typescript
const formatTimestamp = (ts: string | null) => {
  if (!ts) return t('diagnostics.noData');
  return formatDateTime(ts, locale);
};
```

**Obter locale:**
```typescript
const { t, locale } = useI18n(); // adicionar locale
```

---

### 2.6 TenantBilling.tsx

**Adicionar:**
```typescript
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';
```

**Remover funcoes locais:**
```typescript
// REMOVER linhas 108-132 (formatCurrency e formatDate locais)
```

**Substituicoes em uso:**
- Todas as chamadas de `formatCurrency(cents, currency)` → `formatCurrency(cents, locale, currency)`
- Todas as chamadas de `formatDate(dateString)` → `formatDate(dateString, locale)`

**Nota:** Este arquivo ja extrai `locale` de `useI18n()` (linha 54), apenas precisa usar os formatters centralizados.

---

## 3. Ordem de Execucao

```text
1. TenantDiagnostics.tsx   (menor impacto)
2. VerifyCard.tsx          (2 substituicoes)
3. VerifyDiploma.tsx       (1 substituicao)
4. TenantBilling.tsx       (remover helpers locais)
5. EventDetails.tsx        (remover date-fns)
6. PublicEventDetails.tsx  (remover date-fns)
```

---

## 4. Validacao Final (Grep)

Apos implementacao, executar:

```bash
# Nenhum Intl.* fora de formatters.ts
grep -r "new Intl\." src/ | grep -v formatters.ts
# Resultado esperado: 0 linhas

# Nenhum toLocaleDateString
grep -r "toLocaleDateString" src/
# Resultado esperado: 0 linhas

# Nenhum toLocaleString para datas
grep -r "toLocaleString" src/ | grep -v "value.toLocaleString"
# Resultado esperado: 0 linhas

# Nenhum date-fns format com locale hardcoded
grep -r "{ locale: ptBR }" src/
# Resultado esperado: 0 linhas
```

---

## 5. Resumo de Arquivos

| Arquivo | Tipo de Mudanca | Imports Removidos | Imports Adicionados |
|---------|-----------------|-------------------|---------------------|
| `TenantDiagnostics.tsx` | Substituir toLocaleString | - | `formatDateTime` |
| `VerifyCard.tsx` | Substituir toLocaleDateString | - | `formatDate` |
| `VerifyDiploma.tsx` | Substituir toLocaleDateString | - | `formatDate` |
| `TenantBilling.tsx` | Remover helpers locais | - | `formatDate`, `formatCurrency` |
| `EventDetails.tsx` | Remover date-fns | `format`, `ptBR` | `formatDate`, `formatCurrency` |
| `PublicEventDetails.tsx` | Remover date-fns | `format`, `ptBR` | `formatDate`, `formatCurrency` |

---

## 6. Criterios de Aceite

| Criterio | Validacao |
|----------|-----------|
| Nenhum `Intl.*` fora de formatters.ts | Grep global |
| Nenhum `toLocaleDateString` | Grep global |
| Nenhum `date-fns` com locale hardcoded | Grep global |
| Zero mudanca visual em pt-BR | Comparacao antes/depois |
| Datas corretas em en/es | Teste manual |
| Moedas corretas em todos locales | Teste manual |

---

## 7. Fora de Escopo

| Item | Motivo |
|------|--------|
| Novas funcionalidades | Fechamento tecnico |
| Mudancas de layout | Apenas formatacao |
| Refatoracoes adicionais | Escopo limitado |

---

## 8. Resultado Esperado

Ao final deste PI:

1. **PI-P7.1.1 oficialmente FECHADO**
2. **100% conformidade SAFE GOLD**
3. **`formatters.ts` como fonte unica real**
4. **Zero excecoes ou residuos tecnicos**
5. **Historico limpo e auditavel**
