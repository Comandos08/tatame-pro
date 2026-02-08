

# Plano: P3.MEMBERSHIP.MANUAL.REACTIVATE (SAFE GOLD)

## Diagnóstico do Codebase

### Análise das Implementações Existentes

| Componente | Estado | Observação |
|------------|--------|------------|
| **cancel-membership-manual** | ✅ Template perfeito | Usar como base para reactivate (estrutura idêntica) |
| **MembershipDetails.tsx** | ✅ Já possui cancel dialog | Adicionar reactivate dialog paralelo |
| **audit-logger.ts** | ✅ Pronto | Adicionar `MEMBERSHIP_MANUAL_REACTIVATED` na linha 29 |
| **retry-membership-payment** | ✅ Bloqueia manual cancellations | Não precisa alteração (reactivate volta para DRAFT, não retry) |
| **BUSINESS-FLOWS.md** | ✅ Seção 11 documenta cancel | Adicionar Seção 12 para reactivate |

### Campos do Schema `memberships` (Já Existentes)

Os campos abaixo já foram criados no PI anterior:
- `cancelled_at` — será limpo (NULL)
- `cancelled_by_profile_id` — será limpo (NULL)
- `cancellation_reason` — será limpo (NULL)

**Nenhuma migração de banco necessária.**

### Validação Crítica: Último Evento

O reactivate DEVE verificar via `audit_logs`:
```sql
event_type === 'MEMBERSHIP_MANUAL_CANCELLED'
AND metadata->>'membership_id' === membershipId
ORDER BY created_at DESC LIMIT 1
```

Se o último evento relevante for GC automático (`MEMBERSHIP_PENDING_PAYMENT_CLEANUP` ou `MEMBERSHIP_ABANDONED_CLEANUP`), a reativação é BLOQUEADA — use retry de pagamento.

---

## Tarefas de Implementação

### Tarefa 1: Adicionar Evento ao `audit-logger.ts`

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar após linha 28 (após `MEMBERSHIP_MANUAL_CANCELLED`):

```typescript
MEMBERSHIP_MANUAL_REACTIVATED: 'MEMBERSHIP_MANUAL_REACTIVATED',
```

**Estrutura do Evento de Auditoria:**
```json
{
  "event_type": "MEMBERSHIP_MANUAL_REACTIVATED",
  "tenant_id": "uuid",
  "profile_id": "uuid (admin que reativou)",
  "metadata": {
    "membership_id": "uuid",
    "previous_status": "CANCELLED",
    "new_status": "DRAFT",
    "reactivation_source": "manual_admin",
    "reason": "Cancelamento feito por engano",
    "actor_role": "ADMIN_TENANT",
    "impersonation_id": null,
    "ip_address": "x.x.x.x"
  }
}
```

---

### Tarefa 2: Criar Edge Function `reactivate-membership-manual`

**Arquivo:** `supabase/functions/reactivate-membership-manual/index.ts`

**Contrato SAFE GOLD:**
```typescript
/**
 * reactivate-membership-manual
 *
 * Reativa manualmente uma membership cancelada por erro administrativo.
 *
 * SAFE GOLD:
 * - NÃO apaga histórico de auditoria
 * - NÃO reabre pagamento automaticamente (volta para DRAFT)
 * - NÃO altera memberships pagas
 * - NÃO reativa cancelamentos automáticos (GC)
 * - Auditoria obrigatória
 *
 * SECURITY:
 * - JWT validado manualmente (padrão do codebase)
 * - Valida tenant boundary (membership.tenant_id === user tenant)
 * - Valida role (ADMIN_TENANT, STAFF_ORGANIZACAO)
 * - Impersonation obrigatório para SUPERADMIN
 * - Billing status check
 * - Rate limiting (10/hour/user)
 * - Motivo obrigatório (min 5 chars)
 * - Último evento DEVE ser MEMBERSHIP_MANUAL_CANCELLED
 */
```

