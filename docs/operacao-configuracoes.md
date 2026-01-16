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

- [ ] Habilitar Leaked Password Protection no Supabase Auth
- [ ] Adicionar `TURNSTILE_SECRET_KEY` nos secrets
- [ ] Verificar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
- [ ] Habilitar extensões `pg_cron` e `pg_net`
- [ ] Agendar todos os cron jobs
- [ ] Configurar webhook do Stripe
- [ ] Verificar domínio do Resend

---

## Monitoramento

### Logs de Edge Functions
Acesse via Supabase Dashboard → Edge Functions → Logs

### Audit Logs
Tabela `audit_logs` registra:
- `MEMBERSHIP_EXPIRED` - Filiações expiradas automaticamente
- `MEMBERSHIP_ABANDONED_CLEANUP` - Filiações abandonadas limpas
- `RENEWAL_REMINDER_SENT` - Lembretes de renovação enviados
- `TRIAL_END_NOTIFICATION_SENT` - Notificações de fim de trial

### Webhook Events
Tabela `webhook_events` registra todos os eventos do Stripe processados.
