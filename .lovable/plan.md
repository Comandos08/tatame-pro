

# PI U1 — SINGLE SOURCE OF TRUTH (Contrato de Verdade do Sistema)

## 1. Entidades Canonicas e seus Contratos

---

### 1.1 TENANT

**Existencia**: Registro na tabela `tenants` com `id` valido.

**Estados validos (enum `TenantLifecycleStatus`)**:

| Estado | Significado Institucional |
|--------|--------------------------|
| SETUP | Tenant criado, onboarding incompleto. Nao pode operar. |
| ACTIVE | Tenant operacional. Unico estado que permite emissao de documentos e operacoes completas. |
| BLOCKED | Tenant suspenso, pendente de exclusao ou inadimplente. Acesso bloqueado. |

**Mapeamento de producao**: Estados legados (SUSPENDED, PENDING_DELETE) sao normalizados para BLOCKED via `PROD_TENANT_TO_SAFE` em `src/domain/tenant/normalize.ts`.

**Transicoes permitidas**:
```text
SETUP --> ACTIVE    (via Edge Function complete-tenant-onboarding)
ACTIVE --> BLOCKED  (via billing lifecycle ou acao administrativa)
BLOCKED --> ACTIVE  (via regularizacao de billing ou override manual)
```

**Onde vive**: `tenants.lifecycle_status` (banco de dados)
**Como e carregado**: `TenantContext` (provider React)
**Onde e derivado**: `assertTenantLifecycleState()` em `src/domain/tenant/normalize.ts`
**Onde e consumido**: `resolveAccess()` (campo `tenantStatus`), `isInstitutionalDocumentValid()`, guards de rota

**Ponto de decisao**: `resolveAccess()` em `src/lib/access/resolveAccess.ts` (STEP 4: Tenant Context Check). Nenhum componente decide se o tenant esta ativo.

---

### 1.2 USER / PROFILE

**Existencia**: Registro em `auth.users` (sessao) + `profiles` (dados do sistema).

**Estados validos**:

| Estado | Significado |
|--------|------------|
| UNAUTHENTICATED | Sem sessao ativa |
| LOADING | Sessao sendo resolvida (transitorio, max 12s) |
| WIZARD_REQUIRED | Autenticado, sem tenant/role associado |
| SUPERADMIN | Identidade resolvida como SUPERADMIN_GLOBAL |
| RESOLVED | Identidade resolvida com tenant e role |
| ERROR | Falha na resolucao (sempre com escape hatch) |

**Enum formal**: `IdentityState` em `src/lib/identity/identity-state-machine.ts`

**Transicoes permitidas**: Definidas explicitamente em `VALID_IDENTITY_TRANSITIONS`. LOADING nunca e terminal (protegido por timeout de 12s).

**Onde vive**: `auth.users` (sessao), `profiles` (perfil)
**Como e carregado**: `AuthContext` (sessao + perfil), `IdentityContext` (resolucao de identidade)
**Onde e derivado**: `resolveIdentityState()` -- funcao pura, sem side effects
**Onde e consumido**: `useAccessResolver()` -> `resolveAccess()` (STEP 1 e 2)

**Ponto de decisao**: `resolveIdentityState()` para estado de identidade. `AuthContext.isAuthenticated` para sessao (baseado em sessao, nunca em perfil).

---

### 1.3 ROLE (Papel)

**Existencia**: Registro na tabela `user_roles` com `user_id` + `role` + `tenant_id`.

**Estados validos (enum `AppRole`)**:

| Papel | Escopo | Significado |
|-------|--------|------------|
| SUPERADMIN_GLOBAL | Global (tenant_id = null) | Administrador da plataforma |
| ADMIN_TENANT | Tenant-scoped | Gestor da organizacao |
| ATLETA | Tenant-scoped | Membro/atleta registrado |

