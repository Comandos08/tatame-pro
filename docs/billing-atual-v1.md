# TATAME Billing - Arquitetura v1.0

Este documento descreve a arquitetura atual do sistema de billing do TATAME,
identificando pontos de extensão para futuras versões.

## 1. Visão Geral

O billing do TATAME é baseado em **Stripe Subscriptions** com suporte a dois planos:
- **Plano Federação Mensal**: Cobrança mensal
- **Plano Federação Anual**: Cobrança anual (padrão)
- **Trial de 14 dias** para novos tenants

### 1.1 Configuração Stripe

Os seguintes identificadores estão configurados como secrets no ambiente:

| Secret | Valor | Descrição |
|--------|-------|-----------|
| `STRIPE_PRODUCT_ID` | `prod_TnaAE6ZdWWsMPp` | Produto principal |
| `STRIPE_PRICE_MONTHLY` | `price_1SrOU8HH533PC5Ddq3h54ooX` | Preço mensal |
| `STRIPE_PRICE_YEARLY` | `price_1TOGrVHH533PC5Dd5J8QhqzW` | Preço anual |
| `STRIPE_SECRET_KEY` | Configurado via connector | Chave API |
| `STRIPE_WEBHOOK_SECRET` | Configurado | Validação de webhooks |

## 2. Fluxo Atual

### 2.1 Criação de Tenant

1. Superadmin cria tenant via `AdminDashboard`
2. Abre dialog de billing e escolhe plano (mensal/anual)
3. `create-tenant-subscription` é chamada com `planType`
4. Stripe Customer é criado (se não existir) com `stripe_customer_id`
5. Stripe Subscription é criada com trial de 14 dias
6. `tenant_billing` é criado com status `TRIALING`
7. Email de boas-vindas é enviado

### 2.2 Durante o Trial

- Tenant tem acesso completo à plataforma
- 3 dias antes do fim: `check-trial-ending` envia notificação
- Tenant pode adicionar método de pagamento via Customer Portal

### 2.3 Fim do Trial / Cobrança

- Stripe tenta cobrar automaticamente
- Se sucesso: status → `ACTIVE`
- Se falha: status → `PAST_DUE` ou `INCOMPLETE`

### 2.4 Problemas de Billing

Quando status é `PAST_DUE`, `CANCELED`, `UNPAID` ou `INCOMPLETE`:
- Banner de aviso exibido no dashboard do tenant
- Criação de novas filiações é bloqueada
- Acesso de leitura permanece (dashboard, relatórios)
- CTA para Customer Portal é exibido

## 3. Tabelas do Banco

### tenant_billing
```sql
- id: UUID
- tenant_id: UUID (FK → tenants)
- stripe_customer_id: TEXT (obrigatório para subscription)
- stripe_subscription_id: TEXT
- plan_name: TEXT ("Plano Federação Mensal" ou "Plano Federação Anual")
- plan_price_id: TEXT (price_1SrOU8HH533PC5Ddq3h54ooX ou price_1TOGrVHH533PC5Dd5J8QhqzW)
- status: billing_status ENUM
- current_period_start: TIMESTAMP
- current_period_end: TIMESTAMP
- cancel_at: TIMESTAMP
- canceled_at: TIMESTAMP
- trial_end_notification_sent: BOOLEAN
```

### tenant_invoices
```sql
- id: UUID
- tenant_id: UUID
- stripe_invoice_id: TEXT
- amount_cents: INTEGER
- currency: TEXT
- status: TEXT
- paid_at: TIMESTAMP
- hosted_invoice_url: TEXT
```

## 4. Edge Functions

### create-tenant-subscription
- Cria customer e subscription no Stripe
- Aplica trial para novos tenants
- Salva dados em `tenant_billing`

### stripe-webhook
- Processa eventos do Stripe
- Atualiza `tenant_billing` e `tenant_invoices`
- Envia emails de notificação
- Ativa/desativa tenant conforme status

### tenant-customer-portal
- Gera URL do Customer Portal do Stripe
- Permite tenant gerenciar método de pagamento

### check-trial-ending
- Executa diariamente via cron
- Envia email 3 dias antes do fim do trial

## 5. Status de Billing

```typescript
type BillingStatus = 
  | 'ACTIVE'      // Pagamento em dia
  | 'PAST_DUE'    // Pagamento atrasado
  | 'CANCELED'    // Assinatura cancelada
  | 'INCOMPLETE'  // Aguardando pagamento inicial
  | 'TRIALING'    // Período de teste
  | 'UNPAID'      // Múltiplas falhas de pagamento
```

## 6. Pontos de Extensão (v2)

