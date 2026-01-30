
# P0.1 REVISADO — Agendamento de CRON JOBS com x-cron-secret

## Resumo das Ressalvas Aplicadas

| Ressalva | Acao |
|----------|------|
| Substituir ANON_KEY por x-cron-secret | Modificar 8 Edge Functions + SQL |
| Usar current_setting('app.cron_secret') | Atualizado no SQL |
| Ajustar horario cleanup-expired-tenants | Movido de 03:00 para 03:15 UTC |

---

## 1. DIAGNOSTICO ATUAL

### Edge Functions que PRECISAM de modificacao

| Function | Tem x-cron-secret hoje | Acao |
|----------|------------------------|------|
| cleanup-tmp-documents | SIM | Nenhuma (ja implementado) |
| expire-trials | NAO | Adicionar validacao |
| mark-pending-delete | NAO | Adicionar validacao |
| pre-expiration-scheduler | NAO | Adicionar validacao |
| expire-memberships | NAO | Adicionar validacao |
| cleanup-expired-tenants | NAO | Adicionar validacao |
| cleanup-abandoned-memberships | NAO | Adicionar validacao |
| check-membership-renewal | NAO | Adicionar validacao |
| check-trial-ending | NAO | Adicionar validacao |

**Total**: 8 Edge Functions precisam ser modificadas.

---

## 2. PADRAO DE MODIFICACAO (IDENTICO PARA TODAS)

### 2.1 Alterar corsHeaders

```typescript
// DE:
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PARA:
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
```

### 2.2 Adicionar validacao no inicio do handler

```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================
  // CRON_SECRET VALIDATION (ADICIONAR)
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    console.error("[JOB-NAME] CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (requestSecret !== cronSecret) {
    console.error("[JOB-NAME] Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  // ========================================
  
  // ... resto do codigo existente
});
```

---

## 3. ARQUIVOS A MODIFICAR

| # | Arquivo | Linhas Afetadas |
|---|---------|-----------------|
| 1 | supabase/functions/expire-trials/index.ts | 18-21 (corsHeaders) + 53-56 (apos OPTIONS) |
| 2 | supabase/functions/mark-pending-delete/index.ts | corsHeaders + apos OPTIONS |
| 3 | supabase/functions/pre-expiration-scheduler/index.ts | 29-32 (corsHeaders) + apos OPTIONS |
| 4 | supabase/functions/expire-memberships/index.ts | 8-11 (corsHeaders) + apos OPTIONS (linha 52) |
| 5 | supabase/functions/cleanup-expired-tenants/index.ts | 27-30 (corsHeaders) + apos OPTIONS (linha 265) |
| 6 | supabase/functions/cleanup-abandoned-memberships/index.ts | 5-8 (corsHeaders) + apos OPTIONS (linha 30) |
| 7 | supabase/functions/check-membership-renewal/index.ts | 18-21 (corsHeaders) + apos OPTIONS (linha 28) |
| 8 | supabase/functions/check-trial-ending/index.ts | 18-21 (corsHeaders) + apos OPTIONS (linha 30) |

---

## 4. SQL FINAL PARA PRODUCAO

### 4.1 Pre-requisito: Configurar app.cron_secret

```sql
-- EXECUTAR PRIMEIRO: Definir o secret no banco
-- Substitua 'SEU_CRON_SECRET_AQUI' pelo valor real do secret CRON_SECRET
ALTER DATABASE postgres SET app.cron_secret = 'SEU_CRON_SECRET_AQUI';
```

### 4.2 Habilitar extensoes (se necessario)

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 4.3 Agendar Jobs (SEM hardcode de secrets)

