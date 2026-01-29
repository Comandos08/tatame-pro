

# Plano Revisado: Growth Trial + Estabilidade Operacional

## Decisão Estratégica Registrada

**Identity Wizard (COMPLETE_WIZARD):** Permanecerá **DESABILITADO** intencionalmente. A criação de novos tenants continua sendo uma decisão estratégica controlada exclusivamente via Superadmin através do `CreateTenantDialog`. Esta decisão será reavaliada em fase futura de produto.

---

## Visão Geral do Plano

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    PRIORIZAÇÃO REVISADA                              │
├─────────────────────────────────────────────────────────────────────┤
│  FASE 1: Correções Críticas (Pré-requisitos)                        │
│    └─ Consolidação de Rotas                                         │
│    └─ Correção stripe-webhook (statusMap)                           │
│                                                                      │
│  FASE 2: Growth Trial Lifecycle (Core do PI)                        │
│    └─ i18n de Billing/Trial                                         │
│    └─ TenantBlockedScreen (PENDING_DELETE)                          │
│    └─ Integração TenantOnboardingGate                               │
│    └─ Deploy Edge Functions (expire-trials, mark-pending-delete,    │
│       cleanup-expired-tenants)                                       │
│                                                                      │
│  FASE 3: Estabilidade Operacional                                   │
│    └─ Documentação de Fluxos (BUSINESS-FLOWS.md)                    │
│    └─ Testes E2E do Trial Lifecycle                                 │
│    └─ Configuração pg_cron dos Jobs                                 │
│                                                                      │
│  FASE 4: Refinamentos UX (Opcional/Futuro)                          │
│    └─ Empty States padronizados                                     │
│    └─ Error Boundaries globais                                      │
│    └─ Rankings (validação de dados)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## FASE 1: Correções Críticas (Pré-requisitos)

### 1.1 Consolidação de Rotas

**Problema:** Existem duas estruturas de rotas divergentes (`App.tsx` e `routes.tsx`), gerando risco de manutenção e inconsistências.

**Solução:** Unificar em `App.tsx` como fonte única, removendo `routes.tsx`.

| Arquivo | Ação |
|---------|------|
| `src/App.tsx` | Manter e expandir como fonte única |
| `src/routes.tsx` | Remover (código órfão) |

**Estrutura Consolidada:**

```text
App.tsx (IdentityGate no topo)
├── Públicas: /, /login, /help, /forgot-password, /reset-password, /auth/callback
├── Verificação: /verify/*, /c/:code
├── Identity: /identity/wizard
├── Portal: /portal/* (PortalRouter)
├── Admin: /admin, /admin/tenants/:tenantId/control
├── Tenant: /:tenantSlug (TenantLayout)
│   ├── index → TenantLanding
│   └── /app/* → TenantDashboard (com TenantOnboardingGate)
└── Fallback: * → NotFound
```

**Impacto:** Zero quebra de funcionalidade, apenas limpeza estrutural.

---

### 1.2 Correção stripe-webhook (statusMap)

**Problema:** A remoção acidental do `statusMap` no último diff quebrou a lógica de mapeamento de status Stripe → billing_status.

**Solução:** Restaurar o bloco removido antes do upsert.

| Arquivo | Ação |
|---------|------|
| `supabase/functions/stripe-webhook/index.ts` | Restaurar `statusMap` e `billingStatus` (linhas ~506-520) |

**Código a restaurar:**

```typescript
// Map Stripe status to our enum
const statusMap: Record<string, string> = {
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  trialing: "TRIALING",
  unpaid: "UNPAID",
  incomplete_expired: "CANCELED",
  paused: "PAST_DUE",
};

const billingStatus = statusMap[subscription.status] || "INCOMPLETE";
```

**Impacto:** Crítico - sem isso, webhooks Stripe falharão ao atualizar billing.

---

## FASE 2: Growth Trial Lifecycle (Core do PI)

### 2.1 i18n de Billing/Trial

**Arquivos a modificar:**

| Arquivo | Novas Chaves |
|---------|--------------|
| `src/locales/pt-BR.ts` | `trial.*`, `billing.pendingDelete.*` |
| `src/locales/en.ts` | `trial.*`, `billing.pendingDelete.*` |
| `src/locales/es.ts` | `trial.*`, `billing.pendingDelete.*` |

**Chaves Necessárias:**