### 6.1 Planos Diferenciados
**Arquivo**: `create-tenant-subscription/index.ts`
**Linha ~95**: `const priceId = planPriceId || "price_1Spz03..."`

Para adicionar múltiplos planos:
```typescript
// EXTENSÃO v2: Mapear planos com features
const PLANS = {
  starter: { priceId: 'price_xxx', features: { maxAthletes: 100 } },
  pro: { priceId: 'price_yyy', features: { maxAthletes: 500 } },
  enterprise: { priceId: 'price_zzz', features: { maxAthletes: -1 } },
};
```

### 6.2 Limites por Plano
**Arquivo**: Novo - `src/hooks/usePlanLimits.ts`

Para implementar limites:
```typescript
// EXTENSÃO v2: Hook para verificar limites
export function usePlanLimits() {
  const { tenant } = useTenant();
  const billing = useTenantBilling();
  
  return {
    maxAthletes: PLANS[billing.plan_name]?.features?.maxAthletes ?? 100,
    maxAcademies: PLANS[billing.plan_name]?.features?.maxAcademies ?? 5,
    // ...
  };
}
```

### 6.3 Upgrade/Downgrade
**Arquivo**: `stripe-webhook/index.ts`
**Handler**: `handleSubscriptionChange`

Para suportar mudanças de plano:
```typescript
// EXTENSÃO v2: Detectar mudança de plano
if (newPriceId !== oldPriceId) {
  await handlePlanChange(subscription, oldPriceId, newPriceId);
  await createAuditLog(supabase, {
    event_type: 'PLAN_CHANGED',
    // ...
  });
}
```

### 6.4 Add-ons e Cobrança por Uso
**Tabela nova**: `tenant_usage`
**Edge function nova**: `track-usage`

```sql
-- EXTENSÃO v2: Tracking de uso
CREATE TABLE tenant_usage (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  athletes_count INTEGER,
  memberships_count INTEGER,
  diplomas_issued INTEGER
);
```

## 7. Checklist de Perguntas para v2

Antes de implementar billing avançado, responder:

### Planos e Pricing
- [ ] Quantos planos teremos? (Starter, Pro, Enterprise?)
- [ ] Cobrança mensal, anual ou ambos?
- [ ] Desconto para pagamento anual?
- [ ] Preços diferenciados por região/moeda?

### Limites
- [ ] Limite por número de atletas?
- [ ] Limite por número de academias?
- [ ] Limite por número de coaches?
- [ ] Limite por número de filiações/mês?
- [ ] Limite de armazenamento (documentos)?

### Features por Plano
- [ ] Rankings: disponível em todos os planos?
- [ ] Exportação CSV: todos ou apenas Pro+?
- [ ] Diplomas digitais: incluídos ou add-on?
- [ ] Carteira digital: todos ou premium?
- [ ] API access: Enterprise only?

### Upgrade/Downgrade
- [ ] Pro-rata no upgrade?
- [ ] O que acontece no downgrade se exceder limites?
- [ ] Período de carência para downgrade?

### Add-ons
- [ ] Atletas extras (pacotes de 50/100)?
- [ ] Suporte prioritário?
- [ ] Customização de marca (white-label)?
- [ ] Integrações extras?

### Operação
- [ ] Quem pode mudar plano? (apenas superadmin?)
- [ ] Self-service upgrade para tenant admin?
- [ ] Notificações quando próximo do limite?
- [ ] Grace period para pagamentos atrasados?

## 8. Alertas Recomendados

Para operação saudável, monitorar:

### Críticos (alerta imediato)
1. **Webhook errors** > 5 em 1 hora
2. **Tenant bloqueado** sem email enviado
3. **Job não executou** > 24 horas

### Avisos (revisão diária)
1. **Tenants PAST_DUE** > 3 dias
2. **Trials expirando** sem pagamento configurado
3. **Falhas de pagamento** recorrentes (mesmo tenant)

### Métricas de Negócio (revisão semanal)
1. Conversão trial → pago
2. Churn rate
3. MRR/ARR
4. Tempo médio de trial até primeiro pagamento

## 9. Logs e Auditoria

Eventos de billing registrados em `audit_logs`:

```
TENANT_SUBSCRIPTION_CREATED   - Nova assinatura criada
TENANT_PAYMENT_SUCCEEDED      - Pagamento bem-sucedido
TENANT_PAYMENT_FAILED         - Falha de pagamento
TENANT_BILLING_UPDATED        - Status de billing alterado
TRIAL_END_NOTIFICATION_SENT   - Email de fim de trial enviado
```

---

*Documento criado para congelar estado v1.0 e preparar discussões de v2.*
*Última atualização: Janeiro 2026*