**Nenhum outro papel existe.** O trigger `trg_enforce_canonical_roles` bloqueia qualquer atribuicao fora destes tres no banco de dados. O tipo TypeScript `AppRole` impoe a mesma restricao no frontend.

**Transicoes**: Papeis sao atribuidos atomicamente pela Edge Function de aprovacao de membership. Nao ha estados intermediarios.

**Onde vive**: `user_roles` (banco de dados)
**Como e carregado**: `useTenantRoles(tenantId)` via React Query
**Onde e derivado**: Nao e derivado -- e leitura direta da tabela
**Onde e consumido**: `resolveAccess()` (STEP 6: Role Check), `RequireRoles`, `usePermissions()`

**Ponto de decisao**: `resolveAccess()` para acesso a rotas. `useAccessContract()` (RPC `list_allowed_features`) para features especificas. `can.ts` e somente UX (apresentacao).

---

### 1.4 MEMBERSHIP (Filiacao)

**Existencia**: Registro na tabela `memberships`.

**Estados validos (enum `MembershipStatus`)**:

| Estado | Significado | Permite Acesso? | Permite Operacao? |
|--------|------------|-----------------|-------------------|
| DRAFT | Rascunho iniciado, nao submetido | Nao | Nao |
| PENDING_PAYMENT | Aguardando pagamento | Nao | Nao |
| PENDING_REVIEW | Submetido, aguardando aprovacao admin | Nao | Nao |
| APPROVED | Aprovado, pre-ativacao | Nao | Nao |
| ACTIVE | Filiacao ativa e operacional | Sim | Sim |
| EXPIRED | Periodo de validade encerrado | Parcial (historico) | Nao |
| CANCELLED | Cancelamento com motivo obrigatorio | Nao | Nao |

**Transicoes**: DRAFT -> PENDING_PAYMENT -> PENDING_REVIEW -> APPROVED -> ACTIVE -> EXPIRED/CANCELLED. A aprovacao (APPROVED -> ACTIVE) e atomica e atribui o role canonico.

**Onde vive**: `memberships` (banco de dados)
**Como e carregado**: Queries diretas ao banco via React Query
**Onde e derivado**: `PortalAccessGate` mapeia status para feedback UX
**Onde e consumido**: Portal do Atleta, fluxos de aprovacao admin

**Ponto de decisao**: Edge Function de aprovacao (backend) para transicoes. `PortalAccessGate` para visibilidade no portal.

---

### 1.5 BILLING STATUS (Faturamento)

**Existencia**: Registro na tabela `tenant_billing` vinculado ao tenant.

**Estados validos (enum `BillingStatus`)**:

| Estado | Significado | Acesso | Operacoes Sensiveis |
|--------|------------|--------|---------------------|
| ACTIVE | Pagamento em dia | Total | Sim |
| TRIALING | Trial ativo (7 dias) | Total | Sim |
| TRIAL_EXPIRED | Grace period (8 dias) | Leitura | Nao |
| PAST_DUE | Pagamento atrasado | Leitura | Nao |
| CANCELED | Cancelado | Bloqueado | Nao |
| PENDING_DELETE | Aguardando exclusao | Bloqueado | Nao |
| UNPAID | Inadimplente | Bloqueado | Nao |
| INCOMPLETE | Dados insuficientes / fallback | Bloqueado | Nao |

**Regra imutavel**: Se `is_manual_override = true`, Stripe e completamente ignorado.

**Fallback**: Ausencia de registro = INCOMPLETE (restritivo). Nunca assume "ok".

**Onde vive**: `tenant_billing` (banco de dados)
**Como e carregado**: `useTenantStatus()`, `useTenantFlagsContract()` (RPC `get_tenant_flags_contract`)
**Onde e derivado**: `resolveTenantBillingState()` em `src/lib/billing/resolveTenantBillingState.ts` -- funcao pura
**Onde e consumido**: `resolveAccess()` (STEP 7: Billing Check), `BillingGate`, banners de billing