**Fluxo Determinístico:**

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. CORS Preflight                                               │
├─────────────────────────────────────────────────────────────────┤
│ 2. Auth Validation (JWT manual)                                 │
├─────────────────────────────────────────────────────────────────┤
│ 3. Rate Limiting (10/hour/user)                                 │
├─────────────────────────────────────────────────────────────────┤
│ 4. Parse Input (membershipId, reason)                           │
│    → Validate reason (min 5 chars)                              │
├─────────────────────────────────────────────────────────────────┤
│ 5. Fetch Membership                                             │
│    → Validate exists                                            │
├─────────────────────────────────────────────────────────────────┤
│ 6. Authorization Check (Role + Impersonation)                   │
│    → ADMIN_TENANT / STAFF_ORGANIZACAO                           │
│    → SUPERADMIN requires impersonation                          │
├─────────────────────────────────────────────────────────────────┤
│ 7. Billing Status Check                                         │
├─────────────────────────────────────────────────────────────────┤
│ 8. Validate Status === CANCELLED                                │
│    → If DRAFT/PENDING: return idempotent OK                     │
│    → If ACTIVE/APPROVED/EXPIRED: block                          │
├─────────────────────────────────────────────────────────────────┤
│ 9. Block if payment_status === PAID                             │
├─────────────────────────────────────────────────────────────────┤
│ 10. Validate Last Audit Event === MEMBERSHIP_MANUAL_CANCELLED   │
│     → Query audit_logs for this membership                      │
│     → If last event is GC: block with specific error            │
├─────────────────────────────────────────────────────────────────┤
│ 11. UPDATE membership (race-safe)                               │
│     status → DRAFT                                              │
│     cancelled_at → NULL                                         │
│     cancelled_by_profile_id → NULL                              │
│     cancellation_reason → NULL                                  │
├─────────────────────────────────────────────────────────────────┤
│ 12. AUDIT: MEMBERSHIP_MANUAL_REACTIVATED                        │
├─────────────────────────────────────────────────────────────────┤
│ 13. Decision Log (SUCCESS)                                      │
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

**Output (Success):**
```json
{
  "ok": true,
  "membershipId": "uuid",
  "previousStatus": "CANCELLED",
  "newStatus": "DRAFT"
}
```

**Query de Update (Race-safe):**
```sql
UPDATE memberships
SET 
  status = 'DRAFT',
  cancelled_at = NULL,
  cancelled_by_profile_id = NULL,
  cancellation_reason = NULL,
  updated_at = NOW()
WHERE 
  id = :membershipId
  AND status = 'CANCELLED'
  AND payment_status != 'PAID'
RETURNING id, status;
```

---

### Tarefa 3: Registrar Função no `config.toml`

**Arquivo:** `supabase/config.toml`

Adicionar após `[functions.cancel-membership-manual]`:

```toml
[functions.reactivate-membership-manual]
verify_jwt = false
```

---

### Tarefa 4: Atualizar `MembershipDetails.tsx`

**Arquivo:** `src/pages/MembershipDetails.tsx`

**4.1 Adicionar import `RotateCcw`:**
```typescript
import { RotateCcw } from 'lucide-react';
```

**4.2 Adicionar estado para reactivate dialog:**
```typescript
// Reactivate dialog state
const [isReactivateDialogOpen, setIsReactivateDialogOpen] = useState(false);
const [reactivateReason, setReactivateReason] = useState('');
```

**4.3 Adicionar query para buscar último evento de auditoria:**
```typescript
// Fetch last cancellation audit event to determine if manual cancel
const { data: lastCancelEvent } = useQuery({
  queryKey: ['membership-last-cancel-event', membershipId],
  queryFn: async () => {
    if (!membershipId || membership?.status !== 'CANCELLED') return null;
    
    const { data } = await supabase
      .from('audit_logs')
      .select('event_type, metadata')
      .eq('event_type', 'MEMBERSHIP_MANUAL_CANCELLED')
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Find matching log for this membership
    const match = data?.find((log) => {
      const meta = log.metadata as { membership_id?: string } | null;
      return meta?.membership_id === membershipId;
    });
    
    return match || null;
  },
  enabled: !!membershipId && membership?.status === 'CANCELLED',
});
```

