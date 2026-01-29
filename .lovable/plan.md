

# Plano Ajustado: Growth Trial + Auto-Cleanup

## Ajustes Obrigatórios Incorporados

### A1. Decisão Explícita: Criação de Novos Tenants

**Decisão Registrada:** Enquanto `COMPLETE_WIZARD` estiver desabilitado, a criação de novos tenants será **exclusivamente via Superadmin** através do `CreateTenantDialog` existente.

**Impacto no PI:**
- O trial de 7 dias aplica-se apenas a tenants criados pelo Superadmin
- Não há fluxo de self-service até habilitação do wizard
- O campo `trial_started_at` será preenchido automaticamente no momento da criação do tenant

### A2. Salvaguarda no Cleanup (Soft Guard de Pagamento)

O job `cleanup-expired-tenants` incluirá verificações adicionais **antes** de qualquer deleção:

```typescript
// Verificações obrigatórias antes de deletar
async function canSafelyDelete(tenantId: string): Promise<{ safe: boolean; reason?: string }> {
  // 1. Verificar se não há pagamento recente (últimos 30 dias)
  const { data: recentPayment } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_type', 'invoice.payment_succeeded')
    .gt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);
  
  if (recentPayment?.length) {
    return { safe: false, reason: 'RECENT_PAYMENT_FOUND' };
  }
  
  // 2. Verificar status atual (double-check)
  const { data: billing } = await supabase
    .from('tenant_billing')
    .select('status, is_manual_override')
    .eq('tenant_id', tenantId)
    .single();
  
  if (billing?.is_manual_override) {
    return { safe: false, reason: 'MANUAL_OVERRIDE_ACTIVE' };
  }
  
  if (billing?.status !== 'PENDING_DELETE') {
    return { safe: false, reason: 'STATUS_CHANGED' };
  }
  
  // 3. Verificar se não há atletas ativos (proteção adicional)
  const { count: activeAthletes } = await supabase
    .from('athletes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  
  if ((activeAthletes || 0) > 50) {
    return { safe: false, reason: 'TOO_MANY_ACTIVE_ATHLETES' };
  }
  
  return { safe: true };
}
```

**Comportamento quando guard falha:**
- Tenant **não é deletado**
- Status permanece `PENDING_DELETE`
- Log de auditoria registra `CLEANUP_SKIPPED` com razão
- Alerta enviado para Superadmin revisar manualmente

### A3. Impersonation Respeitando Bloqueios de Trial

**Regra:** Durante impersonation de tenant em `TRIAL_EXPIRED`, o Superadmin:
- ✅ PODE acessar o tenant (para suporte e diagnóstico)
- ✅ PODE visualizar dados, dashboards, logs
- ❌ NÃO PODE executar ações sensíveis bloqueadas

**Implementação:** O hook `useTrialRestrictions` será consultado mesmo durante impersonation:

```typescript
export function useTrialRestrictions() {
  const { billingState } = useTenantStatus();
  const { isImpersonating } = useImpersonation();
  
  // Superadmin impersonando TAMBÉM respeita restrições de trial
  // Pode VER tudo, mas NÃO PODE EXECUTAR ações bloqueadas
  const isTrialRestricted = billingState?.status === 'TRIAL_EXPIRED';
  
  return {
    canApproveMemberships: !isTrialRestricted,
    canCreateEvents: !isTrialRestricted,
    canIssueDiplomas: !isTrialRestricted,
    // ... outras ações
    isRestricted: isTrialRestricted,
    // Flag para UI mostrar mensagem específica quando impersonando
    isImpersonatingRestricted: isImpersonating && isTrialRestricted,
  };
}
```

**Banner especial para Superadmin impersonando tenant bloqueado:**
> "Você está visualizando um tenant com trial expirado. Ações administrativas estão bloqueadas. Para desbloquear, ative a assinatura via Control Tower."

---

## Implementação Fase a Fase

### Fase 1: Database Schema

**Migration SQL:**