```sql
-- ============================================================
-- TATAME PRO - AGENDAMENTO DE CRON JOBS (SEGURO)
-- Usando x-cron-secret via current_setting
-- ============================================================

-- JOB 1: expire-trials-daily (00:05 UTC)
SELECT cron.schedule(
  'expire-trials-daily',
  '5 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-trials',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 2: mark-pending-delete-daily (00:10 UTC)
SELECT cron.schedule(
  'mark-pending-delete-daily',
  '10 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/mark-pending-delete',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 3: pre-expiration-scheduler-daily (02:30 UTC)
SELECT cron.schedule(
  'pre-expiration-scheduler-daily',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/pre-expiration-scheduler',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 4: expire-memberships-daily (03:00 UTC)
SELECT cron.schedule(
  'expire-memberships-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-memberships',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 5: cleanup-expired-tenants-daily (03:15 UTC) ← AJUSTADO
SELECT cron.schedule(
  'cleanup-expired-tenants-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-expired-tenants',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 6: cleanup-tmp-documents-daily (03:30 UTC)
SELECT cron.schedule(
  'cleanup-tmp-documents-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-tmp-documents',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 7: cleanup-abandoned-memberships-daily (04:00 UTC)
SELECT cron.schedule(
  'cleanup-abandoned-memberships-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-abandoned-memberships',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 8: check-membership-renewal-daily (09:00 UTC)
SELECT cron.schedule(
  'check-membership-renewal-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/check-membership-renewal',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- JOB 9: check-trial-ending-daily (10:00 UTC)
SELECT cron.schedule(
  'check-trial-ending-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/check-trial-ending',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body:='{"scheduled": true}'::jsonb
  );
  $$
);

-- ============================================================
-- FIM DO AGENDAMENTO
-- ============================================================
```

---

## 5. CRONOGRAMA DE EXECUCAO

| Fase | Acao | Responsavel |
|------|------|-------------|
| 1 | Modificar 8 Edge Functions (adicionar x-cron-secret) | Lovable |
| 2 | Deploy automatico das Edge Functions | Lovable (automatico) |
| 3 | Configurar app.cron_secret no banco | Usuario (SQL Editor) |
| 4 | Habilitar extensoes pg_cron e pg_net | Usuario (SQL Editor) |
| 5 | Agendar os 9 jobs | Usuario (SQL Editor) |
| 6 | Validar execucao apos 24-48h | Usuario |

---

## 6. HORARIOS FINAIS (UTC)

| Horario | Job | Justificativa |
|---------|-----|---------------|
| 00:05 | expire-trials-daily | Primeiro do dia, marca trials expirados |
| 00:10 | mark-pending-delete-daily | Sequencia apos expire-trials |
| 02:30 | pre-expiration-scheduler-daily | Bem antes de expire-memberships |
| 03:00 | expire-memberships-daily | Expira filiacoes vencidas |
| 03:15 | cleanup-expired-tenants-daily | **AJUSTADO** - 15min apos expire-memberships |
| 03:30 | cleanup-tmp-documents-daily | Limpeza de arquivos |
| 04:00 | cleanup-abandoned-memberships-daily | Limpeza de drafts |
| 09:00 | check-membership-renewal-daily | Lembretes de renovacao |
| 10:00 | check-trial-ending-daily | Alertas de fim de trial |

---

## 7. CHECKLIST DE VALIDACAO

### Apos modificar Edge Functions

```bash
# Testar chamada SEM x-cron-secret (deve retornar 403)
curl -X POST https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-trials \
  -H "Content-Type: application/json" \
  -d '{"scheduled": true}'
# Esperado: {"error":"Forbidden"}

# Testar chamada COM x-cron-secret (deve funcionar)
curl -X POST https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-trials \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: SEU_CRON_SECRET" \
  -d '{"scheduled": true}'
# Esperado: {"success":true,...}
```

### Apos agendar jobs

```sql
-- Verificar jobs agendados
SELECT jobid, jobname, schedule, active 
FROM cron.job 
ORDER BY jobname;
-- Esperado: 9 jobs com active = true

-- Verificar execucoes (apos 24-48h)
SELECT j.jobname, d.status, d.start_time, d.return_message
FROM cron.job j
LEFT JOIN cron.job_run_details d ON j.jobid = d.jobid
ORDER BY d.start_time DESC
LIMIT 20;
```

---

## 8. CRITERIO DE CONCLUSAO

Este P0 sera considerado DONE quando:

- [ ] 8 Edge Functions modificadas com x-cron-secret
- [ ] Deploy automatico concluido
- [ ] app.cron_secret configurado no banco
- [ ] 9 jobs agendados e visiveis em cron.job
- [ ] Primeira execucao com status "succeeded" em cron.job_run_details
- [ ] Nenhum hardcode de secret no SQL

---

## 9. PROXIMOS PASSOS

**Aguardando aprovacao para:**
1. Modificar as 8 Edge Functions (adicionar validacao x-cron-secret)
2. Fornecer SQL final para usuario executar manualmente

**Deseja que eu prossiga com a implementacao das modificacoes nas Edge Functions?**