**4.4 Adicionar lógica de permissão para reativar:**
```typescript
// Can reactivate only if:
// - User is staff/admin
// - Status is CANCELLED
// - payment_status !== PAID
// - Last cancel event was MANUAL (not GC)
const canReactivateManually = isStaffOrCoach && 
  membership?.status === 'CANCELLED' &&
  membership?.payment_status !== 'PAID' &&
  lastCancelEvent?.event_type === 'MEMBERSHIP_MANUAL_CANCELLED';
```

**4.5 Adicionar mutation para reativar:**
```typescript
// Reactivate mutation
const reactivateMutation = useMutation({
  mutationFn: async () => {
    if (!membershipId || reactivateReason.trim().length < 5) {
      throw new Error(t('membership.reactivate.reasonMinLength'));
    }

    const { data, error } = await supabase.functions.invoke(
      'reactivate-membership-manual',
      {
        body: {
          membershipId,
          reason: reactivateReason.trim(),
          impersonationId: impersonationSession?.impersonationId || undefined,
        },
      }
    );

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Failed to reactivate');
    }

    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['membership'] });
    queryClient.invalidateQueries({ queryKey: ['membership-last-cancel-event'] });
    setIsReactivateDialogOpen(false);
    setReactivateReason('');
    toast.success(t('membership.reactivate.success'));
  },
  onError: (error) => {
    toast.error(error.message || t('common.error'));
  },
});
```

**4.6 Adicionar botão de reativar no CardHeader (após botão de cancel):**
```tsx
{/* Manual Reactivate Button - only for manually cancelled memberships */}
{canReactivateManually && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setIsReactivateDialogOpen(true)}
    className="text-primary border-primary hover:bg-primary/10"
  >
    <RotateCcw className="h-4 w-4 mr-2" />
    {t('membership.reactivate.title')}
  </Button>
)}
```