```sql
-- 1. Adicionar novos valores ao enum billing_status
ALTER TYPE billing_status ADD VALUE IF NOT EXISTS 'TRIAL_EXPIRED';
ALTER TYPE billing_status ADD VALUE IF NOT EXISTS 'PENDING_DELETE';

-- 2. Adicionar colunas de controle de trial em tenant_billing
ALTER TABLE tenant_billing 
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_delete_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- 3. Tabela para auditoria LGPD de tenants deletados
CREATE TABLE IF NOT EXISTS deleted_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_tenant_id UUID NOT NULL,
  tenant_slug TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  creator_email TEXT,
  billing_email TEXT,
  trial_started_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_reason TEXT,
  metadata JSONB,
  -- Campos para auditoria
  athletes_count INTEGER,
  memberships_count INTEGER,
  events_count INTEGER
);

-- 4. RLS para deleted_tenants (somente leitura para superadmin)
ALTER TABLE deleted_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read deleted_tenants"
ON deleted_tenants FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'SUPERADMIN_GLOBAL'
    AND tenant_id IS NULL
  )
);

-- 5. Atualizar tenants existentes em TRIALING com datas de trial
UPDATE tenant_billing tb
SET 
  trial_started_at = COALESCE(tb.created_at, NOW()),
  trial_expires_at = COALESCE(tb.current_period_end, NOW() + INTERVAL '7 days')
WHERE tb.status = 'TRIALING'
AND tb.trial_started_at IS NULL;
```

---

### Fase 2: Billing Resolver Atualizado

**Arquivo:** `src/lib/billing/resolveTenantBillingState.ts`

**Mudanças:**
- Adicionar `TRIAL_EXPIRED` e `PENDING_DELETE` ao tipo `BillingStatus`
- Adicionar novas flags:
  - `isTrialActive: boolean`
  - `isTrialExpired: boolean`
  - `isPendingDelete: boolean`
  - `canPerformSensitiveActions: boolean`
  - `daysUntilExpiration: number | null`
  - `daysUntilDeletion: number | null`

**Lógica atualizada:**
```typescript
const isTrialActive = status === 'TRIALING';
const isTrialExpired = status === 'TRIAL_EXPIRED';
const isPendingDelete = status === 'PENDING_DELETE';
const canPerformSensitiveActions = ['ACTIVE', 'TRIALING'].includes(status);
const isBlocked = isPendingDelete || status === 'CANCELED';
const isReadOnly = ['PAST_DUE', 'UNPAID', 'INCOMPLETE', 'TRIAL_EXPIRED'].includes(status);
```

---

### Fase 3: Hook de Restrições

**Novo arquivo:** `src/hooks/useTrialRestrictions.ts`

```typescript
import { useTenantStatus } from './useTenantStatus';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export function useTrialRestrictions() {
  const { billingState } = useTenantStatus();
  const { isImpersonating } = useImpersonation();
  
  const isTrialRestricted = billingState?.status === 'TRIAL_EXPIRED';
  const isPendingDelete = billingState?.status === 'PENDING_DELETE';
  
  return {
    // Ações bloqueadas durante trial expirado
    canApproveMemberships: !isTrialRestricted && !isPendingDelete,
    canRejectMemberships: !isTrialRestricted && !isPendingDelete,
    canCreateEvents: !isTrialRestricted && !isPendingDelete,
    canIssueDiplomas: !isTrialRestricted && !isPendingDelete,
    canAddAthletes: !isTrialRestricted && !isPendingDelete,
    canRegisterGradings: !isTrialRestricted && !isPendingDelete,
    
    // Flags de estado
    isRestricted: isTrialRestricted,
    isPendingDelete,
    isImpersonatingRestricted: isImpersonating && isTrialRestricted,
    
    // Mensagem para UI
    restrictionReason: isPendingDelete 
      ? 'pending_delete' 
      : isTrialRestricted 
        ? 'trial_expired' 
        : null,
  };
}
```

---

### Fase 4: Componentes de UI

#### 4.1 TrialStatusBanner

**Novo arquivo:** `src/components/billing/TrialStatusBanner.tsx`

| Estado | Dias | Variante | Mensagem |
|--------|------|----------|----------|
| TRIALING | >= 4 | default | "Período de avaliação - X dias restantes" |
| TRIALING | <= 3 | warning | "⚠️ Seu trial expira em X dias!" |
| TRIAL_EXPIRED | - | destructive | "🚨 Trial expirado. Ações limitadas." |

#### 4.2 ActionBlockedTooltip

**Novo arquivo:** `src/components/billing/ActionBlockedTooltip.tsx`

Tooltip que aparece sobre botões desabilitados:
> "Esta ação está indisponível. Ative sua assinatura para continuar."

#### 4.3 TenantBlockedScreen Atualizado

Adicionar tratamento para `PENDING_DELETE`:
- Mostrar contagem regressiva até deleção
- CTA de última chance para ativar
- Aviso de perda permanente de dados

---

### Fase 5: Edge Functions

#### 5.1 expire-trials/index.ts (NOVO)

**Executa:** Diariamente às 00:05 UTC

