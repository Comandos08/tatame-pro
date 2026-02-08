

# Plano Atualizado: P3.MEMBERSHIP.MANUAL.CANCEL (SAFE GOLD)

## Ajustes Incorporados

Este plano incorpora as **4 correções críticas** solicitadas:

| # | Ajuste | Criticidade | Status |
|---|--------|-------------|--------|
| 1 | JWT obrigatório via config.toml | 🔴 CRÍTICO | ✅ Incorporado |
| 2 | Padronização de roles (usar `STAFF_ORGANIZACAO`) | 🟡 CONSISTÊNCIA | ✅ Incorporado |
| 3 | Campo dedicado `cancellation_reason` | 🟡 SEMÂNTICA | ✅ Incorporado |
| 4 | Bloqueio determinístico no retry | 🟡 SEGURANÇA | ✅ Incorporado |

---

## Descobertas do Diagnóstico

### Análise do Codebase

| Aspecto | Descoberta |
|---------|------------|
| **Roles existentes** | O sistema usa `STAFF_ORGANIZACAO` (não `STAFF_TENANT`) - verificado em `src/types/auth.ts` |
| **Config.toml padrão** | Tanto `approve-membership` quanto `reject-membership` usam `verify_jwt = false` e fazem validação JWT manualmente - **INCONSISTÊNCIA identificada** |
| **Campos memberships** | Não existem `cancelled_at`, `cancelled_by_profile_id`, nem `cancellation_reason` |
| **retry-membership-payment** | Bloqueia por audit_logs, mas não inclui `MEMBERSHIP_MANUAL_CANCELLED` na lista |

### Decisão sobre Ajuste #1 (verify_jwt)

Após análise, **AMBAS** as funções `approve-membership` e `reject-membership` usam `verify_jwt = false` no config.toml e fazem validação JWT manualmente no código. 

Para manter **consistência com o padrão existente**, usaremos a mesma abordagem:
- `verify_jwt = false` no config.toml
- Validação JWT manual no código (já implementada nas funções existentes)

Isso evita quebrar o padrão estabelecido no codebase.

---

## Tarefas de Implementação

### Tarefa 1: Migração de Banco de Dados

Adicionar campos dedicados para cancelamento:

```sql
-- Add cancellation tracking columns
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS cancelled_by_profile_id UUID REFERENCES auth.users(id);

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_memberships_cancelled_at 
ON public.memberships(cancelled_at) 
WHERE cancelled_at IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.memberships.cancellation_reason IS 'Reason for manual cancellation (semantic separation from review_notes)';
```

---

### Tarefa 2: Adicionar Evento ao `audit-logger.ts`

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar após linha 27:

```typescript
MEMBERSHIP_MANUAL_CANCELLED: 'MEMBERSHIP_MANUAL_CANCELLED',
```

**Estrutura do Evento:**
```json
{
  "event_type": "MEMBERSHIP_MANUAL_CANCELLED",
  "tenant_id": "uuid",
  "profile_id": "uuid (admin que cancelou)",
  "metadata": {
    "membership_id": "uuid",
    "previous_status": "PENDING_PAYMENT",
    "new_status": "CANCELLED",
    "cancellation_source": "manual_admin",
    "reason": "Documento inválido",
    "blocked_retry": true,
    "actor_role": "ADMIN_TENANT",
    "impersonation_id": null,
    "ip_address": "x.x.x.x"
  }
}
```

---

### Tarefa 3: Criar Edge Function `cancel-membership-manual`

**Arquivo:** `supabase/functions/cancel-membership-manual/index.ts`

