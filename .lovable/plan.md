
# Plano: P3.MEMBERSHIP.PENDING.GC (SAFE GOLD)

## Resumo do Diagnóstico

### Análise do Codebase

| Componente | Estado | Arquivo de Referência |
|------------|--------|----------------------|
| **Edge Function Template** | `cleanup-abandoned-memberships` | ✅ Padrão exato a seguir |
| **Audit Logger** | AUDIT_EVENTS | ✅ Padrão consolidado |
| **PlatformHealthCard** | 4 jobs já monitorados | ✅ Padrão visual estabelecido |
| **config.toml** | `verify_jwt = false` | ✅ Padrão para cron jobs |
| **Documentação** | `docs/operacao-configuracoes.md` | ✅ Tabela e SQLs |

### Diferença entre DRAFT e PENDING_PAYMENT

| Aspecto | DRAFT (já implementado) | PENDING_PAYMENT (este PI) |
|---------|------------------------|---------------------------|
| **Status inicial** | `DRAFT` | `PENDING_PAYMENT` |
| **Pagamento iniciado** | ❌ Não | ✅ Sim (Stripe session criada) |
| **Timeout padrão** | 24h | 24h (Stripe session expira em ~24h) |
| **Ação** | `status → CANCELLED` | `status → CANCELLED` |
| **Stripe envolvido** | ❌ | ❌ (não toca em Stripe) |

---

## Tarefas de Implementação

### Tarefa 1: Criar Edge Function `cleanup-pending-payment-memberships`

**Arquivo:** `supabase/functions/cleanup-pending-payment-memberships/index.ts`

```typescript
/**
 * cleanup-pending-payment-memberships
 * 
 * Daily garbage collection of abandoned PENDING_PAYMENT memberships.
 * 
 * Executes daily at 03:45 UTC via pg_cron.
 * 
 * Rules:
 * - status = 'PENDING_PAYMENT'
 * - payment_status = 'NOT_PAID'
 * - created_at < now() - 24 hours
 * 
 * SAFE GOLD:
 * - ❌ DOES NOT touch Stripe
 * - ❌ DOES NOT touch athletes
 * - ❌ DOES NOT touch guardians
 * - ❌ DOES NOT touch financial data
 * - ✅ ONLY updates status to CANCELLED
 */
```

**Estrutura (seguindo exatamente `cleanup-abandoned-memberships`):**

1. Validação de `CRON_SECRET`
2. Geração de `jobRunId` (UUID)
3. Log `JOB_PENDING_PAYMENT_GC_RUN` (STARTED)
4. Query: `status = 'PENDING_PAYMENT' AND payment_status = 'NOT_PAID' AND created_at < 24h`
5. Para cada membership:
   - Update: `status → CANCELLED`
   - Log: `MEMBERSHIP_PENDING_PAYMENT_CLEANUP`
6. Log `JOB_PENDING_PAYMENT_GC_RUN` (COMPLETED)
7. Response com métricas

---

### Tarefa 2: Adicionar Eventos ao `audit-logger.ts`

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar na seção de membership events (após linha 24):

```typescript
MEMBERSHIP_PENDING_PAYMENT_CLEANUP: 'MEMBERSHIP_PENDING_PAYMENT_CLEANUP',
```

Adicionar na seção de job events (após linha 76):

```typescript
JOB_PENDING_PAYMENT_GC_RUN: 'JOB_PENDING_PAYMENT_GC_RUN',
```

---

### Tarefa 3: Registrar Função no `config.toml`

**Arquivo:** `supabase/config.toml`

Adicionar ao final:

```toml
[functions.cleanup-pending-payment-memberships]
verify_jwt = false
```

---

### Tarefa 4: Atualizar `PlatformHealthCard.tsx`

**Arquivo:** `src/components/admin/PlatformHealthCard.tsx`

**4.1 Atualizar interface PlatformMetrics (linha 17):**

```typescript
interface PlatformMetrics {
  // ... campos existentes ...
  
  // Pending Payment GC job
  lastPendingPaymentGCRun: string | null;
  pendingPaymentGCHadEvents: boolean;
  pendingPaymentCleanedLast7d: number;
  pendingPaymentCleanedLast24h: number;
}
```

**4.2 Adicionar ao array de event_types do jobRunLogs (linha 68):**

```typescript
.in('event_type', [
  'JOB_EXPIRE_MEMBERSHIPS_RUN',
  'JOB_CLEANUP_ABANDONED_RUN',
  'JOB_CHECK_TRIALS_RUN',
  'JOB_YOUTH_TRANSITION_RUN',
  'JOB_PENDING_PAYMENT_GC_RUN', // NOVO
])
```

**4.3 Adicionar ao array de event_types do actionLogs (linha 81):**

