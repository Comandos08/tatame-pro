

# P4B-5A — i18n de Status & Labels (REVISADO)

## Modo: IMPLEMENTAÇÃO | GOLD MASTER | SAFE MODE

---

## Arquitetura Corrigida

### Princípios

| Componente | Responsabilidade |
|------------|------------------|
| `StatusBadge` | Renderiza badge com cores e label (recebido via prop) |
| `statusUtils.ts` | Type guard + helper de i18n key |
| Caller (AthletePortal, etc) | Resolve tradução e passa `label` |

### O que NÃO fazer

- ❌ `useI18n` dentro de StatusBadge
- ❌ Exportar regras de domínio do design system
- ❌ Acoplar UI base a contextos de app

---

## Arquivos a Modificar (ESCOPO FECHADO)

| Arquivo | Ação |
|---------|------|
| `src/lib/statusUtils.ts` | **CRIAR** — type guard + helper de i18n key |
| `src/components/ui/status-badge.tsx` | Remover `defaultStatusLabels` hardcoded |
| `src/pages/AthletePortal.tsx` | Usar type guard + passar label traduzido |
| `src/locales/pt-BR.ts` | Adicionar keys `status.*` |
| `src/locales/en.ts` | Adicionar keys `status.*` |
| `src/locales/es.ts` | Adicionar keys `status.*` |

---

## PARTE 1 — Criar `src/lib/statusUtils.ts`

Novo arquivo com utilitários de status (domínio, não UI):

```typescript
// src/lib/statusUtils.ts
// P4B-5A: Status utilities for type safety and i18n

import type { StatusType } from '@/components/ui/status-badge';

// Valid status values for type checking
const VALID_STATUSES: StatusType[] = [
  'DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'ACTIVE', 
  'EXPIRED', 'CANCELLED', 'REJECTED', 'TRIALING', 'PAST_DUE', 
  'INCOMPLETE', 'UNPAID', 'ISSUED', 'REVOKED', 'PAID', 'NOT_PAID', 
  'FAILED', 'success', 'warning', 'error', 'info', 'neutral'
];

/**
 * Type guard to validate if a string is a valid StatusType
 */
export function isValidStatusType(value: string | null | undefined): value is StatusType {
  return typeof value === 'string' && VALID_STATUSES.includes(value as StatusType);
}

/**
 * Get the i18n key for a status value
 * Usage: t(getStatusI18nKey('ACTIVE')) → 'status.active'
 */
export function getStatusI18nKey(status: StatusType): string {
  return `status.${status.toLowerCase()}`;
}
```

---

## PARTE 2 — Atualizar `status-badge.tsx`

### 2.1 Remover `defaultStatusLabels` (linhas 56-89)

Substituir por comentário explicativo:

```typescript
// P4B-5A: Labels are now handled via i18n by the caller
// Use the `label` prop to pass translated text
// Fallback: displays the status value as-is
```

### 2.2 Atualizar lógica do `displayLabel`

Linha 107:

```typescript
// P4B-5A: label prop is required for i18n, fallback to status string
const displayLabel = label || status;
```

**Resultado**: StatusBadge permanece puro, sem contexto, sem dependências de app.

---

## PARTE 3 — Atualizar `AthletePortal.tsx`

### 3.1 Adicionar imports

Após linha 25:

```typescript
import { isValidStatusType, getStatusI18nKey } from '@/lib/statusUtils';
```

### 3.2 Atualizar renderização do StatusBadge

Substituir linhas 238-240:

```tsx
{membershipStatus && isValidStatusType(membershipStatus) && (
  <StatusBadge 
    status={membershipStatus} 
    label={t(getStatusI18nKey(membershipStatus))}
  />
)}
```

**Lógica**:
1. `isValidStatusType` garante type safety
2. `getStatusI18nKey` gera a key i18n
3. `t()` resolve a tradução
4. `label` prop passa o texto traduzido para o StatusBadge

---

## PARTE 4 — i18n Keys (22 keys)

### pt-BR.ts — Inserir após linha 40 (seção "Common")