```typescript
// Trial Status
'trial.daysRemaining': 'Período de avaliação - {days} dias restantes',
'trial.expiringSoon': 'Seu trial expira em {days} dias!',
'trial.expired': 'Período de avaliação encerrado',
'trial.expiredDesc': 'Ações administrativas estão limitadas. Ative sua assinatura para continuar.',
'trial.activateNow': 'Ativar Assinatura',

// Pending Delete
'billing.pendingDelete.title': 'Organização será removida em {days} dias',
'billing.pendingDelete.description': 'Sem ativação, todos os dados serão permanentemente removidos.',
'billing.pendingDelete.lastChance': 'Última chance para ativar',
'billing.pendingDelete.dataWarning': 'Todos os atletas, eventos e documentos serão perdidos',

// Action Restrictions
'trial.actionBlocked': 'Ação indisponível',
'trial.actionBlockedDesc': 'Ative sua assinatura para executar esta ação.',
'trial.impersonatingRestricted': 'Visualizando tenant com trial expirado. Ações bloqueadas.',

// Reactivation
'billing.reactivated': 'Assinatura ativada com sucesso!',
'billing.reactivatedDesc': 'Todas as funcionalidades foram restauradas.',

// Tenant Status Banner
'tenantStatus.onTrial': 'Período de avaliação até {date}',
'tenantStatus.trialEndingSoon': 'Seu trial expira em {days} dias!',
'tenantStatus.trialExpired': 'Trial expirado. Ative sua assinatura para restaurar acesso.',
'tenantStatus.blocked': 'Organização bloqueada. Regularize sua situação.',
'tenantStatus.billingIssue': 'Problema com pagamento. Verifique sua assinatura.',
'tenantStatus.manageBilling': 'Gerenciar Assinatura',
'tenantStatus.viewDetails': 'Ver Detalhes',
```

---

### 2.2 TenantBlockedScreen (Estado PENDING_DELETE)

**Arquivo:** `src/components/billing/TenantBlockedScreen.tsx`

**Modificações:**

1. Adicionar prop `billingStatus` para diferenciar estados
2. Renderização condicional para `PENDING_DELETE`:
   - Título: "Organização será removida em X dias"
   - Contagem regressiva visual
   - Aviso de perda permanente de dados
   - CTA de última chance ("Ativar Agora")

**Novo fluxo de decisão:**

```text
billingStatus === 'PENDING_DELETE'
  → Mostrar contagem regressiva (scheduledDeleteAt - now)
  → Ícone de alerta crítico
  → Mensagem de urgência
  → Botão "Ativar Assinatura" (destaque máximo)

billingStatus === 'CANCELED' || !isActive
  → Comportamento atual (bloqueio padrão)
```

---

### 2.3 Integração TenantOnboardingGate

**Problema:** O `TenantOnboardingGate` existe mas não está integrado ao `TenantLayout`.

**Arquivo a modificar:** `src/layouts/TenantLayout.tsx`

**Modificação:**

```typescript
// Antes do <Outlet />, envolver com:
<TenantOnboardingGate>
  <Outlet />
</TenantOnboardingGate>
```

**Lógica já existente no Gate:**
- Se `onboarding_completed === false` → Redireciona para `/:slug/app/onboarding`
- Rotas permitidas durante onboarding: `/app/onboarding`, `/app/academies`, `/app/coaches`, `/app/grading-schemes`, `/app/settings`

---

### 2.4 Verificação Edge Functions

**Status atual das Edge Functions:**

| Function | Status | Ação |
|----------|--------|------|
| `expire-trials` | ✅ Criada | Verificar deploy |
| `mark-pending-delete` | ✅ Criada | Verificar deploy |
| `cleanup-expired-tenants` | ✅ Criada | Verificar deploy |
| `create-tenant-subscription` | ✅ Atualizada (7 dias) | Verificar deploy |
| `stripe-webhook` | ⚠️ Quebrada | Corrigir statusMap |
| `send-billing-email` | ✅ Atualizada | Verificar templates |

**Verificação de config.toml:**

Confirmar que todas as functions estão registradas:

```toml
[functions.expire-trials]
verify_jwt = false

[functions.mark-pending-delete]
verify_jwt = false

[functions.cleanup-expired-tenants]
verify_jwt = false
```

---

## FASE 3: Estabilidade Operacional

### 3.1 Documentação de Fluxos

**Novo arquivo:** `docs/BUSINESS-FLOWS.md`

**Conteúdo:**

1. **Fluxo de Criação de Tenant (via Superadmin)**
   - CreateTenantDialog → create-tenant-subscription → tenant + tenant_billing
   - Status inicial: TRIALING, trial_expires_at = D+7

2. **Ciclo de Vida do Trial**
   - D+0: TRIALING (acesso total)
   - D+7: expire-trials → TRIAL_EXPIRED (acesso parcial)
   - D+15: mark-pending-delete → PENDING_DELETE (bloqueio total)
   - D+22: cleanup-expired-tenants → Deleção com salvaguardas

3. **Fluxo de Reativação**
   - Pagamento Stripe → stripe-webhook → ACTIVE
   - Limpeza de campos de deleção
   - Reativação de tenant.is_active

4. **Matriz de Ações por Status**
   - Tabela completa de permissões

---

### 3.2 Testes E2E do Trial Lifecycle