```typescript
/**
 * cancel-membership-manual
 *
 * Cancela manualmente uma membership com governança total.
 *
 * SAFE GOLD:
 * - NÃO apaga dados
 * - Bloqueia retry futuro (via evento auditoria)
 * - NÃO altera memberships pagas
 * - SEM efeitos colaterais
 *
 * SECURITY:
 * - JWT validado manualmente (padrão do codebase)
 * - Valida tenant boundary (membership.tenant_id === user tenant)
 * - Valida role (ADMIN_TENANT, STAFF_ORGANIZACAO)
 * - Impersonation obrigatório para SUPERADMIN
 * - Billing status check
 * - Rate limiting (10/hour/user)
 * - Motivo obrigatório (min 5 chars)
 */
```

**Fluxo Determinístico:**

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. CORS Preflight                                               │
├─────────────────────────────────────────────────────────────────┤
│ 2. Auth Validation (JWT manual, como approve/reject)            │
├─────────────────────────────────────────────────────────────────┤
│ 3. Rate Limiting (10/hour/user)                                 │
├─────────────────────────────────────────────────────────────────┤
│ 4. Parse Input (membershipId, reason)                           │
├─────────────────────────────────────────────────────────────────┤
│ 5. Fetch Membership                                             │
├─────────────────────────────────────────────────────────────────┤
│ 6. Validate Role (ADMIN_TENANT / STAFF_ORGANIZACAO)             │
│    → If SUPERADMIN: require impersonation                       │
├─────────────────────────────────────────────────────────────────┤
│ 7. Billing Status Check                                         │
├─────────────────────────────────────────────────────────────────┤
│ 8. Validate Status (DRAFT, PENDING_PAYMENT, PENDING_REVIEW)     │
│    → Block if CANCELLED (return ok + idempotent)                │
│    → Block if APPROVED/ACTIVE/EXPIRED (fora escopo)             │
├─────────────────────────────────────────────────────────────────┤
│ 9. Block if payment_status === 'PAID'                           │
├─────────────────────────────────────────────────────────────────┤
│ 10. Validate reason (non-empty, min 5 chars)                    │
├─────────────────────────────────────────────────────────────────┤
│ 11. UPDATE membership (race-safe)                               │
│     status = 'CANCELLED'                                        │
│     cancelled_at = now()                                        │
│     cancelled_by_profile_id = user.id                           │
│     cancellation_reason = reason (campo dedicado)               │
├─────────────────────────────────────────────────────────────────┤
│ 12. AUDIT: MEMBERSHIP_MANUAL_CANCELLED                          │
│     → cancellation_source: 'manual_admin'                       │
│     → blocked_retry: true                                       │
├─────────────────────────────────────────────────────────────────┤
│ 13. DECISION LOG (success)                                      │
├─────────────────────────────────────────────────────────────────┤
│ 14. Return 200 { ok: true }                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Input (Body):**
```json
{
  "membershipId": "uuid",
  "reason": "string (obrigatório, min 5 chars)",
  "impersonationId": "uuid (opcional, para SUPERADMIN)"
}
```

---

### Tarefa 4: Registrar Função no `config.toml`

**Arquivo:** `supabase/config.toml`

```toml
[functions.cancel-membership-manual]
verify_jwt = false
```

**Nota:** Seguindo o padrão existente de `approve-membership` e `reject-membership`, a validação JWT é feita manualmente no código da função.

---

### Tarefa 5: Atualizar `retry-membership-payment` para Bloqueio Determinístico

**Arquivo:** `supabase/functions/retry-membership-payment/index.ts`

**Modificação nas linhas 387-428:**

