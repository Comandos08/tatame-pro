# TATAME PRO - Fluxos de Negócio

Este documento descreve os principais fluxos de negócio do sistema Tatame PRO, incluindo o ciclo de vida completo de tenants, filiações e graduações.

---

## 1. Fluxo de Criação de Tenant (via Superadmin)

### Atores
- **Superadmin Global**: Único responsável pela criação de novos tenants

### Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Superadmin acessa /admin                                     │
│ 2. Clica em "Criar Nova Organização" (CreateTenantDialog)       │
│ 3. Preenche: Nome, Slug, Email de billing, Tipo de plano        │
│ 4. Sistema chama create-tenant-subscription Edge Function       │
│ 5. Edge Function:                                               │
│    └─ Cria registro em `tenants` (is_active = true)             │
│    └─ Cria registro em `tenant_billing` com:                    │
│       - status: TRIALING                                        │
│       - trial_expires_at: now() + 7 dias                        │
│       - is_manual_override: true (trial inicial)                │
│ 6. Retorna sucesso → Superadmin pode criar admin do tenant      │
└─────────────────────────────────────────────────────────────────┘
```

### Resultado
- Tenant criado com status **TRIALING**
- 7 dias de trial com acesso total
- Admin do tenant pode acessar `/{slug}/app` após criação

---

## 2. Ciclo de Vida do Trial (7 dias)

### Estados e Transições

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  D+0                    D+7                   D+15                D+22   │
│   │                      │                      │                   │    │
│   ▼                      ▼                      ▼                   ▼    │
│ TRIALING ──────────► TRIAL_EXPIRED ─────────► PENDING_DELETE ──► DELETED │
│   │                      │                      │                   │    │
│   │                      │                      │                   │    │
│   │    expire-trials     │   mark-pending-delete│  cleanup-expired  │    │
│   │      (03:00 UTC)     │     (03:10 UTC)      │    (03:00 UTC)    │    │
│   │                      │                      │                   │    │
│   └──────────────────────┴──────────────────────┴───────────────────┘    │
│                                                                          │
│   Em qualquer ponto: Pagamento Stripe → ACTIVE                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Detalhamento por Estado

| Estado | Dias | Acesso | Ações Sensíveis | UI |
|--------|------|--------|-----------------|------|
| **TRIALING** | 0-7 | ✅ Total | ✅ Permitidas | Banner informativo (azul) |
| **TRIAL_EXPIRED** | 7-15 | ⚠️ Parcial | ❌ Bloqueadas | Banner de alerta (amarelo) |
| **PENDING_DELETE** | 15-22 | ❌ Bloqueado | ❌ Bloqueadas | Tela de bloqueio com countdown |
| **DELETED** | 22+ | ❌ Removido | - | Tenant não existe mais |

### Ações Sensíveis (bloqueadas em TRIAL_EXPIRED)
- Aprovar filiações
- Criar eventos
- Emitir diplomas
- Registrar graduações
- Criar novos atletas (via staff)

### Edge Functions Envolvidas

| Function | Horário (UTC) | Ação |
|----------|---------------|------|
| `expire-trials` | 00:05 | TRIALING → TRIAL_EXPIRED |
| `mark-pending-delete` | 00:10 | TRIAL_EXPIRED (D+8) → PENDING_DELETE |
| `cleanup-expired-tenants` | 03:00 | PENDING_DELETE (D+7) → Deleção |

---

## 3. Fluxo de Reativação (Pagamento)

### Via Stripe Checkout

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Admin do tenant acessa TenantBlockedScreen ou Billing page  │
│ 2. Clica em "Gerenciar Assinatura" ou "Ativar Agora"            │
│ 3. Sistema chama tenant-customer-portal Edge Function           │
│ 4. Redireciona para Stripe Customer Portal                      │
│ 5. Usuário efetua pagamento                                     │
│ 6. Stripe envia webhook (checkout.session.completed)            │
│ 7. stripe-webhook Edge Function:                                │
│    └─ Atualiza tenant_billing.status → ACTIVE                   │
│    └─ Limpa grace_period_ends_at, scheduled_delete_at           │
│    └─ Atualiza tenants.is_active → true                         │
│    └─ Loga TENANT_REACTIVATED no audit_logs                     │
│    └─ Envia email SUBSCRIPTION_REACTIVATED                      │
│ 8. Tenant volta a ter acesso total imediatamente                │
└─────────────────────────────────────────────────────────────────┘
```

