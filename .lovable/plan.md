
# Plano: Monitoramento de Jobs e Saúde da Plataforma

## Resumo do Diagnóstico

### Estado Atual

| Componente | Arquivo | Comportamento Atual |
|------------|---------|---------------------|
| PlatformHealthCard | `src/components/admin/PlatformHealthCard.tsx` | Busca eventos de ação (`MEMBERSHIP_EXPIRED`, etc.) para inferir última execução |
| Edge Functions | 8 funções de job | Registram eventos de ação, mas NÃO eventos de execução (JOB_RUN) |
| Cron Jobs | `docs/operacao-configuracoes.md` | Documentados com SQL, alguns já agendados |
| Traduções | `src/locales/*.ts` | Chaves existentes para platformHealth |

### Problemas Identificados

1. **PlatformHealthCard depende de eventos de ação**: Se um job executa mas não encontra nada para processar, não há registro de execução.
2. **"Nunca executou" falso positivo**: Jobs podem estar funcionando, mas sem itens para processar, aparecem como "Sem dados".
3. **Não diferencia "job não executou" de "executou sem eventos"**: Ambos mostram "Sem dados".
4. **Falta de eventos JOB_RUN no audit_logger**: O padrão `JOB_*_RUN` não está definido.

### Jobs Existentes que Precisam de Monitoramento

| Job | Função | Evento de Ação Atual | Evento de Execução (faltando) |
|-----|--------|---------------------|------------------------------|
| expire-memberships | `MEMBERSHIP_EXPIRED` | Sim | ❌ Falta `JOB_EXPIRE_MEMBERSHIPS_RUN` |
| cleanup-abandoned-memberships | `MEMBERSHIP_ABANDONED_CLEANUP` | Sim | ❌ Falta `JOB_CLEANUP_ABANDONED_RUN` |
| check-trial-ending | `TRIAL_END_NOTIFICATION_SENT` | Sim | ❌ Falta `JOB_CHECK_TRIALS_RUN` |
| expire-trials | `TRIAL_EXPIRED` | Sim | ❌ Falta `JOB_EXPIRE_TRIALS_RUN` |
| mark-pending-delete | `PENDING_DELETE` | Sim | ❌ Falta `JOB_PENDING_DELETE_RUN` |
| pre-expiration-scheduler | `MEMBERSHIP_EXPIRING_NOTIFIED` | Sim | ❌ Falta `JOB_PRE_EXPIRATION_RUN` |
| cleanup-tmp-documents | `TMP_DOCUMENT_CLEANUP_RUN` | ✅ Já existe | - |

---

## Tarefas de Implementação

### Tarefa 1: Adicionar Eventos de Execução no audit-logger.ts

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar constantes para eventos de execução de job na seção de AUDIT_EVENTS:

```typescript
// Job execution events (runs even when no items processed)
JOB_EXPIRE_MEMBERSHIPS_RUN: 'JOB_EXPIRE_MEMBERSHIPS_RUN',
JOB_CLEANUP_ABANDONED_RUN: 'JOB_CLEANUP_ABANDONED_RUN',
JOB_CHECK_TRIALS_RUN: 'JOB_CHECK_TRIALS_RUN',
JOB_EXPIRE_TRIALS_RUN: 'JOB_EXPIRE_TRIALS_RUN',
JOB_PENDING_DELETE_RUN: 'JOB_PENDING_DELETE_RUN',
JOB_PRE_EXPIRATION_RUN: 'JOB_PRE_EXPIRATION_RUN',
JOB_RENEWAL_REMINDER_RUN: 'JOB_RENEWAL_REMINDER_RUN',
```

---

### Tarefa 2: Modificar expire-memberships para Registrar Execução

**Arquivo:** `supabase/functions/expire-memberships/index.ts`

Adicionar log de execução no início e/ou final do job (linhas ~91 e ~389):

**Início do job (após linha 91):**
```typescript
// Log job execution start
await createAuditLog(supabase, {
  event_type: AUDIT_EVENTS.JOB_EXPIRE_MEMBERSHIPS_RUN,
  tenant_id: null, // Global job
  metadata: {
    job_run_id: jobRunId,
    status: 'STARTED',
    automatic: true,
    scheduled: true,
    source: 'expire-memberships-job',
  },
});
```