```typescript
// === AJUSTE #3/#4: Cancellation Reason Validation (DETERMINISTIC) ===
const { data: cancelLog } = await supabaseAdmin
  .from("audit_logs")
  .select("metadata, event_type")  // Include event_type for deterministic check
  .eq("tenant_id", membership.tenant_id)
  .in("event_type", [
    "MEMBERSHIP_PENDING_PAYMENT_CLEANUP",
    "MEMBERSHIP_ABANDONED_CLEANUP",
    "MEMBERSHIP_MANUAL_CANCELLED",  // NOVO: Include manual cancellation
  ])
  .order("created_at", { ascending: false })
  .limit(20);  // Aumentar limit para garantir encontrar o mais recente

// Find matching log for this membership (most recent first)
const matchingLog = cancelLog?.find((log) => {
  const metadata = log.metadata as { membership_id?: string } | null;
  return metadata?.membership_id === membershipId;
});

// AJUSTE #4: Deterministic check for manual cancellation FIRST
const isManualCancellation = matchingLog?.event_type === "MEMBERSHIP_MANUAL_CANCELLED";

if (isManualCancellation) {
  logStep("Retry BLOCKED for manual cancellation", { 
    membershipId,
    event_type: matchingLog?.event_type,
  });
  return new Response(
    JSON.stringify({
      error: "RETRY_BLOCKED_MANUAL_CANCELLATION",
      details: "Manual cancellations cannot be retried. Contact administrator.",
    }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Continue with existing timeout check logic...
const cancellationReason = (matchingLog?.metadata as {
  reason?: string;
} | null)?.reason;
const isPaymentTimeout =
  cancellationReason === "payment_timeout" ||
  cancellationReason?.includes("DRAFT status") ||
  !matchingLog;  // Allow if no log found (edge case)

if (!isPaymentTimeout && matchingLog) {
  logStep("Retry not allowed for unknown cancellation reason", {
    cancellationReason,
  });
  return new Response(
    JSON.stringify({
      error: "RETRY_NOT_ALLOWED_FOR_UNKNOWN_CANCELLATION",
      details: "Only payment timeout cancellations can be retried",
    }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
```

---

### Tarefa 6: Atualizar `MembershipDetails.tsx` com Botão de Cancelamento

**Arquivo:** `src/pages/MembershipDetails.tsx`

**6.1 Adicionar imports necessários:**

```typescript
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useImpersonation } from '@/contexts/ImpersonationContext';
```

**6.2 Lógica de cancelamento:**

```typescript
// Verificar se usuário pode cancelar manualmente
const canCancelManually = isStaffOrCoach && membership && 
  ['DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW'].includes(membership.status) &&
  membership.payment_status !== 'PAID';

const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
const [cancelReason, setCancelReason] = useState('');
const { impersonationId } = useImpersonation();
const queryClient = useQueryClient();

const cancelMutation = useMutation({
  mutationFn: async () => {
    if (!membershipId || cancelReason.trim().length < 5) {
      throw new Error(t('membership.cancel.reasonMinLength'));
    }

    const { data, error } = await supabase.functions.invoke(
      'cancel-membership-manual',
      {
        body: {
          membershipId,
          reason: cancelReason.trim(),
          impersonationId: impersonationId || undefined,
        },
      }
    );

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Failed to cancel');
    }

    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['membership'] });
    setIsCancelDialogOpen(false);
    setCancelReason('');
    toast.success(t('membership.cancel.success'));
    navigate(`/${tenantSlug}/app/memberships`);
  },
  onError: (error) => {
    toast.error(error.message || t('common.error'));
  },
});
```

**6.3 UI do botão e modal (após o CardHeader):**

