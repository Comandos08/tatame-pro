

# Plano: P3.YOUTH.AUTO.TRANSITION (SAFE GOLD)

## Resumo do Diagnóstico

### Estado Atual do Banco de Dados

| Tabela | Campos Relevantes | Status |
|--------|-------------------|--------|
| **athletes** | `id`, `tenant_id`, `birth_date`, `full_name`, `email` | ✅ Confirmado - `birth_date` existe |
| **guardian_links** | `id`, `tenant_id`, `guardian_id`, `athlete_id`, `relationship`, `is_primary` | ✅ Confirmado - sem `created_at` de expiração |
| **memberships** | `id`, `athlete_id`, `status`, `applicant_data` (JSONB), `tenant_id` | ✅ Confirmado - `applicant_data.is_minor` existe |

### Descobertas Importantes

1. **NÃO existe campo `is_minor` na tabela `athletes`** - a única fonte de verdade sobre menoridade é:
   - Cálculo a partir de `athletes.birth_date`
   - Flag `applicant_data.is_minor` na membership

2. **Padrão de Jobs Existente:**
   - `expire-memberships`: usa `CRON_SECRET` header, `createAuditLog`, `jobRunId`, race protection
   - `expire-trials`: padrão similar, mais simples
   - Jobs registram `JOB_*_RUN` com `STARTED` e `COMPLETED`

3. **Idempotência:** O sistema usa flag em coluna (`email_sent_for_status`) para emails. Para transição, usaremos `applicant_data.is_minor = false` como flag de idempotência.

---

## Tarefas de Implementação

### Tarefa 1: Criar Edge Function `transition-youth-to-adult`

**Arquivo:** `supabase/functions/transition-youth-to-adult/index.ts`

```typescript
/**
 * transition-youth-to-adult - Daily job to transition minors who turned 18
 * 
 * Executes daily at 03:15 UTC via pg_cron
 * 
 * Flow:
 * 1. Find athletes with birth_date indicating age >= 18
 * 2. Filter for those with guardian_links (indicating youth membership)
 * 3. Filter for active memberships with applicant_data.is_minor = true
 * 4. Update membership.applicant_data.is_minor = false (remove guardian data)
 * 5. Log YOUTH_AUTO_TRANSITION to audit_logs
 * 
 * SAFE GOLD Principles:
 * - NO new membership created
 * - NO new athlete created
 * - NO guardian/guardian_links deleted
 * - NO financial history altered
 * - ONLY metadata updates
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[YOUTH-TRANSITION] ${step}${detailsStr}`);
};

/**
 * Calculate precise age from birth date
 * Returns true if person is 18 or older
 */
function isAdult(birthDate: string): boolean {
  const birth = new Date(birthDate);
  const today = new Date();
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  
  // Adjust if birthday hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }
  
  return age >= 18;
}

