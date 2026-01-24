# TATAME - Configurações de Operação

Este documento descreve as configurações externas necessárias para o sistema TATAME funcionar em produção.

---

## ⚠️ PRÉ-REQUISITOS OBRIGATÓRIOS PARA TESTES QUENTES

Antes de iniciar testes quentes ou ir para produção, **OBRIGATORIAMENTE** verifique:

1. ✅ **Leaked Password Protection** ativada (Seção 1)
2. ✅ **Cron Jobs agendados** e funcionando (Seção 4)

**Testes quentes/produção NÃO devem rodar sem esses dois itens verificados.**

---

## 1. Supabase Auth - Leaked Password Protection

### O que é
Proteção contra senhas vazadas em data breaches conhecidos. Impede usuários de usar senhas comprometidas, aumentando significativamente a segurança das contas.

### 🔴 CRÍTICO: Como ativar

**Passo a passo no Supabase Dashboard:**

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione o projeto TATAME
3. No menu lateral, vá para **Authentication** → **Providers**
4. Clique na aba **Email**
5. Role até encontrar **"Leaked password protection"**
6. **Ative o toggle** para habilitar
7. Clique em **Save**

### Configuração recomendada para TATAME v1.0
- **Leaked password protection**: ✅ Ativado
- **Minimum password length**: 8 caracteres
- **Password requirements**: Pelo menos 1 letra e 1 número (opcional, mas recomendado)

### Verificação por ambiente

| Ambiente | URL do Dashboard | Como verificar |
|----------|------------------|----------------|
| Staging | `supabase.com/dashboard/project/[staging-id]` | Auth → Providers → Email → Leaked password protection = ON |
| Produção | `supabase.com/dashboard/project/kotxhtveuegrywzyvdnl` | Auth → Providers → Email → Leaked password protection = ON |

### Teste manual (opcional)
Para verificar se a proteção está funcionando:
1. Tente criar uma conta com senha comum: `password123` ou `123456789`
2. O sistema deve **recusar** a senha com mensagem sobre senha comprometida
3. Se aceitar, a proteção NÃO está ativa!

### Checklist de verificação
- [ ] Acessei Authentication → Providers → Email
- [ ] Confirmei que "Leaked password protection" está **ON**
- [ ] (Opcional) Testei com senha vazada conhecida e foi recusada

---

## 2. Cloudflare Turnstile (CAPTCHA)

### Para que serve
Proteção anti-spam nos formulários públicos de filiação (AdultMembershipForm, YouthMembershipForm).

### Variáveis de ambiente necessárias
| Variável | Onde configurar | Descrição |
|----------|-----------------|-----------|
| `TURNSTILE_SECRET_KEY` | Supabase Edge Function Secrets | Chave secreta do Turnstile |