### Estados que Podem ser Reativados
- TRIAL_EXPIRED → ACTIVE
- PENDING_DELETE → ACTIVE
- PAST_DUE → ACTIVE
- CANCELED → ACTIVE

---

## 4. Fluxo de Filiação de Atleta

### Fluxo Completo (Adulto)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Visitante acessa /{slug} (TenantLanding)                     │
│ 2. Clica em "Filie-se Agora"                                    │
│ 3. Seleciona tipo de filiação (Adulto/Menor)                    │
│ 4. Preenche dados pessoais (AdultMembershipForm)                │
│ 5. Faz upload de documentos (RG/CNH)                            │
│ 6. Confirma dados e efetua pagamento (Stripe Checkout)          │
│ 7. Webhook processa pagamento:                                  │
│    └─ Membership status: DRAFT → PENDING_REVIEW                 │
│    └─ Payment status: PENDING → PAID                            │
│ 8. Staff/Admin do tenant aprova filiação:                       │
│    └─ Sistema cria registro de Athlete                          │
│    └─ Gera Digital Card (generate-digital-card)                 │
│    └─ Membership status: PENDING_REVIEW → ACTIVE                │
│ 9. Atleta pode acessar Portal (/portal) com carteira digital    │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo Completo (Menor de Idade)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Responsável acessa /{slug} (TenantLanding)                   │
│ 2. Clica em "Filie-se Agora"                                    │
│ 3. Seleciona tipo de filiação: "Menor de Idade"                 │
│ 4. Preenche dados do responsável (Step 1 - Guardian)            │
│ 5. Preenche dados do atleta menor (Step 2 - Athlete)            │
│    └─ Validação: idade < 18 anos (cálculo preciso)              │
│ 6. Faz upload de documentos do atleta (Step 3 - Documents)      │
│ 7. Faz login (se ainda não autenticado)                         │
│ 8. Sistema salva dados em applicant_data (inclui guardian{})    │
│ 9. Documentos salvos em tmp/{userId}/{timestamp}/               │
│ 10. Confirma dados e efetua pagamento (Stripe Checkout)         │
│ 11. Webhook processa pagamento:                                 │
│     └─ Membership status: DRAFT → PENDING_REVIEW                │
│     └─ Payment status: PENDING → PAID                           │
│ 12. Staff/Admin do tenant aprova filiação:                      │
│     └─ Sistema cria registro de Guardian                        │
│     └─ Sistema cria registro de Athlete                         │
│     └─ Sistema cria guardian_link (is_primary = true)           │
│     └─ Move documentos tmp/ → {tenant_id}/{athlete_id}/         │
│     └─ Gera Digital Card (generate-digital-card)                │
│     └─ Membership status: PENDING_REVIEW → ACTIVE               │
│ 13. Responsável/Atleta pode acessar Portal via carteira digital │
└─────────────────────────────────────────────────────────────────┘
```

**Estrutura applicant_data para Menor:**
```json
{
  "full_name": "João Silva",
  "birth_date": "2012-05-15",
  "national_id": null,
  "gender": "MALE",
  "email": "responsavel@email.com",
  "is_minor": true,
  "guardian": {
    "full_name": "Maria Silva",
    "national_id": "123.456.789-00",
    "email": "responsavel@email.com",
    "phone": "11999998888",
    "relationship": "PARENT"
  }
}
```

### Transição Automática Youth → Adult

Quando um atleta com Youth Membership completa 18 anos:

```
┌─────────────────────────────────────────────────────────────────┐
│ CRON: 03:15 UTC diariamente                                     │
│ transition-youth-to-adult                                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Busca atletas com guardian_links                             │
│ 2. Filtra por age >= 18 (birth_date)                            │
│ 3. Filtra por is_minor = true na membership                     │
├─────────────────────────────────────────────────────────────────┤
│ Para cada atleta elegível:                                      │
│                                                                 │
│ ✅ applicant_data.is_minor = false                              │
│ ✅ Guardian movido para youth_transition.previous_guardian      │
│ ✅ Membership PERMANECE a mesma                                 │
│ ✅ Athlete PERMANECE o mesmo                                    │
│ ✅ guardian_links PRESERVADO (não deletado)                     │
├─────────────────────────────────────────────────────────────────┤
│ Audit: YOUTH_AUTO_TRANSITION                                    │
│ metadata: athlete_id, membership_id, previous_is_minor,         │
│          birth_date, transitioned_at, job_run_id                │
└─────────────────────────────────────────────────────────────────┘
```

**Estrutura applicant_data APÓS Transição:**
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

**Princípios SAFE GOLD:**
- Nenhum dado é deletado
- Nenhuma nova entidade é criada
- Histórico financeiro intacto
- Guardian links preservados para auditoria legal
- 100% idempotente e auditável

### Status de Filiação

| Status | Descrição | Próximo Estado |
|--------|-----------|----------------|
| DRAFT | Iniciada, sem pagamento | PENDING_PAYMENT / abandonada |
| PENDING_PAYMENT | Aguardando pagamento | PENDING_REVIEW (após pagar) |
| PENDING_REVIEW | Pago, aguardando aprovação | ACTIVE ou REJECTED |
| ACTIVE | Filiação aprovada e ativa | EXPIRED (após 12 meses) |
| EXPIRED | Período de filiação encerrado | ACTIVE (renovação) |
| REJECTED | Rejeitada pelo staff | - |
| CANCELLED | Cancelada | - |

---

## 5. Fluxo de Impersonation (Superadmin → Tenant)

### Objetivo
Permitir que Superadmins atuem como Admins de tenant para suporte.

### Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Superadmin está em /admin (AdminDashboard)                   │
│ 2. Clica em "Impersonar" em um tenant específico                │
│ 3. Sistema chama start-impersonation Edge Function              │
│ 4. Cria registro em impersonation_sessions com TTL de 60min     │
│ 5. Atualiza ImpersonationContext no frontend                    │
│ 6. Redireciona para /{tenant-slug}/app                          │
│ 7. IdentityGate (R5) permite acesso via sessão de impersonation │
│ 8. Banner de impersonation exibido no topo                      │
│ 9. Após ações de suporte, Superadmin clica "Encerrar"           │
│ 10. Sistema chama end-impersonation Edge Function               │
│ 11. Redireciona de volta para /admin                            │
└─────────────────────────────────────────────────────────────────┘
```