**4.7 Adicionar dialog de reativação (após cancel dialog):**
```tsx
{/* Reactivate Membership Dialog */}
<Dialog open={isReactivateDialogOpen} onOpenChange={setIsReactivateDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-primary">
        <RotateCcw className="h-5 w-5" />
        {t('membership.reactivate.confirmTitle')}
      </DialogTitle>
      <DialogDescription>
        {t('membership.reactivate.confirmDesc')}
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4 py-4">
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm">
        <p className="font-medium text-primary mb-2">
          {t('membership.reactivate.infoTitle')}
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>{t('membership.reactivate.infoBackToDraft')}</li>
          <li>{t('membership.reactivate.infoNoAutoPayment')}</li>
          <li>{t('membership.reactivate.infoAudited')}</li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reactivate-reason">
          {t('membership.reactivate.reason')} <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="reactivate-reason"
          placeholder={t('membership.reactivate.reasonPlaceholder')}
          value={reactivateReason}
          onChange={(e) => setReactivateReason(e.target.value)}
          rows={3}
        />
        {reactivateReason.length > 0 && reactivateReason.length < 5 && (
          <p className="text-xs text-destructive">
            {t('membership.reactivate.reasonMinLength')}
          </p>
        )}
      </div>
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setIsReactivateDialogOpen(false)}
        disabled={reactivateMutation.isPending}
      >
        {t('common.cancel')}
      </Button>
      <Button
        onClick={() => reactivateMutation.mutate()}
        disabled={reactivateMutation.isPending || reactivateReason.trim().length < 5}
      >
        {reactivateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('common.loading')}
          </>
        ) : (
          <>
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('membership.reactivate.confirm')}
          </>
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Tarefa 5: Adicionar Traduções (i18n)

**Arquivo:** `src/locales/pt-BR.ts`

```typescript
// P3.MEMBERSHIP.MANUAL.REACTIVATE — Manual Reactivation
'membership.reactivate.title': 'Reativar filiação',
'membership.reactivate.confirmTitle': 'Confirmar reativação',
'membership.reactivate.confirmDesc': 'A filiação voltará para o estado inicial (DRAFT).',
'membership.reactivate.infoTitle': 'Importante',
'membership.reactivate.infoBackToDraft': 'A filiação voltará para o estado RASCUNHO',
'membership.reactivate.infoNoAutoPayment': 'O pagamento NÃO será reaberto automaticamente',
'membership.reactivate.infoAudited': 'A reativação será registrada no histórico',
'membership.reactivate.reason': 'Motivo da reativação',
'membership.reactivate.reasonPlaceholder': 'Descreva o motivo da reativação...',
'membership.reactivate.reasonMinLength': 'O motivo deve ter pelo menos 5 caracteres',
'membership.reactivate.confirm': 'Confirmar reativação',
'membership.reactivate.success': 'Filiação reativada com sucesso',
```

**Arquivo:** `src/locales/en.ts`

```typescript
// P3.MEMBERSHIP.MANUAL.REACTIVATE — Manual Reactivation
'membership.reactivate.title': 'Reactivate membership',
'membership.reactivate.confirmTitle': 'Confirm reactivation',
'membership.reactivate.confirmDesc': 'The membership will return to the initial state (DRAFT).',
'membership.reactivate.infoTitle': 'Important',
'membership.reactivate.infoBackToDraft': 'The membership will return to DRAFT status',
'membership.reactivate.infoNoAutoPayment': 'Payment will NOT be automatically reopened',
'membership.reactivate.infoAudited': 'The reactivation will be recorded in the history',
'membership.reactivate.reason': 'Reactivation reason',
'membership.reactivate.reasonPlaceholder': 'Describe the reason for reactivation...',
'membership.reactivate.reasonMinLength': 'Reason must be at least 5 characters',
'membership.reactivate.confirm': 'Confirm reactivation',
'membership.reactivate.success': 'Membership reactivated successfully',
```

**Arquivo:** `src/locales/es.ts`

```typescript
// P3.MEMBERSHIP.MANUAL.REACTIVATE — Manual Reactivation
'membership.reactivate.title': 'Reactivar membresía',
'membership.reactivate.confirmTitle': 'Confirmar reactivación',
'membership.reactivate.confirmDesc': 'La membresía volverá al estado inicial (BORRADOR).',
'membership.reactivate.infoTitle': 'Importante',
'membership.reactivate.infoBackToDraft': 'La membresía volverá al estado BORRADOR',
'membership.reactivate.infoNoAutoPayment': 'El pago NO se reabrirá automáticamente',
'membership.reactivate.infoAudited': 'La reactivación quedará registrada en el historial',
'membership.reactivate.reason': 'Motivo de reactivación',
'membership.reactivate.reasonPlaceholder': 'Describe el motivo de la reactivación...',
'membership.reactivate.reasonMinLength': 'El motivo debe tener al menos 5 caracteres',
'membership.reactivate.confirm': 'Confirmar reactivación',
'membership.reactivate.success': 'Membresía reactivada exitosamente',
```

---

### Tarefa 6: Atualizar Documentação

**Arquivo:** `docs/BUSINESS-FLOWS.md`

Adicionar após Seção 11 (linha 588, antes do fechamento):

```markdown
---

## 12. Reativação Manual de Membership

Permite que administradores reativem uma filiação **cancelada manualmente** para corrigir erros administrativos. Esta funcionalidade NÃO se aplica a cancelamentos automáticos (GC).