**Novo arquivo:** `e2e/billing/trial-lifecycle.spec.ts`

**Cenários a testar:**

```typescript
describe('Trial Lifecycle', () => {
  test('Tenant starts with TRIALING status and 7-day expiration');
  test('TrialStatusBanner shows correct days remaining');
  test('Sensitive actions blocked in TRIAL_EXPIRED state');
  test('TenantBlockedScreen shows for PENDING_DELETE');
  test('Impersonation respects trial restrictions');
  test('Payment reactivates tenant from TRIAL_EXPIRED');
  test('Payment reactivates tenant from PENDING_DELETE');
});
```

---

### 3.3 Configuração pg_cron

**Documentar em `docs/operacao-configuracoes.md`:**

```sql
-- Agendar expire-trials (diário 00:05 UTC)
SELECT cron.schedule(
  'expire-trials-daily',
  '5 0 * * *',
  $$SELECT net.http_post(
    url := 'https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/expire-trials',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Agendar mark-pending-delete (diário 00:10 UTC)
SELECT cron.schedule(
  'mark-pending-delete-daily',
  '10 0 * * *',
  $$SELECT net.http_post(
    url := 'https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/mark-pending-delete',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

-- Agendar cleanup-expired-tenants (diário 03:00 UTC)
SELECT cron.schedule(
  'cleanup-expired-tenants-daily',
  '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/cleanup-expired-tenants',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);
```

---

## FASE 4: Refinamentos UX (Opcional/Futuro)

**Prioridade:** Baixa - pode ser executado após launch inicial.

| Item | Descrição | Arquivos |
|------|-----------|----------|
| Empty States | Componente reutilizável para listas vazias | `src/components/ui/empty-state.tsx` |
| Error Boundaries | Wrapper global para erros de renderização | `src/components/ErrorBoundary.tsx` (já existe, revisar) |
| Rankings | Validar conexão com dados reais | `src/pages/InternalRankings.tsx`, `src/pages/PublicRankings.tsx` |

---

## Ordem de Execução

```text
SEQUÊNCIA DE IMPLEMENTAÇÃO
══════════════════════════

1. [CRÍTICO] Restaurar statusMap no stripe-webhook
   └─ Impacto: Webhooks Stripe voltam a funcionar

2. [CRÍTICO] Consolidar rotas (remover routes.tsx)
   └─ Impacto: Estrutura limpa, sem código órfão

3. [CORE] Adicionar i18n keys de trial/billing
   └─ Dependência: Necessário para UI de trial

4. [CORE] Atualizar TenantBlockedScreen
   └─ Dependência: i18n keys, billingState

5. [CORE] Integrar TenantOnboardingGate
   └─ Impacto: Onboarding obrigatório ativado

6. [VERIFICAÇÃO] Deploy e teste das Edge Functions
   └─ Dependência: stripe-webhook corrigido

7. [DOCS] Criar BUSINESS-FLOWS.md
   └─ Impacto: Documentação operacional

8. [TESTES] E2E trial-lifecycle.spec.ts
   └─ Dependência: Tudo acima funcionando

9. [OPS] Agendar cron jobs
   └─ Dependência: Functions deployadas e testadas
```

---

## Checklist de Validação Final

### Pré-Launch

- [ ] stripe-webhook processa webhooks corretamente
- [ ] Novas routes não quebram navegação existente
- [ ] Trial de 7 dias aparece para novos tenants
- [ ] TrialStatusBanner mostra contagem regressiva
- [ ] Ações sensíveis bloqueadas em TRIAL_EXPIRED
- [ ] TenantBlockedScreen funciona para PENDING_DELETE
- [ ] Impersonation respeita restrições de trial
- [ ] TenantOnboardingGate redireciona corretamente

### Pós-Launch

- [ ] Cron jobs agendados e executando
- [ ] Logs de auditoria registrando transições
- [ ] Emails de billing sendo enviados
- [ ] Cleanup com salvaguardas funcionando

---

## Arquivos Modificados (Resumo)

| Arquivo | Fase | Tipo |
|---------|------|------|
| `supabase/functions/stripe-webhook/index.ts` | 1 | Correção |
| `src/App.tsx` | 1 | Consolidação |
| `src/routes.tsx` | 1 | Remoção |
| `src/locales/pt-BR.ts` | 2 | Adição i18n |
| `src/locales/en.ts` | 2 | Adição i18n |
| `src/locales/es.ts` | 2 | Adição i18n |
| `src/components/billing/TenantBlockedScreen.tsx` | 2 | Modificação |
| `src/layouts/TenantLayout.tsx` | 2 | Modificação |
| `docs/BUSINESS-FLOWS.md` | 3 | Criação |
| `docs/operacao-configuracoes.md` | 3 | Adição |
| `e2e/billing/trial-lifecycle.spec.ts` | 3 | Criação |