```typescript
.in('event_type', [
  'MEMBERSHIP_EXPIRED', 
  'MEMBERSHIP_ABANDONED_CLEANUP',
  'TRIAL_END_NOTIFICATION_SENT',
  'TENANT_PAYMENT_FAILED',
  'YOUTH_AUTO_TRANSITION',
  'MEMBERSHIP_PENDING_PAYMENT_CLEANUP', // NOVO
])
```

**4.4 Adicionar variáveis e processamento do job (após linha 99):**

```typescript
let lastPendingPaymentGCRun: string | null = null;
let pendingPaymentGCHadEvents = false;

// No switch case:
case 'JOB_PENDING_PAYMENT_GC_RUN':
  if (!lastPendingPaymentGCRun && meta?.status === 'COMPLETED') {
    lastPendingPaymentGCRun = log.created_at;
    pendingPaymentGCHadEvents = (meta?.cancelled || meta?.processed || 0) > 0;
  }
  break;
```

**4.5 Adicionar contagem de limpezas (após linha 150):**

```typescript
let pendingPaymentCleanedLast24h = 0;
let pendingPaymentCleanedLast7d = 0;

// No switch case:
case 'MEMBERSHIP_PENDING_PAYMENT_CLEANUP':
  pendingPaymentCleanedLast7d++;
  if (isLast24h) pendingPaymentCleanedLast24h++;
  break;
```

**4.6 Adicionar retorno das métricas (linhas 198-216):**

```typescript
return {
  // ... existentes ...
  lastPendingPaymentGCRun,
  pendingPaymentGCHadEvents,
  pendingPaymentCleanedLast7d,
  pendingPaymentCleanedLast24h,
};
```

**4.7 Adicionar card de visualização no grid (após linha 396):**

```typescript
<div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
  <div>
    <p className="text-xs text-muted-foreground">{t('platformHealth.pendingPaymentGC')}</p>
    <p className="text-sm font-medium">{formatTime(metrics.lastPendingPaymentGCRun)}</p>
  </div>
  <Badge 
    variant={getJobStatus(metrics.lastPendingPaymentGCRun, metrics.pendingPaymentGCHadEvents).color} 
    className="text-xs cursor-help"
    title={getJobStatus(metrics.lastPendingPaymentGCRun, metrics.pendingPaymentGCHadEvents).tooltip}
  >
    {getJobStatus(metrics.lastPendingPaymentGCRun, metrics.pendingPaymentGCHadEvents).label}
  </Badge>
</div>
```

**4.8 Adicionar métrica na seção de métricas (após linha 417):**

```typescript
<div className="text-center p-2 bg-muted/50 rounded-md">
  <p className="text-lg font-semibold">{metrics.pendingPaymentCleanedLast7d}</p>
  <p className="text-xs text-muted-foreground">{t('platformHealth.pendingPaymentCleaned')}</p>
  <p className="text-xs text-muted-foreground/70">{t('platformHealth.in24h').replace('{n}', String(metrics.pendingPaymentCleanedLast24h))}</p>
</div>
```

---

### Tarefa 5: Adicionar Traduções (i18n)

**Arquivo:** `src/locales/pt-BR.ts`

```typescript
'platformHealth.pendingPaymentGC': 'Limpar Pagamentos Pendentes',
'platformHealth.pendingPaymentCleaned': 'Pgto. pendentes limpos',
```

**Arquivo:** `src/locales/en.ts`

```typescript
'platformHealth.pendingPaymentGC': 'Clean Pending Payments',
'platformHealth.pendingPaymentCleaned': 'Pending payments cleaned',
```

**Arquivo:** `src/locales/es.ts`

```typescript
'platformHealth.pendingPaymentGC': 'Limpiar Pagos Pendientes',
'platformHealth.pendingPaymentCleaned': 'Pagos pendientes limpiados',
```

---

### Tarefa 6: Atualizar Documentação

**Arquivo:** `docs/operacao-configuracoes.md`

**6.1 Adicionar à tabela de jobs (após linha 148):**

```markdown
| `cleanup-pending-payment-memberships-daily` | Cancela filiações com pagamento pendente > 24h | 03:45 | 🟡 Média |
```

**6.2 Adicionar SQL de agendamento (após cleanup-abandoned-memberships):**

```markdown
#### cleanup-pending-payment-memberships (diário às 03:45 UTC)
Cancela filiações que iniciaram checkout mas não concluíram pagamento em 24h.

**⚠️ IMPORTANTE:** Este job usa autenticação via header `x-cron-secret`.

\`\`\`sql
SELECT cron.schedule(
  'cleanup-pending-payment-memberships-daily',
  '45 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-pending-payment-memberships',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.cron_secret') || '"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
\`\`\`

**Regras SAFE GOLD:**
- ❌ NÃO toca em Stripe (sessions, invoices)
- ❌ NÃO remove dados fisicamente
- ✅ Apenas atualiza `status → CANCELLED`
- ✅ 100% auditável e idempotente
```

---

