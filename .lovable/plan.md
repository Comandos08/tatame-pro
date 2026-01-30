
# PROMPT 2/4 — Renovação de Filiação: Status ACTIVE vs end_date

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivos a MODIFICAR | 2 |
| Linhas alteradas | ~10 |
| Layout/UX alterados | ZERO |
| Fluxo de pagamento alterado | ZERO |
| Novos status criados | ZERO |
| Risco de regressão | Baixo |

---

## DIAGNÓSTICO CONFIRMADO

### Pontos de Decisão Afetados

| Arquivo | Lógica Atual | Problema |
|---------|--------------|----------|
| `MembershipRenew.tsx` (linha 112) | `status !== 'EXPIRED'` → redirect | Ignora `end_date` no passado |
| `PortalAccessGate.tsx` (linha 66) | `status === 'EXPIRED'` → gate | Ignora `end_date` no passado |

### Componentes que já estão CORRETOS

| Arquivo | Lógica | Status |
|---------|--------|--------|
| `RenewalBanner.tsx` (linha 28) | `status === 'EXPIRED' OR daysUntilExpiry < 0` | ✅ CORRETO |
| `InAppNotice.tsx` | Exibe aviso baseado em status | ⚠️ Baixa prioridade (visual) |

---

## REGRA DE NEGÓCIO CANÔNICA

```text
Uma membership está EFETIVAMENTE EXPIRADA quando:

  status === 'EXPIRED'
  OU
  (end_date !== null E end_date < now)

Neste caso, a renovação DEVE ser permitida.
```

---

## ALTERAÇÕES EXATAS

### 1. `src/pages/MembershipRenew.tsx`

**Local:** Linhas 105-119 (useEffect de redirect)

**ANTES:**
```typescript
// Redirect se status não for EXPIRED
useEffect(() => {
  if (isLoadingMembership || !tenantSlug) return;

  const status = membership?.status?.toUpperCase() as MembershipStatus;
  
  // Se não for EXPIRED, redirecionar para o destino correto
  if (status !== 'EXPIRED') {
    const redirectPath = resolveAthletePostLoginRedirect({
      tenantSlug,
      membershipStatus: status || null,
    });
    navigate(redirectPath, { replace: true });
  }
}, [membership, isLoadingMembership, tenantSlug, navigate]);
```

**DEPOIS:**
```typescript
// Redirect se NÃO estiver efetivamente expirada
useEffect(() => {
  if (isLoadingMembership || !tenantSlug) return;

  const status = membership?.status?.toUpperCase() as MembershipStatus;
  
  // ✅ P2/4 — Verificar expiração por STATUS ou por DATA
  const isEffectivelyExpired = status === 'EXPIRED' || (
    membership?.end_date && new Date(membership.end_date) < new Date()
  );
  
  // Se NÃO estiver efetivamente expirada, redirecionar para o destino correto
  if (!isEffectivelyExpired) {
    const redirectPath = resolveAthletePostLoginRedirect({
      tenantSlug,
      membershipStatus: status || null,
    });
    navigate(redirectPath, { replace: true });
  }
}, [membership, isLoadingMembership, tenantSlug, navigate]);
```

**Justificativa:**
- Membership com `status=ACTIVE` mas `end_date` no passado → permite renovação
- Membership com `status=EXPIRED` → permite renovação (comportamento existente)
- Membership com `status=ACTIVE` e `end_date` no futuro → redireciona para portal

---

### 2. `src/components/portal/PortalAccessGate.tsx`

**Local:** Linhas 56-73 (função `getGateState`)

**ANTES:**
```typescript
const getGateState = (): GateState => {
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (!athlete) return 'noAthlete';
  
  if (!membership) return 'noAthlete';
  
  const status = membership.status?.toUpperCase();
  
  if (status === 'PENDING_REVIEW') return 'pendingReview';
  if (status === 'EXPIRED') return 'expired';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'APPROVED' || status === 'ACTIVE') return 'allowed';
  
  // Unknown status - show neutral message
  return 'unknown';
};
```

**DEPOIS:**
```typescript
const getGateState = (): GateState => {
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (!athlete) return 'noAthlete';
  
  if (!membership) return 'noAthlete';
  
  const status = membership.status?.toUpperCase();
  
  // ✅ P2/4 — Verificar expiração por STATUS ou por DATA
  const isEffectivelyExpired = status === 'EXPIRED' || (
    membership.end_date && new Date(membership.end_date) < new Date()
  );
  
  if (status === 'PENDING_REVIEW') return 'pendingReview';
  if (isEffectivelyExpired) return 'expired';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'APPROVED' || status === 'ACTIVE') return 'allowed';
  
  // Unknown status - show neutral message
  return 'unknown';
};
```

**Justificativa:**
- Membership com `end_date` no passado é tratada como `expired`, mesmo com `status=ACTIVE`
- Permite que o CTA de renovação seja exibido corretamente

---

## FLUXO CORRIGIDO

```text
┌─────────────────────────────────────────────────────────────┐
│ Membership com status=ACTIVE e end_date=2024-12-01         │
│ (data atual: 2025-01-30)                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ isEffectivelyExpired = true (end_date < now)               │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│ MembershipRenew.tsx  │              │ PortalAccessGate.tsx │
│ → NÃO redireciona    │              │ → Estado: 'expired'  │
│ → Permite renovação  │              │ → Mostra CTA renovar │
└──────────────────────┘              └──────────────────────┘
```

---

## VALIDAÇÃO

**Cenários de teste:**

| Cenário | Status | end_date | Esperado |
|---------|--------|----------|----------|
| 1 | ACTIVE | 2024-12-01 (passado) | Renovação permitida |
| 2 | ACTIVE | 2025-06-01 (futuro) | Portal normal |
| 3 | EXPIRED | 2024-12-01 (passado) | Renovação permitida |
| 4 | EXPIRED | null | Renovação permitida |
| 5 | PENDING_REVIEW | qualquer | Tela de status |
| 6 | APPROVED | 2025-06-01 (futuro) | Portal normal |

---

## GARANTIAS

- **ZERO alterações de layout**
- **ZERO alterações de textos**
- **ZERO alterações de UX visual**
- **ZERO alterações no fluxo de pagamento**
- **ZERO alterações em schemas de banco**
- **ZERO novos status criados**
- **ZERO alterações no formulário de filiação (P1/4)**
- **Lógica centralizada nos pontos de decisão existentes**