**Ponto de decisao**: `resolveTenantBillingState()` para derivacao de flags. `resolveAccess()` para bloqueio de rota. Backend (Edge Functions com `requireTenantActive`) para bloqueio de operacoes.

---

### 1.6 FEATURE AVAILABILITY (Acesso a Funcionalidades)

**Existencia**: Registro na tabela `feature_access` no banco de dados.

**Estados validos**: Binario -- a feature esta no conjunto retornado ou nao.

| Situacao | Significado |
|----------|------------|
| Feature presente no Set | Acesso permitido |
| Feature ausente | Acesso negado |
| Loading | Acesso negado (fail-closed) |
| Erro na RPC | Acesso negado (fail-closed) |

**Onde vive**: `feature_access` (banco de dados)
**Como e carregado**: `useAccessContract(tenantId)` via RPC `list_allowed_features`
**Onde e derivado**: Nao e derivado -- e leitura direta + Set
**Onde e consumido**: `RequireFeature` (guard), `usePermissions()` (hook), `useCanAccess()` (hook)

**Ponto de decisao**: `useAccessContract.can(featureKey)` -- fail-closed. `RequireFeature` como guard de renderizacao. O componente `can.ts` e somente apresentacao UX.

---

## 2. Separacao: Verdade vs Visibilidade vs Capacidade

```text
+-------------------+-------------------------------+---------------------------+
| Camada            | Responsabilidade              | Quem decide               |
+-------------------+-------------------------------+---------------------------+
| VERDADE           | Estado canonico da entidade    | Banco de dados + RPC      |
| (Backend/Contrato)| Existe? Qual estado? Valido?  | Edge Functions            |
|                   |                               | Funcoes puras (resolvers) |
+-------------------+-------------------------------+---------------------------+
| VISIBILIDADE      | O que o usuario ve            | Guards (resolveAccess)    |
| (Frontend/Guard)  | Tela de bloqueio? Loader?     | Gates (RequireFeature,    |
|                   | Mensagem de erro?             |   BillingGate, etc.)      |
+-------------------+-------------------------------+---------------------------+
| CAPACIDADE        | O que o usuario pode fazer    | Backend (RLS + Edge Fn)   |
| (Operacional)     | Pode aprovar? Pode emitir?    | resolveTenantBillingState |
|                   | Pode criar?                   | isInstitutionalDocValid   |
+-------------------+-------------------------------+---------------------------+
```

**Regra absoluta**: Um componente de UI NUNCA infere estado. Ele recebe estado resolvido e renderiza. A cadeia e sempre: Banco -> Hook/Provider -> Resolver (funcao pura) -> Guard -> Componente.

---

## 3. Cadeia de Resolucao (Single Point of Decision)

```text
Auth (sessao)
  |
  v
IdentityContext (resolveIdentityState)
  |
  v
TenantContext (tenant + lifecycle)
  |
  v
useTenantFlagsContract (onboarding + billing flags)
  |
  v
useAccessResolver --> resolveAccess() [FUNCAO PURA - SINGLE POINT]
  |
  +-- STEP 0: Loading consolidado
  +-- STEP 1: Autenticacao
  +-- STEP 2: Erro de identidade
  +-- STEP 3: Wizard
  +-- STEP 4: Tenant (existencia + status)
  +-- STEP 5: Onboarding
  +-- STEP 6: Role
  +-- STEP 7: Billing
  |
  v
AccessResult: ALLOWED | LOADING | DENIED(reason) | ERROR(debugCode)
```

**Proibicoes**:
- Nenhum componente pode chamar `supabase.from('user_roles')` para decidir acesso
- Nenhum componente pode inferir billing por `if (!billing)` 
- Nenhuma pagina pode decidir visibilidade com `if (!tenant) return null`
- Nenhum guard pode inventar estados fora dos enums canonicos

---