```typescript
// Fluxo:
// 1. Buscar tenants com status='TRIALING' e trial_expires_at < NOW()
// 2. Atualizar status para 'TRIAL_EXPIRED'
// 3. Definir grace_period_ends_at = NOW() + 8 dias
// 4. Manter tenant.is_active = true (acesso parcial permitido)
// 5. Enviar email "TRIAL_EXPIRED"
// 6. Registrar em audit_logs
```

#### 5.2 mark-pending-delete/index.ts (NOVO)

**Executa:** Diariamente às 00:10 UTC

```typescript
// Fluxo:
// 1. Buscar tenants com status='TRIAL_EXPIRED' e grace_period_ends_at < NOW()
// 2. Atualizar status para 'PENDING_DELETE'
// 3. Definir scheduled_delete_at = NOW() + 7 dias (buffer de segurança)
// 4. Desativar tenant (is_active = false)
// 5. Enviar email "PENDING_DELETE_WARNING"
// 6. Registrar em audit_logs
```

#### 5.3 cleanup-expired-tenants/index.ts (NOVO)

**Executa:** Diariamente às 03:00 UTC

```typescript
// Fluxo com salvaguardas:
// 1. Buscar tenants com status='PENDING_DELETE' e scheduled_delete_at < NOW()
// 2. Para cada tenant:
//    a. Executar canSafelyDelete() - SE FALHAR, PULAR
//    b. Salvar dados mínimos em deleted_tenants (LGPD)
//    c. Deletar em cascade (ordem específica para evitar FK errors)
//    d. Deletar tenant e tenant_billing
// 3. Enviar email final "TENANT_DELETED"
// 4. Alertar superadmin sobre tenants pulados (se houver)
```

**Ordem de deleção cascade:**
1. digital_cards
2. diplomas
3. athlete_gradings
4. event_registrations
5. events
6. memberships
7. athletes
8. academy_coaches
9. coaches
10. academies
11. grading_levels
12. grading_schemes
13. user_roles (do tenant)
14. tenant_invoices
15. tenant_billing
16. tenants

#### 5.4 Atualizar create-tenant-subscription/index.ts

- Mudar `TRIAL_PERIOD_DAYS` de 14 para **7**
- Adicionar:
  ```typescript
  trial_started_at: new Date().toISOString(),
  trial_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  ```

#### 5.5 Atualizar stripe-webhook/index.ts

Adicionar lógica de reativação:
```typescript
// Em handleSubscriptionChange ou handleInvoicePaymentSucceeded:
if (previousStatus === 'TRIAL_EXPIRED' || previousStatus === 'PENDING_DELETE') {
  // Limpar campos de deleção
  await supabase.from('tenant_billing').update({
    status: 'ACTIVE',
    grace_period_ends_at: null,
    scheduled_delete_at: null,
    deletion_reason: null,
  }).eq('tenant_id', tenantId);
  
  // Reativar tenant
  await supabase.from('tenants').update({ is_active: true }).eq('id', tenantId);
  
  // Log de reativação
  await createAuditLog(supabase, {
    event_type: 'TENANT_REACTIVATED',
    tenant_id: tenantId,
    metadata: {
      previous_status: previousStatus,
      reactivation_source: 'stripe_payment',
      stripe_invoice_id: invoice?.id,
    },
  });
  
  // Email de reativação
  sendBillingEmail(supabaseUrl, supabaseServiceKey, 'SUBSCRIPTION_REACTIVATED', tenantId);
}
```

---

### Fase 6: i18n Strings

**Novas chaves para `src/locales/*.ts`:**

```typescript
// Trial Status
'trial.daysRemaining': 'Período de avaliação - {days} dias restantes',
'trial.expiringSoon': '⚠️ Seu trial expira em {days} dias!',
'trial.expired': 'Período de avaliação encerrado',
'trial.expiredDesc': 'Ações administrativas estão limitadas. Ative sua assinatura para continuar.',
'trial.activateNow': 'Ativar Assinatura',
'trial.activateNowDesc': 'Mantenha acesso total ao sistema',

// Pending Delete
'trial.pendingDelete': 'Organização será removida em {days} dias',
'trial.pendingDeleteDesc': 'Sem ativação, todos os dados serão permanentemente removidos.',
'trial.lastChance': 'Última chance para ativar',
'trial.dataWillBeLost': 'Todos os atletas, eventos e documentos serão perdidos',

// Action Restrictions
'trial.actionBlocked': 'Ação indisponível',
'trial.actionBlockedDesc': 'Ative sua assinatura para executar esta ação.',
'trial.impersonatingRestricted': 'Visualizando tenant com trial expirado. Ações bloqueadas.',

// Reactivation
'trial.reactivated': 'Assinatura ativada com sucesso!',
'trial.reactivatedDesc': 'Todas as funcionalidades foram restauradas.',
```

