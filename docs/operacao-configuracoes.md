# TATAME - Configurações de Operação

Este documento descreve as configurações externas necessárias para o sistema TATAME funcionar em produção.

## 1. Supabase Auth - Leaked Password Protection

### O que é
Proteção contra senhas vazadas em data breaches conhecidos. Impede usuários de usar senhas comprometidas.

### Como habilitar
1. Acesse o [Dashboard do Supabase](https://supabase.com/dashboard)
2. Vá para **Authentication** → **Providers** → **Email**
3. Habilite **"Leaked password protection"**
4. Configure o nível mínimo de senha (recomendado: 8 caracteres)

### Status atual
⚠️ **DESABILITADO** - Linter do Supabase indica que está desativado.

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

## 4. Cron Jobs (Agendamento de Tarefas)

### Pré-requisito
O Supabase precisa ter as extensões `pg_cron` e `pg_net` habilitadas:

```sql
-- Execute no SQL Editor do Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### Jobs a serem agendados

#### expire-memberships (diário às 03:00 UTC)
Marca filiações vencidas como EXPIRED.

```sql
SELECT cron.schedule(
  'expire-memberships-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-memberships',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb,
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
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb,
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
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb,
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
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  );
  $$
);
```

### Verificar jobs agendados
```sql
SELECT * FROM cron.job;
```

### Remover um job
```sql
SELECT cron.unschedule('nome-do-job');
```

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
- [ ] Habilitar **Leaked Password Protection** em Authentication → Providers → Email
- [ ] Configurar domínios permitidos (se aplicável)
- [ ] Verificar política de senhas (mínimo 8 caracteres recomendado)

### 2. CAPTCHA (Cloudflare Turnstile)
- [ ] Criar site no [Cloudflare Turnstile](https://dash.cloudflare.com/)
- [ ] Adicionar `TURNSTILE_SECRET_KEY` nos secrets do Supabase

### 3. Rate Limiting (Upstash Redis)
- [ ] Criar database no [Upstash Console](https://console.upstash.com/)
- [ ] Adicionar `UPSTASH_REDIS_REST_URL` nos secrets
- [ ] Adicionar `UPSTASH_REDIS_REST_TOKEN` nos secrets

### 4. Cron Jobs (Agendamento)
- [ ] Habilitar extensões `pg_cron` e `pg_net` no Supabase
- [ ] Executar SQL de agendamento para:
  - `expire-memberships` (03:00 UTC)
  - `cleanup-abandoned-memberships` (04:00 UTC)
  - `check-membership-renewal` (09:00 UTC)
  - `check-trial-ending` (10:00 UTC)

### 5. Pagamentos (Stripe)
- [ ] Configurar webhook URL: `https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/stripe-webhook`
- [ ] Verificar `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`
- [ ] Habilitar eventos necessários no webhook

### 6. E-mails (Resend)
- [ ] Verificar `RESEND_API_KEY`
- [ ] Configurar domínio de envio (DNS)

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