```text
┌─────────────────────────────────────────────────────────────────┐
│ ELEGÍVEL: CANCELLED (somente se último evento = manual)         │
│ BLOQUEADO: CANCELLED por GC | EXPIRED | ACTIVE | PAID           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (admin clica "Reativar filiação")
┌─────────────────────────────────────────────────────────────────┐
│              reactivate-membership-manual                        │
│                                                                  │
│  Validações:                                                     │
│  ✓ JWT validado manualmente                                      │
│  ✓ Role: ADMIN_TENANT | STAFF_ORGANIZACAO                        │
│  ✓ Superadmin: impersonation obrigatório                         │
│  ✓ Tenant boundary                                               │
│  ✓ status === CANCELLED                                          │
│  ✓ payment_status !== PAID                                       │
│  ✓ Último evento = MEMBERSHIP_MANUAL_CANCELLED                   │
│  ✓ Motivo obrigatório (min 5 chars)                              │
│                                                                  │
│  Campos atualizados:                                             │
│  status → DRAFT                                                  │
│  cancelled_at → NULL                                             │
│  cancelled_by_profile_id → NULL                                  │
│  cancellation_reason → NULL                                      │
│                                                                  │
│  Auditoria:                                                      │
│  MEMBERSHIP_MANUAL_REACTIVATED                                   │
│  → reactivation_source: 'manual_admin'                           │
│  → reason: 'motivo obrigatório'                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DRAFT                                    │
│            (pode reiniciar fluxo de filiação)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Princípios SAFE GOLD

- ❌ NÃO apaga histórico de auditoria
- ❌ NÃO reabre pagamento automaticamente
- ❌ NÃO reativa cancelamentos por GC
- ❌ NÃO afeta memberships pagas
- ❌ NÃO permite cross-tenant
- ✅ Sempre audita
- ✅ Sempre exige motivo
- ✅ Sempre valida papel

### Tabela de Ações Administrativas

| Ação | Evento de Auditoria | Status Final |
|------|---------------------|--------------|
| Cancelamento manual | `MEMBERSHIP_MANUAL_CANCELLED` | CANCELLED |
| Reativação manual | `MEMBERSHIP_MANUAL_REACTIVATED` | DRAFT |

### Diferença de Retry de Pagamento

| Cenário | Ação Permitida |
|---------|----------------|
| CANCELLED por GC (payment_timeout) | `retry-membership-payment` → PENDING_PAYMENT |
| CANCELLED por GC (DRAFT abandoned) | `retry-membership-payment` → PENDING_PAYMENT |
| **CANCELLED manualmente** | `reactivate-membership-manual` → DRAFT |
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/_shared/audit-logger.ts` | **MODIFICAR** | Adicionar `MEMBERSHIP_MANUAL_REACTIVATED` |
| `supabase/functions/reactivate-membership-manual/index.ts` | **CRIAR** | Edge Function principal |
| `supabase/config.toml` | **MODIFICAR** | Registrar função |
| `src/pages/MembershipDetails.tsx` | **MODIFICAR** | Adicionar botão e dialog de reativação |
| `src/locales/pt-BR.ts` | **ADICIONAR** | 12 novas chaves |
| `src/locales/en.ts` | **ADICIONAR** | 12 novas chaves |
| `src/locales/es.ts` | **ADICIONAR** | 12 novas chaves |
| `docs/BUSINESS-FLOWS.md` | **ADICIONAR** | Seção 12 - Reativação Manual |

---

## Critérios de Aceitação

### Funcionalidade Core
- [ ] Apenas ADMIN_TENANT/STAFF_ORGANIZACAO podem reativar
- [ ] Motivo obrigatório (min 5 chars)
- [ ] Apenas status === CANCELLED
- [ ] Apenas cancelamentos manuais (não GC)
- [ ] Membership paga NÃO pode ser reativada
- [ ] Status final = DRAFT

### Segurança
- [ ] JWT validado manualmente
- [ ] Tenant boundary validado
- [ ] Superadmin requer impersonation
- [ ] Billing status verificado
- [ ] Rate limiting aplicado (10/hour/user)