### Regras de Segurança
- TTL máximo: 60 minutos
- Sessão invalidada ao encerrar ou expirar
- Superadmin em impersonation **não pode** executar ações sensíveis se tenant está em TRIAL_EXPIRED
- Todas as ações logadas com flag `impersonated: true`

---

## 6. Matriz de Ações por Status de Billing

| Ação | TRIALING | TRIAL_EXPIRED | PENDING_DELETE | ACTIVE | PAST_DUE |
|------|----------|---------------|----------------|--------|----------|
| Visualizar dashboard | ✅ | ✅ | ❌ | ✅ | ✅ |
| Visualizar atletas | ✅ | ✅ | ❌ | ✅ | ✅ |
| Aprovar filiações | ✅ | ❌ | ❌ | ✅ | ⚠️ |
| Criar eventos | ✅ | ❌ | ❌ | ✅ | ⚠️ |
| Emitir diplomas | ✅ | ❌ | ❌ | ✅ | ⚠️ |
| Registrar graduações | ✅ | ❌ | ❌ | ✅ | ⚠️ |
| Editar configurações | ✅ | ✅ | ❌ | ✅ | ✅ |
| Gerenciar billing | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legenda:**
- ✅ Permitido
- ⚠️ Permitido com aviso
- ❌ Bloqueado

---

## 7. Fluxo de Onboarding de Tenant

### Objetivo
Garantir que novos tenants configurem o mínimo necessário antes de operar.

### Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Admin acessa /{slug}/app pela primeira vez                  │
│ 2. TenantOnboardingGate detecta onboarding_completed = false   │
│ 3. Redireciona para /{slug}/app/onboarding                     │
│ 4. Wizard guia configuração de:                                │
│    └─ Perfil da organização                                    │
│    └─ Pelo menos 1 academia                                    │
│    └─ Pelo menos 1 professor                                   │
│    └─ Sistema de graduação                                     │
│ 5. Ao completar, chama complete-tenant-onboarding              │
│ 6. Edge Function valida requisitos e seta onboarding_completed │
│ 7. Admin pode acessar dashboard completo                       │
└─────────────────────────────────────────────────────────────────┘
```

### Rotas Permitidas Durante Onboarding
- `/app/onboarding`
- `/app/academies`
- `/app/coaches`
- `/app/grading-schemes`
- `/app/settings`

---

## 8. Jobs Automatizados (Cron)

### Schedule Diário

| Horário (UTC) | Job | Função |
|---------------|-----|--------|
| 00:05 | expire-trials | Expira trials vencidos |
| 00:10 | mark-pending-delete | Marca para deleção |
| 02:30 | pre-expiration-scheduler | Alertas de expiração de filiação |
| 03:00 | expire-memberships | Expira filiações vencidas |
| 03:00 | cleanup-expired-tenants | Remove tenants marcados |
| 03:15 | transition-youth-to-adult | Transiciona menores de 18 para adultos |
| 03:30 | cleanup-tmp-documents | Remove documentos temporários |
| 04:00 | cleanup-abandoned-memberships | Remove filiações abandonadas |
| 09:00 | check-membership-renewal | Lembretes de renovação |
| 10:00 | check-trial-ending | Notificações de trial |

---

## 9. Fluxo de Verificação Pública

### Verificar Carteira Digital

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Pessoa escaneia QR code da carteira digital                 │
│ 2. Redireciona para /verify/card/:code                         │
│ 3. VerifyCard page busca dados via RPC público                 │
│ 4. Exibe:                                                       │
│    └─ Nome do atleta                                           │
│    └─ Organização emissora                                     │
│    └─ Status da filiação (ATIVA/EXPIRADA)                      │
│    └─ Validade                                                 │
│    └─ Hash de integridade SHA-256                              │
│ 5. Badge de autenticidade confirma documento válido            │
└─────────────────────────────────────────────────────────────────┘
```

### Verificar Diploma

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Pessoa escaneia QR code do diploma                          │
│ 2. Redireciona para /verify/diploma/:code                      │
│ 3. VerifyDiploma page busca dados via RPC público              │
│ 4. Exibe:                                                       │
│    └─ Nome do atleta                                           │
│    └─ Graduação recebida (faixa)                               │
│    └─ Data de promoção                                         │
│    └─ Academia e professor                                     │
│    └─ Número de série                                          │
│    └─ Hash de integridade SHA-256                              │
│ 5. Badge de autenticidade confirma diploma válido              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Auditoria e Logging

### Eventos Auditados

| Evento | Descrição |
|--------|-----------|
| MEMBERSHIP_CREATED | Filiação iniciada |
| MEMBERSHIP_PAID | Pagamento recebido |
| MEMBERSHIP_APPROVED | Filiação aprovada |
| MEMBERSHIP_REJECTED | Filiação rejeitada |
| MEMBERSHIP_EXPIRED | Filiação expirada |
| TENANT_REACTIVATED | Tenant reativado via pagamento |
| TENANT_BLOCKED | Tenant bloqueado |
| IMPERSONATION_STARTED | Sessão de impersonation iniciada |
| IMPERSONATION_ENDED | Sessão de impersonation encerrada |
| ROLE_GRANTED | Role atribuída a usuário |
| ROLE_REVOKED | Role revogada de usuário |
| GRADING_RECORDED | Graduação registrada |
| DIPLOMA_ISSUED | Diploma emitido |

### Decision Logs (Segurança)
Sistema de logging imutável com hash chain SHA-256 para decisões críticas de segurança.

---

*Documento atualizado em: 2026-01-29*
*Versão: 1.0*