```typescript
  // Status labels (P4B-5A)
  'status.draft': 'Rascunho',
  'status.pending_payment': 'Aguardando pagamento',
  'status.pending_review': 'Aguardando aprovação',
  'status.approved': 'Aprovada',
  'status.active': 'Ativa',
  'status.expired': 'Expirada',
  'status.cancelled': 'Cancelada',
  'status.rejected': 'Rejeitada',
  'status.trialing': 'Período de teste',
  'status.past_due': 'Em atraso',
  'status.incomplete': 'Incompleto',
  'status.unpaid': 'Não pago',
  'status.issued': 'Emitido',
  'status.revoked': 'Revogado',
  'status.paid': 'Pago',
  'status.not_paid': 'Não pago',
  'status.failed': 'Falhou',
  'status.success': 'Sucesso',
  'status.warning': 'Atenção',
  'status.error': 'Erro',
  'status.info': 'Informação',
  'status.neutral': 'Neutro',
```

### en.ts — Inserir na mesma posição relativa

```typescript
  // Status labels (P4B-5A)
  'status.draft': 'Draft',
  'status.pending_payment': 'Pending payment',
  'status.pending_review': 'Pending review',
  'status.approved': 'Approved',
  'status.active': 'Active',
  'status.expired': 'Expired',
  'status.cancelled': 'Cancelled',
  'status.rejected': 'Rejected',
  'status.trialing': 'Trial period',
  'status.past_due': 'Past due',
  'status.incomplete': 'Incomplete',
  'status.unpaid': 'Unpaid',
  'status.issued': 'Issued',
  'status.revoked': 'Revoked',
  'status.paid': 'Paid',
  'status.not_paid': 'Not paid',
  'status.failed': 'Failed',
  'status.success': 'Success',
  'status.warning': 'Warning',
  'status.error': 'Error',
  'status.info': 'Information',
  'status.neutral': 'Neutral',
```

### es.ts — Inserir na mesma posição relativa

```typescript
  // Status labels (P4B-5A)
  'status.draft': 'Borrador',
  'status.pending_payment': 'Pago pendiente',
  'status.pending_review': 'Revisión pendiente',
  'status.approved': 'Aprobada',
  'status.active': 'Activa',
  'status.expired': 'Expirada',
  'status.cancelled': 'Cancelada',
  'status.rejected': 'Rechazada',
  'status.trialing': 'Período de prueba',
  'status.past_due': 'Vencido',
  'status.incomplete': 'Incompleto',
  'status.unpaid': 'No pagado',
  'status.issued': 'Emitido',
  'status.revoked': 'Revocado',
  'status.paid': 'Pagado',
  'status.not_paid': 'No pagado',
  'status.failed': 'Fallido',
  'status.success': 'Éxito',
  'status.warning': 'Atención',
  'status.error': 'Error',
  'status.info': 'Información',
  'status.neutral': 'Neutro',
```

---

## Diagrama de Dependências

```text
┌─────────────────────────────────────────────────────────────┐
│                     AthletePortal.tsx                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  const { t } = useI18n();                            │   │
│  │  if (isValidStatusType(status)) {                    │   │
│  │    <StatusBadge                                      │   │
│  │      status={status}                                 │   │
│  │      label={t(getStatusI18nKey(status))}            │   │
│  │    />                                                │   │
│  │  }                                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────┐
│  statusUtils.ts     │              │  status-badge.tsx   │
│  ─────────────────  │              │  ─────────────────  │
│  isValidStatusType  │              │  StatusBadge        │
│  getStatusI18nKey   │              │  (puro, sem i18n)   │
│  (domínio)          │              │  (design system)    │
└─────────────────────┘              └─────────────────────┘
```

---

## Checklist Final

| Critério | Status |
|----------|--------|
| StatusBadge sem useI18n | ✅ Permanece puro |
| Type guard em arquivo separado | ✅ `src/lib/statusUtils.ts` |
| Build error corrigido | ✅ `isValidStatusType()` garante tipo |
| Nenhum texto hardcoded | ✅ Labels via i18n |
| Fallback seguro | ✅ `label \|\| status` |
| i18n PT / EN / ES completos | ✅ 22 keys em cada |
| SAFE MODE preservado | ✅ Apenas leitura de dados |

---

## Ordem de Execução

1. **CRIAR `src/lib/statusUtils.ts`** — type guard + helper
2. **status-badge.tsx** — remover hardcoded labels
3. **AthletePortal.tsx** — usar utils + passar label traduzido
4. **pt-BR.ts** — 22 keys
5. **en.ts** — 22 keys
6. **es.ts** — 22 keys

