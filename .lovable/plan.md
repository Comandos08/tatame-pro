
# P0.1 — TENANT ONBOARDING FLAG CONTRACT FIX

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivos a MODIFICAR | 3 |
| Linhas alteradas | ~5 |
| Alterações em P0/P2/P3/P4 | ZERO |
| Novos redirects | ZERO |
| Novo comportamento | ZERO |

---

## DIAGNÓSTICO CONFIRMADO

O bug é estrutural:

1. **Flag existe no banco**: `tenants.onboarding_completed` ✅
2. **Edge Function escreve corretamente**: `complete-tenant-onboarding` ✅
3. **Tipo TypeScript não declara a propriedade**: ❌
4. **TenantContext não carrega a flag**: ❌
5. **TenantOnboardingGate usa type assertion para ler undefined**: ❌

**Resultado**: Gate sempre redireciona para `/app/onboarding` porque `undefined !== true`.

---

## ALTERAÇÕES EXATAS

### 1. `src/types/tenant.ts` (Linha 14)

**Ação**: Adicionar propriedade `onboardingCompleted` ao tipo `Tenant`.

```typescript
// ANTES (linha 14):
  updatedAt: string;
}

// DEPOIS:
  updatedAt: string;

  // ✅ P0.1 — Tenant onboarding contract
  onboardingCompleted?: boolean;
}
```

**Justificativa**: 
- Propriedade opcional (`?`) para compatibilidade retroativa
- CamelCase segue convenção do tipo existente

---

### 2. `src/contexts/TenantContext.tsx` (Linhas 92-104)

**Ação**: Mapear `data.onboarding_completed` para `onboardingCompleted`.

```typescript
// ANTES (linhas 92-104):
const tenantData: Tenant = {
  id: data.id,
  slug: data.slug,
  name: data.name,
  description: data.description,
  logoUrl: data.logo_url,
  primaryColor: data.primary_color || '#dc2626',
  sportTypes: (data.sport_types || ['BJJ']) as Tenant['sportTypes'],
  stripeCustomerId: data.stripe_customer_id,
  isActive: data.is_active,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
};

// DEPOIS:
const tenantData: Tenant = {
  id: data.id,
  slug: data.slug,
  name: data.name,
  description: data.description,
  logoUrl: data.logo_url,
  primaryColor: data.primary_color || '#dc2626',
  sportTypes: (data.sport_types || ['BJJ']) as Tenant['sportTypes'],
  stripeCustomerId: data.stripe_customer_id,
  isActive: data.is_active,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
  // ✅ P0.1 — load onboarding flag from database
  onboardingCompleted: data.onboarding_completed,
};
```

**Justificativa**:
- Mapeamento direto snake_case → camelCase
- Sem fallback, sem inferência — valor real do banco

---

### 3. `src/components/onboarding/TenantOnboardingGate.tsx`

**Ação 1**: Remover type assertion na função `TenantOnboardingGate` (linha 35).

```typescript
// ANTES (linha 35):
const isComplete = (tenant as unknown as { onboarding_completed?: boolean }).onboarding_completed;

// DEPOIS:
const isComplete = tenant?.onboardingCompleted === true;
```

**Ação 2**: Remover type assertion no hook `useOnboardingStatus` (linhas 72-73).

```typescript
// ANTES (linhas 72-73):
const isComplete = tenant 
  ? (tenant as unknown as { onboarding_completed?: boolean }).onboarding_completed ?? false
  : false;

// DEPOIS:
const isComplete = tenant?.onboardingCompleted === true;
```

**Justificativa**:
- Contrato limpo sem casts
- Comparação estrita `=== true` previne `undefined` ou `null`

---

## FLUXO CORRIGIDO

```text
[Banco] tenants.onboarding_completed = true
           ↓
[TenantContext] carrega data.onboarding_completed
           ↓
[Tenant.onboardingCompleted] = true
           ↓
[TenantOnboardingGate] tenant?.onboardingCompleted === true
           ↓
✅ Acesso liberado às rotas /app/*
```

---

## VALIDAÇÃO

```bash
npm run typecheck
npm run identity:check
npx playwright test p0-regression --project=chromium
```

---

## GARANTIAS

- **ZERO alterações de fluxo** — Apenas contrato de dados
- **ZERO alterações em P2/P3/P4** — Identity não tocada
- **ZERO novos redirects** — Lógica de gate inalterada
- **ZERO Edge Functions modificadas** — Backend intocado
- **Compatibilidade retroativa** — Propriedade opcional