## 4. Mapa Tecnico Consolidado

| Entidade | Tabela | Hook/Provider | Resolver (funcao pura) | Consumidor final |
|----------|--------|---------------|----------------------|------------------|
| Tenant | `tenants` | `TenantContext` | `assertTenantLifecycleState()` | `resolveAccess()` STEP 4 |
| User/Identity | `auth.users` + `profiles` | `AuthContext` + `IdentityContext` | `resolveIdentityState()` | `resolveAccess()` STEP 1-3 |
| Role | `user_roles` | `useTenantRoles()` | (leitura direta) | `resolveAccess()` STEP 6 |
| Membership | `memberships` | React Query direto | `PortalAccessGate` | Portal do Atleta |
| Billing | `tenant_billing` | `useTenantStatus()` + `useTenantFlagsContract()` | `resolveTenantBillingState()` | `resolveAccess()` STEP 7 |
| Feature | `feature_access` | `useAccessContract()` | RPC `list_allowed_features` | `RequireFeature`, `usePermissions()` |
| Documento | (digital_cards, diplomas) | React Query direto | `isInstitutionalDocumentValid()` | Verificacao publica, emissao |

---

## 5. Regras de Validade Cruzada (Golden Rules)

### Documento Institucional Valido (Golden Rule)
Exige simultaneamente:
1. Tenant = ACTIVE
2. Billing = ACTIVE ou TRIALING
3. Documento = ACTIVE ou ISSUED
4. revoked_at = null

Funcao: `isInstitutionalDocumentValid()` em `src/lib/institutional/isDocumentValid.ts`. Unica fonte de verdade. Espelhada no banco via `public.is_institutional_document_valid`.

### Acesso a Rota (Access Contract)
Sequencia fixa em `resolveAccess()`: Auth -> Identity -> Tenant -> Onboarding -> Role -> Billing. Resultado: ALLOWED ou DENIED com motivo explicito.

### Flags Criticas do Tenant (B2 Contract)
RPC `get_tenant_flags_contract` retorna snapshot atomico de onboarding + billing. Validado por `validateContract()`. Fallback e sempre restritivo (`UNKNOWN`).

---

## 6. Estados Proibidos (Anti-patterns)

| Anti-pattern | Contrato violado | O que fazer |
|--------------|-----------------|-------------|
| `if (!tenant) return null` | Visibilidade silenciosa | Usar `<LoadingState>` (PI B1) |
| `if (!data)` para decidir acesso | Inferencia por ausencia | Usar `asyncState.state` explicito |
| `if (someRole === 'STAFF_ORGANIZACAO')` | Role inexistente | `AppRole` impede em compilacao |
| `setTimeout` em fluxo de auth | Nao-determinismo | Await explicito (PI Z0.4) |
| Mensagem hardcoded em erro de seguranca | Error Contract E2 | Chave i18n canonica (PI Z0.5) |
| `localStorage` para checar admin | Bypass de seguranca | `useCurrentUser().isGlobalSuperadmin` |
| Feature check via `accessMatrix` local | Decisao local | `useAccessContract().can()` (backend) |

---

## 7. Resumo Executivo

Este contrato formaliza que:

1. **Seis entidades** possuem contratos de verdade: Tenant, User/Identity, Role, Membership, Billing e Feature.
2. **Cada entidade** tem estados fechados (enum), transicoes explicitas e um unico ponto de decisao.
3. **Verdade** vive no banco. **Visibilidade** e decidida por guards/resolvers puros. **Capacidade** e imposta pelo backend (RLS + Edge Functions).
4. **Nenhum componente de UI** infere, calcula ou decide estado. Ele recebe e renderiza.
5. O sistema opera em **fail-closed**: loading, erro ou ausencia de dados = bloqueio. Nunca acesso.

Este documento e referencia. Nao prescreve implementacao. A execucao de cada contrato ja esta nos resolvers puros listados acima.
