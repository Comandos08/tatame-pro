

## P1 + P1.1 — BILLING CONSOLIDATION (COM 3 CORREÇÕES OBRIGATÓRIAS)

### Correções Incorporadas

| Ajuste | Problema | Correção |
|--------|----------|----------|
| #1 | `status` usado antes de definido | Normalizar status ANTES de qualquer uso |
| #2 | `isReadOnly: false` no fallback | Mudar para `isReadOnly: true` (restritivo) |
| #3 | Tipos `Raw*` implícitos | Declarar explicitamente no arquivo |

---

### Arquivos a Criar

#### 1. `src/lib/billing/resolveTenantBillingState.ts`

```typescript
/**
 * CORE BILLING RESOLVER
 * Fonte de verdade única para estado de billing do tenant
 * 
 * REGRAS IMUTÁVEIS:
 * 1. Se is_manual_override = true → Stripe é COMPLETAMENTE ignorado
 * 2. canUseStripe = !isManualOverride
 * 3. Fallback é SEMPRE restritivo (isReadOnly: true, isBlocked: true)
 */

export type BillingStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE';

export type BillingSource = 'STRIPE' | 'MANUAL_OVERRIDE';

export interface TenantBillingState {
  status: BillingStatus;
  isManualOverride: boolean;
  isActive: boolean;
  isReadOnly: boolean;
  isBlocked: boolean;
  canUseStripe: boolean;
  source: BillingSource;
  overrideReason: string | null;
  overrideAt: Date | null;
}

// AJUSTE #3: Tipos Raw declarados explicitamente
interface RawBillingData {
  status: string | null;
  is_manual_override: boolean;
  override_reason?: string | null;
  override_at?: string | null;
}

interface RawTenantData {
  is_active: boolean;
}

const VALID_STATUSES: BillingStatus[] = [
  'ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE'
];

export function resolveTenantBillingState(
  billing: RawBillingData | null,
  tenant: RawTenantData | null
): TenantBillingState {
  // P1.1 FIX #2: Calcular isManualOverride ANTES do fallback
  const isManualOverride = billing?.is_manual_override === true;
  
  // Fallback quando dados ausentes - SEMPRE RESTRITIVO
  if (!billing || !tenant) {
    return {
      status: 'INCOMPLETE',
      isManualOverride,
      isActive: false,
      isReadOnly: true,           // AJUSTE #2: true, não false
      isBlocked: true,
      canUseStripe: !isManualOverride,
      source: isManualOverride ? 'MANUAL_OVERRIDE' : 'STRIPE',
      overrideReason: billing?.override_reason ?? null,
      overrideAt: billing?.override_at ? new Date(billing.override_at) : null,
    };
  }

  // AJUSTE #1: Normalizar status ANTES de qualquer uso
  const rawStatus = (billing.status || 'INCOMPLETE').toUpperCase() as BillingStatus;
  const status: BillingStatus = VALID_STATUSES.includes(rawStatus)
    ? rawStatus
    : 'INCOMPLETE';

  // Source e canUseStripe
  const source: BillingSource = isManualOverride ? 'MANUAL_OVERRIDE' : 'STRIPE';
  const canUseStripe = !isManualOverride;

  // P1.1 FIX #1: isActive respeita override manual
  const isActive = isManualOverride
    ? status === 'ACTIVE' || status === 'TRIALING'
    : tenant.is_active === true;

  // Flags derivadas
  const isBlocked = !isActive || status === 'CANCELED';
  const isReadOnly = ['PAST_DUE', 'UNPAID', 'INCOMPLETE'].includes(status);

  return {
    status,
    isManualOverride,
    isActive,
    isReadOnly,
    isBlocked,
    canUseStripe,
    source,
    overrideReason: billing.override_reason ?? null,
    overrideAt: billing.override_at ? new Date(billing.override_at) : null,
  };
}
```

#### 2. `src/lib/billing/index.ts`

```typescript
export {
  resolveTenantBillingState,
  type BillingStatus,
  type BillingSource,
  type TenantBillingState,
} from './resolveTenantBillingState';
```

---

### Arquivos a Modificar

#### 1. `src/hooks/useTenantStatus.ts`

**Mudanças:**
- Adicionar campos na query: `is_manual_override`, `override_reason`, `override_at`
- Importar e usar `resolveTenantBillingState`
- Expor novo campo `billingState: TenantBillingState`
- Derivar `isBlocked` e `hasBillingIssue` do resolver
- Manter API pública existente (backward compatible)

#### 2. `src/hooks/useBillingOverride.ts`

**Mudança:**
- Refatorar para wrapper do `useTenantStatus`
- Eliminar query duplicada
- Manter API pública existente

---

### Diagrama de Decisão Corrigido

```text
resolveTenantBillingState(billing, tenant)
│
├─ isManualOverride = billing?.is_manual_override ?? false
│
├─ billing = null OU tenant = null?
│   └── return {
│         status: INCOMPLETE,
│         isBlocked: true,
│         isReadOnly: true,    ← AJUSTE #2
│         source: isManualOverride ? MANUAL_OVERRIDE : STRIPE
│       }
│
├─ AJUSTE #1: Normalizar status
│   rawStatus = billing.status.toUpperCase()
│   status = VALID_STATUSES.includes(rawStatus) ? rawStatus : INCOMPLETE
│
├─ is_manual_override = true?
│   ├── source = MANUAL_OVERRIDE
│   ├── canUseStripe = false
│   └── isActive = (status == ACTIVE || status == TRIALING)
│
├─ is_manual_override = false?
│   ├── source = STRIPE
│   ├── canUseStripe = true
│   └── isActive = tenant.is_active
│
├─ isBlocked = !isActive || status == CANCELED
│
├─ isReadOnly = status in [PAST_DUE, UNPAID, INCOMPLETE]
│
└── return TenantBillingState
```

---

### Checklist de Validação

| Critério | Verificação |
|----------|-------------|
| ✅ `status` definido antes de uso | AJUSTE #1 aplicado |
| ✅ Fallback restritivo | `isReadOnly: true` (AJUSTE #2) |
| ✅ Tipos Raw explícitos | `RawBillingData`, `RawTenantData` declarados (AJUSTE #3) |
| ✅ TypeScript compila sem `any` | Tipos fortes em toda a cadeia |
| ✅ Override tem prioridade total | P1.1 FIX #1 |
| ✅ Source coerente no fallback | P1.1 FIX #2 |
| ✅ API pública preservada | Hooks mantêm contratos existentes |

---

### Resultado Esperado

```text
P1 + P1.1 — BILLING CONSOLIDATION (CORRIGIDO)
├── resolveTenantBillingState.ts (NOVO)
│   ├── AJUSTE #1: status normalizado antes de uso ✓
│   ├── AJUSTE #2: fallback isReadOnly: true ✓
│   └── AJUSTE #3: tipos Raw explícitos ✓
├── index.ts (NOVO)
├── useTenantStatus.ts (MODIFICADO)
├── useBillingOverride.ts (MODIFICADO)
└── CORE SAFE MODE preservado ✓
```