**Final do job (antes do return linha 391):**
```typescript
// Log job execution completion
await createAuditLog(supabase, {
  event_type: AUDIT_EVENTS.JOB_EXPIRE_MEMBERSHIPS_RUN,
  tenant_id: null,
  metadata: {
    job_run_id: jobRunId,
    status: 'COMPLETED',
    processed,
    expired,
    skipped,
    failed,
    emailsSent,
    automatic: true,
    scheduled: true,
    source: 'expire-memberships-job',
  },
});
```

---

### Tarefa 3: Modificar cleanup-abandoned-memberships para Registrar Execução

**Arquivo:** `supabase/functions/cleanup-abandoned-memberships/index.ts`

Adicionar log de execução:

**Após linha 64 (após logStep "Starting cleanup job"):**
```typescript
const jobRunId = crypto.randomUUID();

// Log job execution
await createAuditLog(supabase, {
  event_type: AUDIT_EVENTS.JOB_CLEANUP_ABANDONED_RUN,
  tenant_id: null,
  metadata: {
    job_run_id: jobRunId,
    status: 'STARTED',
    automatic: true,
    scheduled: true,
    source: 'cleanup-abandoned-memberships-job',
  },
});
```

**Antes do return final (linha ~154):**
```typescript
// Log job completion
await createAuditLog(supabase, {
  event_type: AUDIT_EVENTS.JOB_CLEANUP_ABANDONED_RUN,
  tenant_id: null,
  metadata: {
    job_run_id: jobRunId,
    status: 'COMPLETED',
    cleaned: successCount,
    failed: failCount,
    automatic: true,
    scheduled: true,
    source: 'cleanup-abandoned-memberships-job',
  },
});
```

---

### Tarefa 4: Modificar check-trial-ending para Registrar Execução

**Arquivo:** `supabase/functions/check-trial-ending/index.ts`

Adicionar log de execução (após linha 59):

```typescript
const jobRunId = crypto.randomUUID();

// Log job execution
await supabase.from("audit_logs").insert({
  event_type: "JOB_CHECK_TRIALS_RUN",
  tenant_id: null,
  metadata: {
    job_run_id: jobRunId,
    status: 'STARTED',
    automatic: true,
    scheduled: true,
    source: 'check-trial-ending-job',
  },
});
```

**Antes do return final (linha ~167):**
```typescript
// Log job completion
await supabase.from("audit_logs").insert({
  event_type: "JOB_CHECK_TRIALS_RUN",
  tenant_id: null,
  metadata: {
    job_run_id: jobRunId,
    status: 'COMPLETED',
    processed: results.length,
    notified: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    automatic: true,
    scheduled: true,
    source: 'check-trial-ending-job',
  },
});
```

---

### Tarefa 5: Atualizar PlatformHealthCard para Usar Eventos de Execução

**Arquivo:** `src/components/admin/PlatformHealthCard.tsx`

#### 5.1 Atualizar interface PlatformMetrics

```typescript
interface PlatformMetrics {
  // Job execution metrics (from JOB_*_RUN events)
  lastExpireMembershipsRun: string | null;
  lastCleanupAbandonedRun: string | null;
  lastTrialCheckRun: string | null;
  
  // Job execution had events?
  expireMembershipsHadEvents: boolean;
  cleanupAbandonedHadEvents: boolean;
  trialCheckHadEvents: boolean;
  
  // Counts from last 24h/7d (action events)
  expiredLast24h: number;
  expiredLast7d: number;
  cleanedLast24h: number;
  cleanedLast7d: number;
  
  // ... existing fields
}
```

#### 5.2 Atualizar query para buscar eventos de execução

Modificar `queryFn` (linhas 51-141):