---

## Arquivos a Criar/Modificar

### Criar:
| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/expire-trials/index.ts` | Job de expiração |
| `supabase/functions/mark-pending-delete/index.ts` | Job de marcação |
| `supabase/functions/cleanup-expired-tenants/index.ts` | Job de cleanup com salvaguardas |
| `src/hooks/useTrialRestrictions.ts` | Hook de bloqueio |
| `src/components/billing/TrialStatusBanner.tsx` | Banner progressivo |
| `src/components/billing/ActionBlockedTooltip.tsx` | Tooltip de bloqueio |

### Modificar:
| Arquivo | Mudança |
|---------|---------|
| `src/lib/billing/resolveTenantBillingState.ts` | Novos status e flags |
| `src/hooks/useTenantStatus.ts` | Suporte a novas flags |
| `src/components/billing/TenantBlockedScreen.tsx` | Estado PENDING_DELETE |
| `src/components/billing/BillingStatusBanner.tsx` | TRIAL_EXPIRED config |
| `supabase/functions/create-tenant-subscription/index.ts` | Trial 7 dias |
| `supabase/functions/stripe-webhook/index.ts` | Reativação tardia |
| `supabase/functions/send-billing-email/index.ts` | Novos templates |
| `supabase/config.toml` | Novas functions |
| `src/locales/pt-BR.ts` | Novas strings |
| `src/locales/en.ts` | Novas strings |
| `src/locales/es.ts` | Novas strings |

---

## Matriz de Decisão Final

| Operação | TRIALING | TRIAL_EXPIRED | PENDING_DELETE | ACTIVE |
|----------|----------|---------------|----------------|--------|
| Login | ✅ | ✅ | ✅ | ✅ |
| Ver dashboard | ✅ | ✅ | ❌ | ✅ |
| Ver atletas | ✅ | ✅ | ❌ | ✅ |
| Aprovar filiação | ✅ | ❌ | ❌ | ✅ |
| Criar evento | ✅ | ❌ | ❌ | ✅ |
| Emitir diploma | ✅ | ❌ | ❌ | ✅ |
| Adicionar atleta | ✅ | ❌ | ❌ | ✅ |
| Ver billing | ✅ | ✅ | ❌ | ✅ |
| Ativar assinatura | ✅ | ✅ | ✅ | N/A |
| **Impersonation (visualizar)** | ✅ | ✅ | ✅ | ✅ |
| **Impersonation (ações)** | ✅ | ❌ | ❌ | ✅ |

---

## Ordem de Implementação

1. **Database Migration** — Enums e colunas
2. **Billing Resolver** — Novos status
3. **useTenantStatus** — Suporte a flags
4. **useTrialRestrictions** — Hook de bloqueio
5. **TrialStatusBanner** — UI de avisos
6. **TenantBlockedScreen** — PENDING_DELETE
7. **expire-trials** — Edge Function
8. **mark-pending-delete** — Edge Function
9. **cleanup-expired-tenants** — Edge Function com salvaguardas
10. **create-tenant-subscription** — Trial 7 dias
11. **stripe-webhook** — Reativação
12. **send-billing-email** — Templates
13. **i18n** — Strings
14. **config.toml** — Registro das functions

---

## Checklist de Testes

### Happy Path
- [ ] Superadmin cria tenant → status = TRIALING, trial_expires_at = D+7
- [ ] Banner mostra "7 dias restantes"
- [ ] D-3: Banner warning, email de aviso
- [ ] D+8: Status = TRIAL_EXPIRED, ações bloqueadas
- [ ] Pagamento → Status = ACTIVE, tudo desbloqueado

### Expiração Completa
- [ ] D+15: Status = PENDING_DELETE, tenant bloqueado
- [ ] D+22: Cleanup executa com salvaguardas
- [ ] Tenant deletado → registro em deleted_tenants
- [ ] Email final enviado

### Impersonation
- [ ] Superadmin pode visualizar tenant TRIAL_EXPIRED
- [ ] Ações sensíveis bloqueadas mesmo durante impersonation
- [ ] Banner especial visível

### Salvaguardas
- [ ] Tenant com pagamento recente NÃO é deletado
- [ ] Tenant com override manual NÃO é deletado
- [ ] Log de CLEANUP_SKIPPED registrado