### Como obter
1. Crie uma conta no [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá para **Turnstile** → **Add Site**
3. Configure o domínio (ex: `tatame-pro.lovable.app`)
4. Copie a **Secret Key** e adicione no Supabase Secrets

### Implementação no Frontend (pendente)
Será necessário adicionar o widget Turnstile nos formulários:
```tsx
<Turnstile siteKey="SITE_KEY" onSuccess={(token) => setCaptchaToken(token)} />
```

---

## 3. Upstash Redis (Rate Limiting)

### Para que serve
Rate limiting em edge functions sensíveis para proteção contra brute force e spam.

### Variáveis de ambiente necessárias
| Variável | Onde configurar | Descrição |
|----------|-----------------|-----------|
| `UPSTASH_REDIS_REST_URL` | Supabase Edge Function Secrets | URL da REST API do Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Supabase Edge Function Secrets | Token de autenticação |

### Como obter
1. Crie conta no [Upstash Console](https://console.upstash.com/)
2. Crie um novo database Redis
3. Copie as credenciais da seção **REST API**

### Edge Functions protegidas
| Função | Limite por IP | Limite por identificador |
|--------|---------------|-------------------------|
| `request-password-reset` | 20/hora | 5/hora por email |
| `reset-password` | 10/hora | 5/hora por token |
| `create-membership-checkout` | 10/hora | 3/10min por membership |

---

## 4. Cron Jobs (Agendamento de Tarefas) 🔴 CRÍTICO

### Por que é crítico
Os cron jobs são responsáveis por:
- Expirar filiações vencidas automaticamente
- Limpar filiações abandonadas
- Enviar lembretes de renovação
- Notificar sobre trials expirando

**Sem os cron jobs configurados, essas tarefas NÃO acontecem automaticamente!**

### Pré-requisito: Extensões do PostgreSQL
O Supabase precisa ter as extensões `pg_cron` e `pg_net` habilitadas:

```sql
-- Execute no SQL Editor do Supabase (Database → SQL Editor)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

**Como verificar se estão ativas:**
```sql
SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
```
Deve retornar 2 linhas. Se não retornar, execute os CREATE EXTENSION acima.

---

### Jobs obrigatórios para v1.0

| Job | Função | Horário (UTC) | Criticidade |
|-----|--------|---------------|-------------|
| `expire-memberships-daily` | Marca filiações vencidas como EXPIRED | 03:00 | 🔴 Alta |
| `cleanup-tmp-documents-daily` | Remove arquivos tmp/ > 7 dias | 03:30 | 🟡 Média |
| `cleanup-abandoned-memberships-daily` | Remove filiações DRAFT > 24h | 04:00 | 🟡 Média |
| `check-membership-renewal-daily` | Envia lembretes de renovação | 09:00 | 🟡 Média |
| `check-trial-ending-daily` | Notifica tenants sobre trial | 10:00 | 🟡 Média |

---

### Comandos SQL para agendar cada job

**⚠️ IMPORTANTE:** Substitua `SEU_ANON_KEY` pela anon key real do projeto:
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdHhodHZldWVncnl3enl2ZG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIzMzgsImV4cCI6MjA4NDA2ODMzOH0.xYk_yN_H35ldnzrtnkqNRcqqPQSB54rR0uvi_RHihg0`

#### expire-memberships (diário às 03:00 UTC)
Marca filiações vencidas como EXPIRED.

```sql
SELECT cron.schedule(
  'expire-memberships-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-memberships',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdHhodHZldWVncnl3enl2ZG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIzMzgsImV4cCI6MjA4NDA2ODMzOH0.xYk_yN_H35ldnzrtnkqNRcqqPQSB54rR0uvi_RHihg0"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
```

#### cleanup-abandoned-memberships (diário às 04:00 UTC)
Remove filiações abandonadas (DRAFT > 24h sem pagamento).

```sql
SELECT cron.schedule(
  'cleanup-abandoned-memberships-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-abandoned-memberships',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdHhodHZldWVncnl3enl2ZG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIzMzgsImV4cCI6MjA4NDA2ODMzOH0.xYk_yN_H35ldnzrtnkqNRcqqPQSB54rR0uvi_RHihg0"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
```

#### check-membership-renewal (diário às 09:00 UTC)
Envia lembretes de renovação 7 dias antes do vencimento.

```sql
SELECT cron.schedule(
  'check-membership-renewal-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/check-membership-renewal',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdHhodHZldWVncnl3enl2ZG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIzMzgsImV4cCI6MjA4NDA2ODMzOH0.xYk_yN_H35ldnzrtnkqNRcqqPQSB54rR0uvi_RHihg0"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
```

#### check-trial-ending (diário às 10:00 UTC)
Notifica tenants sobre trial expirando.

```sql
SELECT cron.schedule(
  'check-trial-ending-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/check-trial-ending',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdHhodHZldWVncnl3enl2ZG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIzMzgsImV4cCI6MjA4NDA2ODMzOH0.xYk_yN_H35ldnzrtnkqNRcqqPQSB54rR0uvi_RHihg0"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
```

#### cleanup-tmp-documents (diário às 03:30 UTC)
Remove arquivos temporários órfãos do bucket `documents/tmp/` após 7 dias.

**⚠️ IMPORTANTE:** Este job usa autenticação via header `x-cron-secret`.  
Substitua `SEU_CRON_SECRET` pelo valor configurado no secret `CRON_SECRET`.

```sql
SELECT cron.schedule(
  'cleanup-tmp-documents-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-tmp-documents',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "SEU_CRON_SECRET"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
```

**Regras de proteção:**
- Arquivos com < 7 dias: **NÃO deletados**
- Arquivos associados a memberships PENDING_REVIEW, APPROVED ou ACTIVE: **NÃO deletados**
- Arquivos órfãos ou de memberships CANCELLED/REJECTED: **deletados**

---

### 🔍 Verificação de Jobs

#### 1. Ver todos os jobs agendados
```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
```

**Resultado esperado:** 4 jobs com `active = true`

#### 2. Ver execuções recentes
```sql
SELECT 
  jobid,
  runid,
  job_pid,
  status,
  start_time,
  end_time
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

**O que verificar:**
- `status = 'succeeded'` para execuções bem-sucedidas
- `start_time` recente (últimas 24-48h)

#### 3. Verificar via audit_logs
```sql
SELECT event_type, created_at, metadata
FROM audit_logs 
WHERE event_type IN ('MEMBERSHIP_EXPIRED', 'MEMBERSHIP_ABANDONED_CLEANUP', 'TRIAL_END_NOTIFICATION_SENT')
ORDER BY created_at DESC 
LIMIT 10;
```

#### 4. Verificar no PlatformHealthCard (Superadmin)
No Admin Global Dashboard, o card "Saúde da Plataforma" mostra:
- Última execução de cada job
- Status: OK (< 24h), Atrasado (24-48h), Erro (> 48h)
- Tooltip com diagnóstico

---

### Remover/Reagendar um job

```sql
-- Remover job existente
SELECT cron.unschedule('nome-do-job');

-- Exemplo: reagendar expire-memberships para 02:00 UTC
SELECT cron.unschedule('expire-memberships-daily');
-- Depois execute o schedule novamente com novo horário
```

---

### Checklist de verificação (cron jobs)
- [ ] Extensões `pg_cron` e `pg_net` estão ativas
- [ ] `SELECT * FROM cron.job` retorna 4 jobs
- [ ] Todos os jobs mostram `active = true`
- [ ] `cron.job_run_details` mostra execuções recentes com `status = 'succeeded'`
- [ ] PlatformHealthCard no Admin Global mostra status "OK" ou "Operacional"

---

## 5. Stripe (Pagamentos)

### Variáveis já configuradas
| Variável | Status |
|----------|--------|
| `STRIPE_SECRET_KEY` | ✅ Configurado |
| `STRIPE_WEBHOOK_SECRET` | ✅ Configurado |

### Webhook URL
Configure no Stripe Dashboard:
```
https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/stripe-webhook
```

### Eventos a escutar
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## 6. Resend (E-mails)

### Variáveis já configuradas
| Variável | Status |
|----------|--------|
| `RESEND_API_KEY` | ✅ Configurado |

### Domínio de envio
Atualmente: `noreply@tatame.pro`

---

## Checklist de Produção

### 1. Autenticação (Supabase Auth)
- [ ] Habilitar **Leaked Password Protection** em Authentication → Providers → Email → "Enable Leaked password protection"
- [ ] Configurar domínios permitidos (se aplicável) em Authentication → URL Configuration
- [ ] Verificar política de senhas (mínimo 8 caracteres recomendado)
- [ ] Habilitar auto-confirm de emails (para desenvolvimento) ou configurar SMTP (produção)

### 2. CAPTCHA (Cloudflare Turnstile)
- [ ] Criar site no [Cloudflare Turnstile](https://dash.cloudflare.com/) → Turnstile → Add Site
- [ ] Adicionar `TURNSTILE_SECRET_KEY` nos secrets do Supabase (Edge Functions → Secrets)
- [ ] Configurar domínio correto no Turnstile (ex: tatame-pro.lovable.app)

### 3. Rate Limiting (Upstash Redis)
- [ ] Criar database no [Upstash Console](https://console.upstash.com/)
- [ ] Adicionar `UPSTASH_REDIS_REST_URL` nos secrets
- [ ] Adicionar `UPSTASH_REDIS_REST_TOKEN` nos secrets
- [ ] Testar rate limiting com múltiplas requisições

### 4. Cron Jobs (Agendamento)
- [ ] Habilitar extensões `pg_cron` e `pg_net` no Supabase (Database → Extensions)
- [ ] Executar SQL de agendamento para:
  - `expire-memberships` (03:00 UTC)
  - `cleanup-abandoned-memberships` (04:00 UTC)
  - `check-membership-renewal` (09:00 UTC)
  - `check-trial-ending` (10:00 UTC)
- [ ] Verificar jobs com: `SELECT * FROM cron.job;`

### 5. Pagamentos (Stripe)
- [ ] Configurar webhook URL: `https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/stripe-webhook`
- [ ] Verificar `STRIPE_SECRET_KEY` nos secrets
- [ ] Verificar `STRIPE_WEBHOOK_SECRET` nos secrets
- [ ] Habilitar eventos: checkout.session.completed, customer.subscription.*, invoice.*

### 6. E-mails (Resend)
- [ ] Verificar `RESEND_API_KEY` nos secrets
- [ ] Configurar domínio de envio (DNS) no Resend Dashboard
- [ ] Testar envio de email de teste

---

## Exportação de Dados (CSV)

O sistema permite exportar dados em formato CSV para planilhas e relatórios.

### Telas com Exportação

| Tela | Rota | Colunas Exportadas |
|------|------|-------------------|
| Atletas | `/{tenant}/app/athletes` | Nome, E-mail, Data Nascimento, Academia, Status Filiação, Período |
| Aprovações | `/{tenant}/app/approvals` | Atleta, E-mail, Status, Pagamento, Datas, Academia, Valor |
| Graduações | `/{tenant}/app/athletes/{id}/gradings` | Atleta, Nível/Faixa, Esporte, Data, Academia, Professor, Diploma Emitido |

### Comportamento
- O botão "Exportar CSV" aparece no topo de cada listagem
- Exporta os dados **conforme filtros atuais** da tela
- Mostra toast de erro se não houver dados
- Nome do arquivo inclui timestamp: `atletas_tenant-slug_2025-01-16.csv`

---

## Bloqueio de Tenant (v1)

### Comportamento Quando Tenant Está Bloqueado/Inadimplente

Quando um tenant está com problema de billing (`hasBillingIssue`, `isBlocked`, ou `isTrialExpired`):

1. **Banners exibidos**: Usuários admin/staff veem banner vermelho no topo das páginas com CTA para gerenciar cobrança
2. **Criação de filiações bloqueada**: A página de seleção de tipo de filiação (`/membership/new`) mostra aviso e desabilita botões
3. **Leitura permitida**: Dashboard, relatórios, rankings e área do atleta continuam funcionando normalmente

### Política de Falhas de Pagamento (v1)

A política segue o modelo intermediário de mercado:

| Situação | Status | Efeito |
|----------|--------|--------|
| 1ª falha de pagamento | PAST_DUE | Banner de aviso + bloqueio de novas filiações |
| 2-3 falhas na mesma fatura (7 dias) | PAST_DUE mantido | Stripe continua tentando (dunning automático) |
| Dunning esgotado sem sucesso | UNPAID ou CANCELED | Tenant completamente bloqueado |
| Pagamento regularizado | ACTIVE | Tudo liberado automaticamente |

**Notas importantes:**
- O Stripe gerencia as retentativas via dunning (configurável no Stripe Dashboard)
- Cada falha gera evento `TENANT_PAYMENT_FAILED` no audit_log para monitoramento
- Admin do tenant recebe e-mail a cada falha com link para atualizar cartão
- Leitura de dados permanece funcional durante PAST_DUE

### Estados Detectados
- `isBlocked`: Tenant inativo ou assinatura cancelada (CANCELED/UNPAID)
- `hasBillingIssue`: Status PAST_DUE, UNPAID ou INCOMPLETE
- `isTrialExpired`: Trial com período expirado

---

## Rankings (v1)

### Lógica de Cálculo

**Ranking de Academias:**
- Ordenadas por **número de filiações ATIVAS** (membership status = ACTIVE)
- Exibe também contagem de diplomas emitidos (informativo)

**Ranking de Atletas:**
- Ordenados por **número total de graduações registradas** (athlete_gradings)
- Exibe última graduação e academia atual

### Filtros Disponíveis
- Academias: por esporte, mínimo de atletas
- Atletas: por academia

### Observações
- Rankings são por tenant (dados não vazam entre organizações)
- Campos nulos são tratados graciosamente (exibem "—")
- Empty states informativos quando não há dados

---

## Fluxo de Validação Pós-Deploy (Smoke Test)

Execute estes 15 passos após cada deploy para verificar que tudo funciona:

### Funcionalidades Básicas
1. **Acesso público**: Acessar `/{tenant-slug}` e verificar página de landing carrega
2. **Filiação teste**: Iniciar filiação de adulto, preencher dados, verificar CAPTCHA aparece
3. **Checkout Stripe**: Completar pagamento no modo teste (card: 4242 4242 4242 4242)
4. **Verificar membership**: Confirmar que filiação aparece como PENDING_REVIEW no dashboard
5. **Aprovar filiação**: Como admin, aprovar a filiação e verificar carteira é gerada

### Área do Usuário
6. **Área do atleta**: Logar como atleta e verificar dados aparecem corretamente
7. **Dashboard admin**: Verificar estatísticas e atividade recente no dashboard
8. **Rankings**: Verificar páginas de rankings internos e públicos carregam sem erros

### Export e Audit
9. **Export CSV - Atletas**: Na lista de atletas, clicar "Exportar CSV" e verificar download
10. **Export CSV - Aprovações**: Na lista de aprovações, exportar e verificar dados
11. **Export CSV - Graduações**: Na página de graduações de um atleta, exportar
12. **Verificar logs**: Checar audit_logs para eventos esperados (MEMBERSHIP_PAID, etc)

### Billing e Saúde
13. **Health check**: Verificar card de saúde do sistema no dashboard (se jobs estão rodando)
14. **Cenário trial**: (Ambiente teste) Verificar banner de trial aparece para tenant em trial
15. **Cenário bloqueio**: (Ambiente teste) Verificar que tenant bloqueado não permite criar novas filiações

---

## Monitoramento de Jobs (Importante!)

### Interpretação de Ausência de Eventos

**⚠️ NOTA CRÍTICA**: A ausência de eventos `MEMBERSHIP_EXPIRED` ou `MEMBERSHIP_ABANDONED_CLEANUP` por mais de 24-48h indica **problema técnico nos cron jobs**, não uma punição aos usuários ou tenants.

| Situação | Significado | Ação Necessária |
|----------|-------------|-----------------|
| Nenhum `MEMBERSHIP_EXPIRED` em 24h | Jobs podem estar parados | Verificar pg_cron e pg_net |
| Job "Atrasado" no PlatformHealthCard | Mais de 24h desde última execução | Verificar cron.job e logs |
| Job "Erro" no PlatformHealthCard | Mais de 48h sem execução | Ação técnica urgente |

### O que NÃO significa
- Não significa que usuários/atletas perdem acesso
- Não significa que tenants devem ser bloqueados
- Apenas significa que filiações vencidas não estão sendo marcadas automaticamente

### Como diagnosticar
```sql
-- Ver jobs agendados
SELECT jobname, schedule, command FROM cron.job;

-- Ver execuções recentes
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Ver audit logs recentes do job
SELECT * FROM audit_logs 
WHERE event_type = 'MEMBERSHIP_EXPIRED' 
ORDER BY created_at DESC LIMIT 10;
```

---

## Monitoramento

### Logs de Edge Functions
Acesse via Supabase Dashboard → Edge Functions → Logs

### Audit Logs (tabela `audit_logs`)
Eventos críticos registrados automaticamente:

**Filiações:**
- `MEMBERSHIP_CREATED` - Nova filiação criada
- `MEMBERSHIP_PAID` - Pagamento de filiação confirmado via Stripe webhook
- `MEMBERSHIP_APPROVED` - Filiação aprovada por admin/staff
- `MEMBERSHIP_REJECTED` - Filiação rejeitada por admin/staff
- `MEMBERSHIP_EXPIRED` - Filiação expirada (automático via cron)
- `MEMBERSHIP_CANCELLED` - Filiação cancelada
- `MEMBERSHIP_ABANDONED_CLEANUP` - Filiação abandonada limpa (automático via cron)
- `RENEWAL_REMINDER_SENT` - Lembrete de renovação enviado

**Diplomas e Graduações:**
- `DIPLOMA_ISSUED` - Diploma emitido
- `DIPLOMA_REVOKED` - Diploma revogado
- `GRADING_RECORDED` - Graduação registrada
- `GRADING_NOTIFICATION_SENT` - Notificação de graduação enviada
- `DIGITAL_CARD_GENERATED` - Carteira digital gerada

**Billing de Tenant:**
- `TENANT_BILLING_UPDATED` - Billing de tenant atualizado
- `TENANT_SUBSCRIPTION_CREATED` - Assinatura criada
- `TENANT_SUBSCRIPTION_CANCELLED` - Assinatura cancelada
- `TENANT_PAYMENT_SUCCEEDED` - Pagamento bem-sucedido
- `TENANT_PAYMENT_FAILED` - Pagamento falhou
- `TRIAL_END_NOTIFICATION_SENT` - Notificação de fim de trial

**Autenticação:**
- `PASSWORD_RESET_REQUESTED` - Reset de senha solicitado
- `PASSWORD_RESET_COMPLETED` - Senha redefinida com sucesso

### Webhook Events (tabela `webhook_events`)
Registra todos os eventos do Stripe processados com status e erros.

---

## Testes Automatizados

### Edge Functions
O projeto inclui testes automatizados para as edge functions críticas:

```bash
# Rodar todos os testes
deno test --allow-env --allow-net supabase/functions/_tests/

# Rodar teste específico
deno test --allow-env --allow-net supabase/functions/_tests/edge-functions.test.ts
```

### Funções Testadas
- `request-password-reset`: Normalização de email, validação de formato, resposta genérica
- `reset-password`: Validação de senha, formato de token, expiração
- `create-membership-checkout`: Validação de UUID, status de pagamento, rate limiting
- `expire-memberships`: Identificação de filiações a expirar, idempotência
- `cleanup-abandoned-memberships`: Identificação de drafts abandonados

### CAPTCHA e Rate Limiting
- Validação de lógica de fail-open quando não configurado
- Teste de janelas de tempo para rate limiting
- Validação de tokens Turnstile