```typescript
// Fetch job execution events (JOB_*_RUN)
const { data: jobRunLogs } = await supabase
  .from('audit_logs')
  .select('event_type, created_at, metadata')
  .in('event_type', [
    'JOB_EXPIRE_MEMBERSHIPS_RUN',
    'JOB_CLEANUP_ABANDONED_RUN',
    'JOB_CHECK_TRIALS_RUN',
  ])
  .gte('created_at', sevenDaysAgo)
  .order('created_at', { ascending: false });

// Fetch action events (existing query)
const { data: actionLogs } = await supabase
  .from('audit_logs')
  .select('event_type, created_at, metadata')
  .in('event_type', [
    'MEMBERSHIP_EXPIRED', 
    'MEMBERSHIP_ABANDONED_CLEANUP',
    'TRIAL_END_NOTIFICATION_SENT',
    'TENANT_PAYMENT_FAILED'
  ])
  .gte('created_at', sevenDaysAgo)
  .order('created_at', { ascending: false });
```

#### 5.3 Processar eventos de execução separadamente

```typescript
// Process job run events
let expireMembershipsHadEvents = false;
let cleanupAbandonedHadEvents = false;
let trialCheckHadEvents = false;

jobRunLogs?.forEach(log => {
  const meta = log.metadata as { processed?: number; cleaned?: number; status?: string } | null;
  
  switch (log.event_type) {
    case 'JOB_EXPIRE_MEMBERSHIPS_RUN':
      if (!lastExpireMembershipsRun && meta?.status === 'COMPLETED') {
        lastExpireMembershipsRun = log.created_at;
        expireMembershipsHadEvents = (meta?.processed || 0) > 0;
      }
      break;
    case 'JOB_CLEANUP_ABANDONED_RUN':
      if (!lastCleanupAbandonedRun && meta?.status === 'COMPLETED') {
        lastCleanupAbandonedRun = log.created_at;
        cleanupAbandonedHadEvents = (meta?.cleaned || 0) > 0;
      }
      break;
    case 'JOB_CHECK_TRIALS_RUN':
      if (!lastTrialCheckRun && meta?.status === 'COMPLETED') {
        lastTrialCheckRun = log.created_at;
        trialCheckHadEvents = (meta?.processed || 0) > 0;
      }
      break;
  }
});

// Continue processing action events for counts...
```

#### 5.4 Modificar getJobStatus para considerar "executou sem eventos"

```typescript
const getJobStatus = (
  lastRun: string | null, 
  hadEvents: boolean = true
): { status: string; color: 'default' | 'secondary' | 'destructive'; label: string; tooltip: string } => {
  if (!lastRun) return { 
    status: 'unknown', 
    color: 'secondary', 
    label: t('platformHealth.noData'),
    tooltip: t('platformHealth.noDataTooltip')
  };
  
  const hoursSinceRun = (Date.now() - new Date(lastRun).getTime()) / 3600000;
  
  if (hoursSinceRun < 25) {
    return { 
      status: 'ok', 
      color: 'default',
      label: t('platformHealth.ok'),
      tooltip: hadEvents 
        ? t('platformHealth.okTooltip') 
        : t('platformHealth.noEventsTooltip')
    };
  }
  if (hoursSinceRun < 48) return { 
    status: 'warning', 
    color: 'secondary',
    label: t('platformHealth.delayed'),
    tooltip: t('platformHealth.delayedTooltip')
  };
  return { 
    status: 'error', 
    color: 'destructive',
    label: t('platformHealth.error'),
    tooltip: t('platformHealth.errorTooltip')
  };
};
```

---

### Tarefa 6: Adicionar Chaves de Tradução

**Arquivos:** `src/locales/pt-BR.ts`, `src/locales/en.ts`, `src/locales/es.ts`

Adicionar após `platformHealth.loadError` (linha ~1471):

```typescript
// pt-BR.ts
'platformHealth.noEventsTooltip': 'Job executou recentemente, mas nenhum item foi processado. Isso é normal se não houver filiações/trials para processar.',

// en.ts
'platformHealth.noEventsTooltip': 'Job ran recently, but no items were processed. This is normal if there are no memberships/trials to process.',

// es.ts
'platformHealth.noEventsTooltip': 'El job se ejecutó recientemente, pero no se procesaron elementos. Esto es normal si no hay afiliaciones/trials para procesar.',
```

---

### Tarefa 7: Modificar expire-trials e mark-pending-delete (Opcional)