### Tarefa 7: Atualizar BUSINESS-FLOWS.md

**Arquivo:** `docs/BUSINESS-FLOWS.md`

Adicionar seção após o fluxo de filiação:

```markdown
### Garbage Collection — PENDING_PAYMENT

Filiações que iniciaram checkout mas não concluíram pagamento são canceladas automaticamente após 24h.

```text
[Membership Created] ─→ [Checkout Iniciado] ─→ [PENDING_PAYMENT]
                                                      │
                                                      ▼
                                            ┌─────────────────────┐
                                            │ 24h sem confirmação │
                                            └─────────────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────────┐
                                            │ cleanup-pending-    │
                                            │ payment-memberships │
                                            │ (cron 03:45 UTC)    │
                                            └─────────────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────────┐
                                            │ status → CANCELLED  │
                                            └─────────────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────────┐
                                            │ Audit:              │
                                            │ MEMBERSHIP_PENDING_ │
                                            │ PAYMENT_CLEANUP     │
                                            └─────────────────────┘
```

**Princípios SAFE GOLD:**
- ❌ NÃO toca em Stripe (sessions, invoices, webhooks)
- ❌ NÃO remove dados fisicamente
- ❌ NÃO afeta athletes ou guardians
- ✅ Apenas atualiza status
- ✅ 100% auditável e idempotente
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/cleanup-pending-payment-memberships/index.ts` | **CRIAR** | Edge Function do job |
| `supabase/functions/_shared/audit-logger.ts` | **MODIFICAR** | Adicionar 2 novos eventos |
| `supabase/config.toml` | **MODIFICAR** | Registrar nova função |
| `src/components/admin/PlatformHealthCard.tsx` | **MODIFICAR** | Monitorar novo job + métricas |
| `src/locales/pt-BR.ts` | **ADICIONAR** | 2 novas chaves |
| `src/locales/en.ts` | **ADICIONAR** | 2 novas chaves |
| `src/locales/es.ts` | **ADICIONAR** | 2 novas chaves |
| `docs/operacao-configuracoes.md` | **ADICIONAR** | Documentar cron job |
| `docs/BUSINESS-FLOWS.md` | **ADICIONAR** | Documentar fluxo |

---

## Critérios de Aceitação

- [ ] Edge Function criada e deployada
- [ ] Job registra `JOB_PENDING_PAYMENT_GC_RUN` (STARTED/COMPLETED)
- [ ] Cada cancelamento registra `MEMBERSHIP_PENDING_PAYMENT_CLEANUP`
- [ ] Apenas `PENDING_PAYMENT` + `NOT_PAID` afetados
- [ ] Nenhuma membership paga cancelada
- [ ] Stripe NÃO é tocado
- [ ] Job idempotente (status check no UPDATE)
- [ ] PlatformHealthCard monitora o job
- [ ] Documentação atualizada
- [ ] SAFE GOLD preservado

---

## Seção Técnica

### Query de Seleção (Canônica)

```sql
SELECT id, tenant_id, applicant_profile_id, created_at
FROM memberships
WHERE status = 'PENDING_PAYMENT'
  AND payment_status = 'NOT_PAID'
  AND created_at < NOW() - INTERVAL '24 hours';
```

### Update com Race Protection

```sql
UPDATE memberships
SET status = 'CANCELLED',
    updated_at = NOW()
WHERE id = :membership_id
  AND status = 'PENDING_PAYMENT';
```

A condição `AND status = 'PENDING_PAYMENT'` garante:
1. **Idempotência**: Se já foi cancelado, UPDATE não afeta nada
2. **Race protection**: Se pagamento chegou entre query e update, não cancela

### Horário do Cron

`03:45 UTC` escolhido para:
- Executar APÓS `transition-youth-to-adult` (03:15 UTC)
- Executar ANTES de `cleanup-abandoned-memberships` (04:00 UTC)
- Ordenação lógica: Youth → Pending → Draft

### Estrutura de Auditoria

**Por Item:**
```json
{
  "event_type": "MEMBERSHIP_PENDING_PAYMENT_CLEANUP",
  "tenant_id": "uuid",
  "metadata": {
    "membership_id": "uuid",
    "previous_status": "PENDING_PAYMENT",
    "new_status": "CANCELLED",
    "payment_status": "NOT_PAID",
    "created_at": "2024-02-07T10:00:00Z",
    "age_hours": 26,
    "reason": "payment_timeout",
    "automatic": true,
    "scheduled": true,
    "job_run_id": "uuid"
  }
}
```

**Por Job:**
```json
{
  "event_type": "JOB_PENDING_PAYMENT_GC_RUN",
  "tenant_id": null,
  "metadata": {
    "job_run_id": "uuid",
    "status": "COMPLETED",
    "processed": 12,
    "cancelled": 10,
    "skipped": 2,
    "failed": 0,
    "automatic": true,
    "scheduled": true
  }
}
```