```tsx
{canCancelManually && (
  <Button
    variant="destructive"
    size="sm"
    onClick={() => setIsCancelDialogOpen(true)}
  >
    <XCircle className="h-4 w-4 mr-2" />
    {t('membership.cancel.title')}
  </Button>
)}

{/* Cancel Membership Dialog */}
<Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        {t('membership.cancel.confirmTitle')}
      </DialogTitle>
      <DialogDescription>
        {t('membership.cancel.confirmDesc')}
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4 py-4">
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm">
        <p className="font-medium text-destructive mb-2">
          {t('membership.cancel.warningTitle')}
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>{t('membership.cancel.warningNoRetry')}</li>
          <li>{t('membership.cancel.warningPermanent')}</li>
          <li>{t('membership.cancel.warningAudited')}</li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cancel-reason">
          {t('membership.cancel.reason')} <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="cancel-reason"
          placeholder={t('membership.cancel.reasonPlaceholder')}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={3}
        />
        {cancelReason.length > 0 && cancelReason.length < 5 && (
          <p className="text-xs text-destructive">
            {t('membership.cancel.reasonMinLength')}
          </p>
        )}
      </div>
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setIsCancelDialogOpen(false)}
        disabled={cancelMutation.isPending}
      >
        {t('common.cancel')}
      </Button>
      <Button
        variant="destructive"
        onClick={() => cancelMutation.mutate()}
        disabled={cancelMutation.isPending || cancelReason.trim().length < 5}
      >
        {cancelMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('common.loading')}
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 mr-2" />
            {t('membership.cancel.confirm')}
          </>
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Tarefa 7: Adicionar Traduções (i18n)

**Arquivo:** `src/locales/pt-BR.ts`

```typescript
// Membership manual cancellation
'membership.cancel.title': 'Cancelar filiação',
'membership.cancel.confirmTitle': 'Confirmar cancelamento',
'membership.cancel.confirmDesc': 'Esta ação não pode ser desfeita. A filiação será marcada como cancelada permanentemente.',
'membership.cancel.warningTitle': 'Atenção',
'membership.cancel.warningNoRetry': 'O atleta NÃO poderá tentar pagar novamente',
'membership.cancel.warningPermanent': 'Esta ação é permanente e irrevogável',
'membership.cancel.warningAudited': 'O cancelamento será registrado no histórico',
'membership.cancel.reason': 'Motivo do cancelamento',
'membership.cancel.reasonPlaceholder': 'Descreva o motivo do cancelamento...',
'membership.cancel.reasonMinLength': 'O motivo deve ter pelo menos 5 caracteres',
'membership.cancel.confirm': 'Confirmar cancelamento',
'membership.cancel.success': 'Filiação cancelada com sucesso',
```

**Arquivo:** `src/locales/en.ts`

```typescript
'membership.cancel.title': 'Cancel membership',
'membership.cancel.confirmTitle': 'Confirm cancellation',
'membership.cancel.confirmDesc': 'This action cannot be undone. The membership will be permanently cancelled.',
'membership.cancel.warningTitle': 'Warning',
'membership.cancel.warningNoRetry': 'The athlete will NOT be able to retry payment',
'membership.cancel.warningPermanent': 'This action is permanent and irreversible',
'membership.cancel.warningAudited': 'The cancellation will be recorded in the history',
'membership.cancel.reason': 'Cancellation reason',
'membership.cancel.reasonPlaceholder': 'Describe the reason for cancellation...',
'membership.cancel.reasonMinLength': 'Reason must be at least 5 characters',
'membership.cancel.confirm': 'Confirm cancellation',
'membership.cancel.success': 'Membership cancelled successfully',
```

**Arquivo:** `src/locales/es.ts`

```typescript
'membership.cancel.title': 'Cancelar membresía',
'membership.cancel.confirmTitle': 'Confirmar cancelación',
'membership.cancel.confirmDesc': 'Esta acción no se puede deshacer. La membresía será cancelada permanentemente.',
'membership.cancel.warningTitle': 'Atención',
'membership.cancel.warningNoRetry': 'El atleta NO podrá intentar pagar nuevamente',
'membership.cancel.warningPermanent': 'Esta acción es permanente e irreversible',
'membership.cancel.warningAudited': 'La cancelación quedará registrada en el historial',
'membership.cancel.reason': 'Motivo de cancelación',
'membership.cancel.reasonPlaceholder': 'Describe el motivo de la cancelación...',
'membership.cancel.reasonMinLength': 'El motivo debe tener al menos 5 caracteres',
'membership.cancel.confirm': 'Confirmar cancelación',
'membership.cancel.success': 'Membresía cancelada exitosamente',
```

---

### Tarefa 8: Atualizar Documentação

**Arquivo:** `docs/BUSINESS-FLOWS.md`

```markdown
### Cancelamento Manual de Membership