Para completude, adicionar logs de execução também em:

**`supabase/functions/expire-trials/index.ts`** (após linha 93):
```typescript
await supabase.from("audit_logs").insert({
  event_type: "JOB_EXPIRE_TRIALS_RUN",
  tenant_id: null,
  metadata: { status: 'COMPLETED', processed: results.processed, errors: results.errors },
});
```

**`supabase/functions/mark-pending-delete/index.ts`** (após linha 93):
```typescript
await supabase.from("audit_logs").insert({
  event_type: "JOB_PENDING_DELETE_RUN",
  tenant_id: null,
  metadata: { status: 'COMPLETED', processed: results.processed, errors: results.errors },
});
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/_shared/audit-logger.ts` | **MODIFICAR** | Adicionar constantes JOB_*_RUN |
| `supabase/functions/expire-memberships/index.ts` | **MODIFICAR** | Registrar evento de execução |
| `supabase/functions/cleanup-abandoned-memberships/index.ts` | **MODIFICAR** | Registrar evento de execução |
| `supabase/functions/check-trial-ending/index.ts` | **MODIFICAR** | Registrar evento de execução |
| `src/components/admin/PlatformHealthCard.tsx` | **MODIFICAR** | Buscar eventos JOB_*_RUN, diferenciar estados |
| `src/locales/pt-BR.ts` | **ADICIONAR** | Chave `noEventsTooltip` |
| `src/locales/en.ts` | **ADICIONAR** | Chave `noEventsTooltip` |
| `src/locales/es.ts` | **ADICIONAR** | Chave `noEventsTooltip` |

---

## Critérios de Aceitação

- [ ] Jobs registram evento `JOB_*_RUN` com `status: 'COMPLETED'` e contagens no metadata
- [ ] PlatformHealthCard busca eventos de execução (não depende apenas de ação)
- [ ] "Nunca executou" → Job nunca registrou `JOB_*_RUN`
- [ ] "OK" com tooltip "nenhum item processado" → Job executou mas `processed: 0`
- [ ] "OK" com tooltip padrão → Job executou e processou itens
- [ ] Contagens (expired, cleaned) continuam vindo de eventos de ação
- [ ] Build compila sem erros
- [ ] Traduções funcionam nos 3 idiomas

---

## Seção Técnica

### Fluxo de Eventos

```text
┌─────────────────────────────────────────────────────┐
│               CRON EXECUTA JOB                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1️⃣ JOB_EXPIRE_MEMBERSHIPS_RUN                     │
│     └─ status: 'COMPLETED', processed: 5           │
│                                                     │
│  2️⃣ MEMBERSHIP_EXPIRED (para cada filiação)       │
│     └─ membership_id, athlete_id, ...              │
│                                                     │
├─────────────────────────────────────────────────────┤
│           PLATFORM HEALTH CARD                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Query 1: JOB_*_RUN (últimos 7 dias)               │
│    → Determina lastRun + hadEvents                 │
│                                                     │
│  Query 2: Eventos de ação (últimos 7 dias)         │
│    → Determina contagens (expiredLast7d, etc.)     │
│                                                     │
│  Resultado:                                         │
│    ├─ lastRun = null → "Nunca executou"            │
│    ├─ lastRun < 24h, hadEvents = false → "OK" +    │
│    │                    tooltip "sem itens"        │
│    └─ lastRun < 24h, hadEvents = true → "OK"       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Estrutura do Evento JOB_*_RUN

```json
{
  "event_type": "JOB_EXPIRE_MEMBERSHIPS_RUN",
  "tenant_id": null,
  "metadata": {
    "job_run_id": "uuid",
    "status": "COMPLETED",
    "processed": 5,
    "expired": 4,
    "skipped": 1,
    "failed": 0,
    "emailsSent": 4,
    "automatic": true,
    "scheduled": true,
    "source": "expire-memberships-job"
  }
}
```

### Cron Jobs já Documentados

Os agendamentos SQL já estão em `docs/operacao-configuracoes.md`. Com as modificações das Edge Functions, os mesmos comandos cron continuam funcionando — a diferença é que agora cada execução registrará um evento de "run" no audit_logs.