### Validação de Último Evento
- [ ] Query em audit_logs para membership_id
- [ ] Bloqueia se último evento = GC automático
- [ ] Permite apenas se último evento = MEMBERSHIP_MANUAL_CANCELLED

### Auditoria
- [ ] Evento `MEMBERSHIP_MANUAL_REACTIVATED` registrado
- [ ] Metadata inclui `reactivation_source: 'manual_admin'`
- [ ] Motivo registrado
- [ ] IP + role registrados

### UI
- [ ] Botão aparece apenas para CANCELLED + NOT_PAID + manual cancel
- [ ] Modal de confirmação com informações claras
- [ ] Motivo obrigatório na UI
- [ ] Feedback de sucesso/erro

---

## Seção Técnica

### Estrutura da Edge Function

A função segue exatamente o template de `cancel-membership-manual`:

1. **Imports**: Mesmo set de imports (audit-logger, impersonation, rate-limiter, decision-logger, billing)
2. **CORS Headers**: Idêntico
3. **Rate Limiter**: 10/hour/user (mesmo preset)
4. **Auth Validation**: Mesmo padrão JWT manual
5. **Role Check**: ADMIN_TENANT / STAFF_ORGANIZACAO
6. **Impersonation**: Obrigatório para SUPERADMIN
7. **Billing Check**: Mesmo padrão
8. **Status Validation**: CANCELLED only
9. **Audit Log Query**: Nova validação para último evento
10. **Race-safe Update**: Pattern idêntico com `.eq('status', 'CANCELLED')`

### Query de Validação de Último Evento

```typescript
// Fetch most recent cancellation event for this membership
const { data: cancelEvents } = await supabase
  .from("audit_logs")
  .select("event_type, metadata, created_at")
  .in("event_type", [
    "MEMBERSHIP_MANUAL_CANCELLED",
    "MEMBERSHIP_PENDING_PAYMENT_CLEANUP",
    "MEMBERSHIP_ABANDONED_CLEANUP",
  ])
  .order("created_at", { ascending: false })
  .limit(20);

const lastCancelEvent = cancelEvents?.find((log) => {
  const meta = log.metadata as { membership_id?: string } | null;
  return meta?.membership_id === membershipId;
});

if (!lastCancelEvent) {
  // No cancellation event found - edge case, block
  return error(400, "NO_CANCELLATION_EVENT_FOUND");
}

if (lastCancelEvent.event_type !== "MEMBERSHIP_MANUAL_CANCELLED") {
  // GC cancellation - use retry instead
  return error(400, "REACTIVATION_NOT_ALLOWED_FOR_GC_CANCELLATION");
}
```

### Rate Limiting

| Identificador | Limite | Janela |
|---------------|--------|--------|
| user_id | 10 | 1 hora |

### Estrutura de Auditoria

```json
{
  "event_type": "MEMBERSHIP_MANUAL_REACTIVATED",
  "tenant_id": "uuid",
  "profile_id": "uuid",
  "metadata": {
    "membership_id": "uuid",
    "previous_status": "CANCELLED",
    "new_status": "DRAFT",
    "reactivation_source": "manual_admin",
    "reason": "Cancelamento feito por engano - atleta enviou documentos corretos",
    "actor_role": "ADMIN_TENANT",
    "impersonation_id": null,
    "ip_address": "x.x.x.x",
    "occurred_at": "2026-02-08T14:30:00Z"
  }
}
```

---

## Conclusão

Este PI completa o ciclo simétrico de governança de membership:

```text
DRAFT ←→ CANCELLED (manual only)
   │
   └─ Cancelar: cancel-membership-manual
   └─ Reativar: reactivate-membership-manual (ESTE PI)
```

**Garantias SAFE GOLD:**
1. ✅ Não cria brechas de segurança
2. ✅ Não reabre pagamento automaticamente
3. ✅ Não desfaz auditoria
4. ✅ Mantém histórico intacto
5. ✅ Distingue cancelamentos manuais de GC

Pronto para execução literal, sem interpretação.