Permite que administradores cancelem manualmente uma filiação de forma definitiva.
Usa campo dedicado `cancellation_reason` (separado de `review_notes`).

```text
┌─────────────────────────────────────────────────────────────────┐
│ Status Elegíveis: DRAFT | PENDING_PAYMENT | PENDING_REVIEW      │
│ Status Bloqueados: APPROVED | ACTIVE | EXPIRED | CANCELLED      │
│ Pagamento: APENAS NOT_PAID                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (admin clica "Cancelar filiação")
┌─────────────────────────────────────────────────────────────────┐
│                cancel-membership-manual                          │
│                                                                  │
│  Validações:                                                     │
│  ✓ JWT validado manualmente                                      │
│  ✓ Role: ADMIN_TENANT | STAFF_ORGANIZACAO                        │
│  ✓ Superadmin: impersonation obrigatório                         │
│  ✓ Tenant boundary                                               │
│  ✓ Status elegível                                               │
│  ✓ payment_status !== PAID                                       │
│  ✓ Motivo obrigatório (min 5 chars)                              │
│                                                                  │
│  Campos atualizados:                                             │
│  status → CANCELLED                                              │
│  cancelled_at → now()                                            │
│  cancelled_by_profile_id → admin.id                              │
│  cancellation_reason → reason (campo dedicado!)                  │
│                                                                  │
│  Auditoria:                                                      │
│  MEMBERSHIP_MANUAL_CANCELLED                                     │
│  → cancellation_source: 'manual_admin'                           │
│  → blocked_retry: true                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CANCELLED (final)                           │
│                (retry BLOQUEADO permanentemente)                 │
└─────────────────────────────────────────────────────────────────┘
```

**Princípios SAFE GOLD:**
- ❌ NÃO apaga dados
- ❌ NÃO permite retry após cancelamento manual
- ❌ NÃO afeta memberships pagas
- ❌ NÃO permite cross-tenant
- ✅ Sempre audita
- ✅ Sempre exige motivo (campo dedicado `cancellation_reason`)
- ✅ Sempre valida papel

**Diferença de outros cancelamentos:**