interface TransitionResult {
  athleteId: string;
  membershipId: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    console.error("[YOUTH-TRANSITION] CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (requestSecret !== cronSecret) {
    console.error("[YOUTH-TRANSITION] Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const jobRunId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    logStep("Starting youth-to-adult transition job", { jobRunId });

    // Log job execution start
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_YOUTH_TRANSITION_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'STARTED',
        automatic: true,
        scheduled: true,
        source: 'transition-youth-to-adult-job',
      },
    });

    // ========================================================================
    // 1️⃣ FIND ATHLETES WITH GUARDIAN_LINKS (indicating youth membership)
    // ========================================================================
    const { data: athletesWithGuardians, error: fetchError } = await supabase
      .from("guardian_links")
      .select(`
        athlete_id,
        guardian_id,
        tenant_id,
        athlete:athletes!inner(
          id,
          birth_date,
          full_name,
          tenant_id
        )
      `);

    if (fetchError) {
      throw new Error(`Failed to fetch guardian_links: ${fetchError.message}`);
    }

    logStep("Found athletes with guardians", { count: athletesWithGuardians?.length || 0 });

    if (!athletesWithGuardians || athletesWithGuardians.length === 0) {
      // Log job completion even with 0 processed
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.JOB_YOUTH_TRANSITION_RUN,
        tenant_id: null,
        metadata: {
          job_run_id: jobRunId,
          status: 'COMPLETED',
          processed: 0,
          transitioned: 0,
          skipped: 0,
          failed: 0,
          automatic: true,
          scheduled: true,
          source: 'transition-youth-to-adult-job',
        },
      });

      return new Response(
        JSON.stringify({
          job: "transition-youth-to-adult",
          jobRunId,
          success: true,
          processed: 0,
          transitioned: 0,
          skipped: 0,
          failed: 0,
          message: "No athletes with guardians found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ========================================================================
    // 2️⃣ FILTER FOR ADULTS (age >= 18) USING PRECISE CALCULATION
    // ========================================================================
    const adultsWithGuardians = athletesWithGuardians.filter(link => {
      const athlete = link.athlete as unknown as { id: string; birth_date: string; full_name: string; tenant_id: string };
      return athlete && isAdult(athlete.birth_date);
    });

    logStep("Athletes now adults", { count: adultsWithGuardians.length });

    const results: TransitionResult[] = [];

    for (const guardianLink of adultsWithGuardians) {
      const athlete = guardianLink.athlete as unknown as { 
        id: string; 
        birth_date: string; 
        full_name: string; 
        tenant_id: string 
      };

      // ====================================================================
      // 3️⃣ FIND ACTIVE MEMBERSHIP WITH is_minor = true
      // ====================================================================
      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select("id, athlete_id, status, applicant_data, tenant_id")
        .eq("athlete_id", athlete.id)
        .in("status", ["ACTIVE", "APPROVED"])
        .limit(1);

      if (membershipError) {
        logStep("Error fetching membership", { athleteId: athlete.id, error: membershipError.message });
        results.push({
          athleteId: athlete.id,
          membershipId: "",
          success: false,
          error: membershipError.message,
        });
        continue;
      }

      if (!memberships || memberships.length === 0) {
        logStep("Skip - no active membership", { athleteId: athlete.id });
        results.push({
          athleteId: athlete.id,
          membershipId: "",
          success: true,
          skipped: true,
          skipReason: "no_active_membership",
        });
        continue;
      }

      const membership = memberships[0];
      const applicantData = membership.applicant_data as Record<string, unknown> | null;

      // ====================================================================
      // 4️⃣ IDEMPOTENCY CHECK - Skip if already transitioned
      // ====================================================================
      if (applicantData?.is_minor !== true) {
        logStep("Skip - already transitioned or not a minor", { 
          athleteId: athlete.id, 
          membershipId: membership.id,
          is_minor: applicantData?.is_minor 
        });
        results.push({
          athleteId: athlete.id,
          membershipId: membership.id,
          success: true,
          skipped: true,
          skipReason: "already_transitioned",
        });
        continue;
      }

      // ====================================================================
      // 5️⃣ UPDATE MEMBERSHIP applicant_data (SAFE GOLD)
      // ====================================================================
      try {
        // Remove guardian from applicant_data, set is_minor = false
        // PRESERVE all other data including historical guardian reference
        const updatedApplicantData = {
          ...applicantData,
          is_minor: false,
          // Keep guardian data as historical reference (don't delete)
          // guardian_transitioned_at marks when transition happened
          youth_transition: {
            transitioned_at: new Date().toISOString(),
            previous_guardian: applicantData.guardian || null,
            job_run_id: jobRunId,
          },
        };

        // Remove the active guardian reference (but keep historical)
        delete (updatedApplicantData as Record<string, unknown>).guardian;

        const { error: updateError } = await supabase
          .from("memberships")
          .update({ 
            applicant_data: updatedApplicantData,
            updated_at: new Date().toISOString()
          })
          .eq("id", membership.id)
          .eq("status", membership.status); // Optimistic lock

        if (updateError) {
          throw updateError;
        }

        logStep("Membership transitioned", { 
          athleteId: athlete.id, 
          membershipId: membership.id 
        });

        // ====================================================================
        // 6️⃣ AUDIT LOG - YOUTH_AUTO_TRANSITION
        // ====================================================================
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.YOUTH_AUTO_TRANSITION,
          tenant_id: membership.tenant_id,
          metadata: {
            athlete_id: athlete.id,
            membership_id: membership.id,
            athlete_name: athlete.full_name,
            birth_date: athlete.birth_date,
            previous_is_minor: true,
            new_is_minor: false,
            transitioned_at: new Date().toISOString(),
            guardian_preserved: true,
            guardian_link_preserved: true,
            automatic: true,
            scheduled: true,
            source: "transition-youth-to-adult-job",
            job_run_id: jobRunId,
          },
        });

        results.push({
          athleteId: athlete.id,
          membershipId: membership.id,
          success: true,
        });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        logStep("Error transitioning", { 
          athleteId: athlete.id, 
          membershipId: membership.id,
          error: errorMessage 
        });
        results.push({
          athleteId: athlete.id,
          membershipId: membership.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    // ========================================================================
    // 7️⃣ RESPONSE — STANDARDIZED JOB FORMAT
    // ========================================================================
    const processed = results.length;
    const transitioned = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    logStep("Job completed", { jobRunId, processed, transitioned, skipped, failed });

    // Log job execution completion
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_YOUTH_TRANSITION_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'COMPLETED',
        processed,
        transitioned,
        skipped,
        failed,
        automatic: true,
        scheduled: true,
        source: 'transition-youth-to-adult-job',
      },
    });

    return new Response(
      JSON.stringify({
        job: "transition-youth-to-adult",
        jobRunId,
        success: true,
        processed,
        transitioned,
        skipped,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Job failed", { jobRunId, error: errorMessage });
    return new Response(
      JSON.stringify({
        job: "transition-youth-to-adult",
        jobRunId,
        success: false,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
```

---

### Tarefa 2: Adicionar Eventos de Auditoria no audit-logger.ts

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar após linha 75:

```typescript
// Youth transition events
YOUTH_AUTO_TRANSITION: 'YOUTH_AUTO_TRANSITION',
JOB_YOUTH_TRANSITION_RUN: 'JOB_YOUTH_TRANSITION_RUN',
```

---

### Tarefa 3: Registrar Edge Function no config.toml

**Arquivo:** `supabase/config.toml`

Adicionar ao final do arquivo:

```toml
[functions.transition-youth-to-adult]
verify_jwt = false
```

---

### Tarefa 4: Atualizar PlatformHealthCard para Monitorar Novo Job

**Arquivo:** `src/components/admin/PlatformHealthCard.tsx`

**4.1 Adicionar ao interface PlatformMetrics (linhas 17-41):**

```typescript
interface PlatformMetrics {
  // ... existing fields
  
  // Youth transition job
  lastYouthTransitionRun: string | null;
  youthTransitionHadEvents: boolean;
  transitionedLast7d: number;
}
```

**4.2 Adicionar ao array de event_types na query (linha 65-70):**

```typescript
.in('event_type', [
  'JOB_EXPIRE_MEMBERSHIPS_RUN',
  'JOB_CLEANUP_ABANDONED_RUN',
  'JOB_CHECK_TRIALS_RUN',
  'JOB_YOUTH_TRANSITION_RUN', // NEW
])
```

**4.3 Adicionar ao array de action events (linha 77-82):**

```typescript
.in('event_type', [
  'MEMBERSHIP_EXPIRED', 
  'MEMBERSHIP_ABANDONED_CLEANUP',
  'TRIAL_END_NOTIFICATION_SENT',
  'TENANT_PAYMENT_FAILED',
  'YOUTH_AUTO_TRANSITION', // NEW
])
```

**4.4 Adicionar processamento do novo job (após linha 125):**

```typescript
case 'JOB_YOUTH_TRANSITION_RUN':
  if (!lastYouthTransitionRun && meta?.status === 'COMPLETED') {
    lastYouthTransitionRun = log.created_at;
    youthTransitionHadEvents = (meta?.transitioned || 0) > 0;
  }
  break;
```

**4.5 Adicionar contagem de transições (após linha 150):**

```typescript
case 'YOUTH_AUTO_TRANSITION':
  transitionedLast7d++;
  break;
```

**4.6 Adicionar card de visualização no grid de jobs (após linha 362):**

```typescript
<div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
  <div>
    <p className="text-xs text-muted-foreground">{t('platformHealth.youthTransition')}</p>
    <p className="text-sm font-medium">{formatTime(metrics.lastYouthTransitionRun)}</p>
  </div>
  <Badge 
    variant={getJobStatus(metrics.lastYouthTransitionRun, metrics.youthTransitionHadEvents).color} 
    className="text-xs cursor-help"
    title={getJobStatus(metrics.lastYouthTransitionRun, metrics.youthTransitionHadEvents).tooltip}
  >
    {getJobStatus(metrics.lastYouthTransitionRun, metrics.youthTransitionHadEvents).label}
  </Badge>
</div>
```

---

### Tarefa 5: Adicionar Chaves de Tradução

**Arquivos:** `src/locales/pt-BR.ts`, `en.ts`, `es.ts`

```typescript
// pt-BR.ts
'platformHealth.youthTransition': 'Transição Youth→Adult',

// en.ts
'platformHealth.youthTransition': 'Youth→Adult Transition',

// es.ts
'platformHealth.youthTransition': 'Transición Youth→Adult',
```

---

### Tarefa 6: Documentar Agendamento do Cron Job

**Arquivo:** `docs/operacao-configuracoes.md`

Adicionar na seção de Jobs obrigatórios (após linha 148):

```markdown
| `transition-youth-to-adult-daily` | Transiciona menores que completaram 18 anos | 03:15 | 🟡 Média |
```

Adicionar comando SQL de agendamento:

```markdown
#### transition-youth-to-adult (diário às 03:15 UTC)
Transiciona automaticamente atletas que completaram 18 anos de Youth para Adult membership.

**⚠️ IMPORTANTE:** Este job usa autenticação via header `x-cron-secret`.  
Substitua `SEU_CRON_SECRET` pelo valor configurado no secret `CRON_SECRET`.

\`\`\`sql
SELECT cron.schedule(
  'transition-youth-to-adult-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/transition-youth-to-adult',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.cron_secret') || '"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
\`\`\`

**Regras SAFE GOLD:**
- ❌ NÃO cria nova membership
- ❌ NÃO cria novo athlete
- ❌ NÃO deleta guardian ou guardian_links
- ✅ Apenas atualiza `applicant_data.is_minor = false`
- ✅ Preserva histórico do guardian em `applicant_data.youth_transition`
```

---

### Tarefa 7: Atualizar BUSINESS-FLOWS.md

**Arquivo:** `docs/BUSINESS-FLOWS.md`

Adicionar seção após o fluxo de filiação juvenil:

```markdown
### Transição Automática Youth → Adult

Quando um atleta com Youth Membership completa 18 anos:

                         +------------------------------------------+
                         | CRON: 03:15 UTC diariamente              |
                         | transition-youth-to-adult                |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | 1. Busca atletas com guardian_links      |
                         | 2. Filtra por age >= 18 (birth_date)     |
                         | 3. Filtra por is_minor = true            |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | Para cada atleta elegível:               |
                         |                                          |
                         | ✅ applicant_data.is_minor = false       |
                         | ✅ Guardian movido para youth_transition |
                         | ✅ Membership PERMANECE a mesma          |
                         | ✅ Athlete PERMANECE o mesmo             |
                         | ✅ guardian_links PRESERVADO             |
                         +------------------------------------------+
                                          |
                                          v
                         +------------------------------------------+
                         | Audit: YOUTH_AUTO_TRANSITION             |
                         | metadata: athlete_id, membership_id,     |
                         |          previous_is_minor, birth_date   |
                         +------------------------------------------+

**Princípios SAFE GOLD:**
- Nenhum dado é deletado
- Nenhuma nova entidade é criada
- Histórico financeiro intacto
- Guardian links preservados para auditoria legal
- 100% idempotente e auditável
```

---

## Arquivos Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/transition-youth-to-adult/index.ts` | **CRIAR** | Edge Function do job |
| `supabase/functions/_shared/audit-logger.ts` | **MODIFICAR** | Adicionar 2 novos eventos |
| `supabase/config.toml` | **MODIFICAR** | Registrar nova função |
| `src/components/admin/PlatformHealthCard.tsx` | **MODIFICAR** | Monitorar novo job |
| `src/locales/pt-BR.ts` | **ADICIONAR** | 1 nova chave |
| `src/locales/en.ts` | **ADICIONAR** | 1 nova chave |
| `src/locales/es.ts` | **ADICIONAR** | 1 nova chave |
| `docs/operacao-configuracoes.md` | **ADICIONAR** | Documentar cron job |
| `docs/BUSINESS-FLOWS.md` | **ADICIONAR** | Documentar fluxo |

---

## Critérios de Aceitação

- [ ] Edge Function criada e deployada
- [ ] Job registra `JOB_YOUTH_TRANSITION_RUN` (STARTED/COMPLETED)
- [ ] Cada transição registra `YOUTH_AUTO_TRANSITION` com metadata completa
- [ ] Nenhuma nova membership criada
- [ ] Nenhum athlete duplicado
- [ ] `applicant_data.is_minor = false` após transição
- [ ] Guardian preservado em `applicant_data.youth_transition.previous_guardian`
- [ ] `guardian_links` NÃO deletado
- [ ] Job idempotente (reexecução não duplica)
- [ ] PlatformHealthCard monitora o job
- [ ] Documentação atualizada
- [ ] SAFE GOLD preservado

---

## Seção Técnica

### Cálculo Preciso de Idade

```typescript
function isAdult(birthDate: string): boolean {
  const birth = new Date(birthDate);
  const today = new Date();
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }
  
  return age >= 18;
}
```

### Estrutura do applicant_data Após Transição

```json
{
  "full_name": "João Silva",
  "birth_date": "2006-02-07",
  "is_minor": false,
  "youth_transition": {
    "transitioned_at": "2024-02-07T03:15:00.000Z",
    "previous_guardian": {
      "full_name": "Maria Silva",
      "national_id": "123.456.789-00",
      "email": "responsavel@email.com",
      "relationship": "PARENT"
    },
    "job_run_id": "uuid-do-job"
  }
}
```

### Idempotência

O job verifica `applicant_data.is_minor !== true` antes de processar:
- Se `is_minor` já for `false` → Skip (already_transitioned)
- Se `is_minor` não existir → Skip (not a minor)
- Se `is_minor = true` → Processa transição

### Horário do Cron

`03:15 UTC` escolhido para:
- Executar APÓS `expire-memberships` (03:00 UTC)
- Baixo tráfego de usuários
- Consistência com outros jobs de manutenção