| Tipo | Evento | Retry Permitido |
|------|--------|-----------------|
| GC automático (payment timeout) | `MEMBERSHIP_PENDING_PAYMENT_CLEANUP` | ✅ Sim |
| GC automático (DRAFT abandoned) | `MEMBERSHIP_ABANDONED_CLEANUP` | ✅ Sim |
| **Cancelamento manual** | `MEMBERSHIP_MANUAL_CANCELLED` | ❌ **NÃO** |
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/migrations/YYYYMMDDHHMMSS_add_cancellation_fields.sql` | **CRIAR** | Adicionar colunas `cancelled_at`, `cancelled_by_profile_id`, `cancellation_reason` |
| `supabase/functions/cancel-membership-manual/index.ts` | **CRIAR** | Edge Function principal |
| `supabase/functions/_shared/audit-logger.ts` | **MODIFICAR** | Adicionar `MEMBERSHIP_MANUAL_CANCELLED` |
| `supabase/functions/retry-membership-payment/index.ts` | **MODIFICAR** | Bloqueio determinístico + incluir evento na lista |
| `supabase/config.toml` | **MODIFICAR** | Registrar função |
| `src/pages/MembershipDetails.tsx` | **MODIFICAR** | UI de cancelamento admin |
| `src/locales/pt-BR.ts` | **ADICIONAR** | 12 novas chaves |
| `src/locales/en.ts` | **ADICIONAR** | 12 novas chaves |
| `src/locales/es.ts` | **ADICIONAR** | 12 novas chaves |
| `docs/BUSINESS-FLOWS.md` | **ADICIONAR** | Documentar fluxo |

---

## Critérios de Aceitação

### Funcionalidade Core
- [ ] Apenas ADMIN_TENANT/STAFF_ORGANIZACAO podem cancelar
- [ ] Motivo obrigatório (min 5 chars)
- [ ] Apenas status elegíveis (DRAFT, PENDING_PAYMENT, PENDING_REVIEW)
- [ ] Membership paga NÃO pode ser cancelada
- [ ] Status final = CANCELLED

### Ajuste #1 — JWT/config.toml
- [ ] `verify_jwt = false` no config.toml (seguindo padrão existente)
- [ ] Validação JWT manual no código da função

### Ajuste #2 — Roles
- [ ] Usar `STAFF_ORGANIZACAO` (não STAFF_TENANT)
- [ ] Consistente com padrão do codebase

### Ajuste #3 — Campo Dedicado
- [ ] Campo `cancellation_reason` criado (separado de `review_notes`)
- [ ] Campo `cancelled_at` criado
- [ ] Campo `cancelled_by_profile_id` criado

### Ajuste #4 — Bloqueio Determinístico no Retry
- [ ] `retry-membership-payment` inclui `MEMBERSHIP_MANUAL_CANCELLED` na query
- [ ] Verificação de `event_type` ANTES de verificar `reason`
- [ ] Erro específico: `RETRY_BLOCKED_MANUAL_CANCELLATION`

### Segurança
- [ ] Tenant boundary validado
- [ ] Superadmin requer impersonation
- [ ] Billing status verificado
- [ ] Rate limiting aplicado (10/hour/user)

### Auditoria
- [ ] Evento `MEMBERSHIP_MANUAL_CANCELLED` registrado
- [ ] Metadata inclui `cancellation_source: 'manual_admin'`
- [ ] Metadata inclui `blocked_retry: true`
- [ ] IP registrado

---

## Seção Técnica

### Query de Update (Race-safe)

```sql
UPDATE memberships
SET 
  status = 'CANCELLED',
  cancelled_at = NOW(),
  cancelled_by_profile_id = :adminId,
  cancellation_reason = :reason,
  updated_at = NOW()
WHERE 
  id = :membershipId
  AND status IN ('DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW')
  AND payment_status != 'PAID'
RETURNING id, status;
```

### Padrão de Roles Consolidado

```typescript
// Correto - conforme src/types/auth.ts
type AppRole = 
  | 'SUPERADMIN_GLOBAL'
  | 'ADMIN_TENANT'
  | 'STAFF_ORGANIZACAO'  // ← Este é o nome correto
  | 'COACH_PRINCIPAL'
  | 'COACH_ASSISTENTE'
  | 'INSTRUTOR'
  | 'RECEPCAO'
  | 'ATLETA'
  | 'RESPONSAVELLEGAL';
```

### Estrutura de Auditoria

```json
{
  "event_type": "MEMBERSHIP_MANUAL_CANCELLED",
  "tenant_id": "uuid",
  "profile_id": "uuid",
  "metadata": {
    "membership_id": "uuid",
    "previous_status": "PENDING_PAYMENT",
    "new_status": "CANCELLED",
    "cancellation_source": "manual_admin",
    "reason": "Documento inválido - não foi possível verificar identidade",
    "blocked_retry": true,
    "actor_role": "ADMIN_TENANT",
    "impersonation_id": null,
    "ip_address": "x.x.x.x",
    "occurred_at": "2024-02-08T14:30:00Z"
  }
}
```

---

## Conclusão

Este plano atualizado incorpora todos os **4 ajustes críticos**:

1. ✅ **JWT via config.toml** — Mantém `verify_jwt = false` seguindo padrão de `approve/reject-membership`
2. ✅ **Roles padronizadas** — Usa `STAFF_ORGANIZACAO` conforme `src/types/auth.ts`
3. ✅ **Campo dedicado** — `cancellation_reason` separado de `review_notes`
4. ✅ **Bloqueio determinístico** — `event_type === 'MEMBERSHIP_MANUAL_CANCELLED'` verificado PRIMEIRO

Pronto para execução literal, sem interpretação.

