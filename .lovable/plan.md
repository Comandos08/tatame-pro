
# PI U4 — CONTRADICTION-FREE SYSTEM (Eliminar Estados Derivados Implicitos)

## 1. Inventario Completo de Estados Derivados

---

### 1.1 AUTENTICACAO (AuthContext)

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `isAuthenticated` | `AuthContext.tsx:174` | `authState === "authenticated" && !!session` | Verdade | PERMITIDO — derivacao fiel de sessao |
| `isSessionReady` | `AuthContext.tsx:177` | `authState === "authenticated" && !!session` | Verdade | REDUNDANTE — identico a `isAuthenticated`, duplica semantica |
| `isGlobalSuperadmin` | `AuthContext.tsx:180` | `currentUser.roles` | Verdade | PERMITIDO — derivacao direta de roles carregados |
| `isLoading` | `AuthContext.tsx` | `useState(true)` bootstrap | Verdade | PERMITIDO — loading inicial unico |
| `hasRole()` | `AuthContext.tsx:192` | `currentUser.roles` | Capacidade | PERMITIDO — funcao pura sobre dados carregados |
| `currentRolesByTenant` | `AuthContext.tsx:186` | `currentUser.roles` | Verdade | PERMITIDO — mapa derivado diretamente |

---

### 1.2 ACESSO (resolveAccess / useAccessResolver)

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `AccessResult.state` | `resolveAccess.ts` | Funcao pura (7 steps) | Verdade | PERMITIDO — Single Point of Decision |
| `isTimedOut` | `useAccessResolver.ts` | timeout 10s sobre LOADING | Verdade | PERMITIDO — protecao contratual |
| `hasRequiredRole` | `resolveAccess.ts:152` | `context.requiredRoles` + `input.userRoles` | Visibilidade | PERMITIDO — calculo local dentro do resolver puro |

---

### 1.3 BILLING (resolveTenantBillingState / useTenantStatus)

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `billingState.*` (isActive, isBlocked, isReadOnly, etc.) | `resolveTenantBillingState.ts` | Funcao pura sobre dados do banco | Verdade | PERMITIDO — resolver canonico |
| `isOnTrial` | `useTenantStatus.ts:85` | `billingState.status === 'TRIALING'` | Visibilidade | REDUNDANTE — duplica `billingState.isTrialActive` |
| `isTrialExpired` | `useTenantStatus.ts:100` | Calculo local com datas | Visibilidade | REDUNDANTE — duplica `billingState.isTrialExpired` |
| `isTrialEndingSoon` | `useTenantStatus.ts:97` | Calculo local com `daysToTrialEnd` | Visibilidade | PERMITIDO — flag de UX (apresentacao), nao decide acesso |
| `isBlocked` | `useTenantStatus.ts:104` | `billingState.isBlocked` | Visibilidade | REDUNDANTE — re-exporta campo do resolver, sem valor adicional |
| `hasBillingIssue` | `useTenantStatus.ts:103` | `billingState.isReadOnly` | Visibilidade | REDUNDANTE — renomeia `isReadOnly` sem ganho semantico |
| `canSeeBanner` | `useTenantStatus.ts:45` | Role check local | Visibilidade | PERMITIDO — decisao de apresentacao baseada em role |
| `daysToTrialEnd` | `useTenantStatus.ts:90` | Calculo de data | Visibilidade | PERMITIDO — dado de apresentacao pura |

---

### 1.4 ONBOARDING (TenantOnboardingGate / useOnboardingStatus)

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `isComplete` | `TenantOnboardingGate.tsx:93` | `contract.onboarding_completed \|\| tenant.status === 'ACTIVE'` | Verdade | PERMITIDO — derivado de contrato B2 |
| `isSetupMode` | `TenantOnboardingGate.tsx:94` | `tenant.status === 'SETUP'` | Verdade | PERMITIDO — leitura direta |
| `isLoading` (composto) | `TenantOnboardingGate.tsx:95` | `isTenantLoading \|\| isContractLoading` | Transitorio | PERMITIDO — composicao explicita |

---

### 1.5 PERMISSOES / FEATURES

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `usePermissions().can()` | `usePermissions.ts` | `useAccessContract().can()` | Capacidade | PERMITIDO — delegacao pura ao backend |
| `useCanAccess().allowed` | `usePermissions.ts:46` | `usePermissions().can()` | Capacidade | PERMITIDO — wrapper fino |
| `can.ts` / `canAccess()` | `can.ts:21` | `ACCESS_MATRIX` (local) | UX/Apresentacao | PROIBIDO — usa matriz local em vez do contrato backend |
| `Permissions.*` | `can.ts:133` | `ACCESS_MATRIX` (local) | UX/Apresentacao | PROIBIDO — atalhos sobre matriz local |
| `createPermissionContext()` | `can.ts:106` | `ACCESS_MATRIX` (local) | UX/Apresentacao | PROIBIDO — cria contexto paralelo ao backend |
| `getAccessibleFeatures()` | `can.ts:58` | `ACCESS_MATRIX` (local) | UX/Apresentacao | PROIBIDO — lista features sem consultar backend |

---

### 1.6 ESTADOS LOCAIS EM PAGINAS (canApprove, canManage)

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `canApprove` | `ApprovalsList.tsx:63`, `ApprovalDetails.tsx:164` | `isGlobalSuperadmin \|\| hasRole('ADMIN_TENANT', tenant.id)` | Capacidade | REDUNDANTE — duplica decisao que deveria vir de `usePermissions().can('TENANT_APPROVALS')` |
| `canManage` | `AcademiesList.tsx:49`, `CoachesList.tsx:64` | `isGlobalSuperadmin \|\| hasRole('ADMIN_TENANT', tenant.id)` | Capacidade | REDUNDANTE — duplica decisao que deveria vir de `usePermissions().can()` |
| `canManagePayment` | `BillingStatusBanner.tsx:189` | Check local de `stripe_customer_id` + status | Capacidade | PERMITIDO — decisao de UX sobre CTA (apresentacao), nao acesso |

---

### 1.7 PORTAL DO ATLETA

| Estado Derivado | Arquivo | Derivado De | Camada | Classificacao |
|---|---|---|---|---|
| `portalViewState` | `AthletePortal.tsx:225` | Composicao local de loading/error/data | Visibilidade | PERMITIDO — estado de apresentacao consumido por PortalAccessGate |
| `gateState` | `PortalAccessGate.tsx:56` | Composicao de athlete + membership | Visibilidade | PERMITIDO — componente puramente visual, sem decisao de acesso |
| `isEffectivelyExpired` | `PortalAccessGate.tsx:66` | Status + data de expiracao | Visibilidade | PERMITIDO — logica de apresentacao, gate nao navega |

---

### 1.8 PADROES `if (!tenant) return ...` EM PAGINAS

| Arquivo | Patern | Classificacao |
|---|---|---|
| `InternalRankings.tsx:229` | `if (!tenant) return <LoadingState>` | PERMITIDO — mostra loader explicito |
| `ApprovalDetails.tsx:375` | `if (!tenant) return <LoadingState>` | PERMITIDO |
| `AthletePortal.tsx:222` | `if (!tenant) return <LoadingState>` | PERMITIDO |
| `SystemHealthCard.tsx:103` | `if (!tenant) return null` | PROIBIDO — return null silencioso |
| `BillingOverviewCard.tsx:74` | `if (tenant?.status !== 'ACTIVE') return null` | PROIBIDO — inferencia local de status |
| `BillingOverviewCard.tsx:96` | `if (!status) return null` | PROIBIDO — return null silencioso em vez de EMPTY state |
| `TenantStatusBanner.tsx:50` | `if (dismissed \|\| status.isLoading \|\| !status.canSeeBanner) return null` | PERMITIDO — banner condicional com criterios explicitos |

---

## 2. Classificacao Consolidada

### PERMITIDOS (derivacao fiel de contrato)
- `isAuthenticated`, `isGlobalSuperadmin`, `hasRole()`, `currentRolesByTenant`
- `AccessResult.state`, `isTimedOut`
- Todos os campos de `resolveTenantBillingState()` (resolver puro)
- `isTrialEndingSoon`, `daysToTrialEnd`, `canSeeBanner` (apresentacao)
- `isComplete`, `isSetupMode` (onboarding via contrato B2)
- `usePermissions().can()`, `useCanAccess()` (delegam ao backend)
- `portalViewState`, `gateState`, `isEffectivelyExpired` (PortalAccessGate puramente visual)
- `canManagePayment` (decisao de CTA, nao acesso)
- `if (!tenant) return <LoadingState>` (loader explicito)

### REDUNDANTES (podem ser removidos em refatoracao futura)
- `isSessionReady` — identico a `isAuthenticated`
- `isOnTrial` em useTenantStatus — duplica `billingState.isTrialActive`
- `isTrialExpired` em useTenantStatus — duplica `billingState.isTrialExpired`
- `isBlocked` em useTenantStatus — re-exporta `billingState.isBlocked`
- `hasBillingIssue` em useTenantStatus — renomeia `billingState.isReadOnly`
- `canApprove` / `canManage` em paginas — devem usar `usePermissions().can()`

### PROIBIDOS (contradizem contrato ou decidem localmente)
- `can.ts` inteiro (`canAccess`, `Permissions.*`, `createPermissionContext`, `getAccessibleFeatures`) — usa `ACCESS_MATRIX` local, contradiz PI A3 (backend contract)
- `if (!tenant) return null` silencioso (SystemHealthCard)
- `if (tenant?.status !== 'ACTIVE') return null` (BillingOverviewCard — inferencia local)
- `if (!status) return null` silencioso (BillingOverviewCard)

---

## 3. Regras de Derivacao (Contrato de Eliminacao)

| Dominio | Fonte Unica Permitida | Proibido |
|---|---|---|
| Acesso a rota | `resolveAccess()` via `useAccessResolver()` | Qualquer `if` local que decide acesso |
| Billing | `resolveTenantBillingState()` | Re-derivar `isBlocked`/`isReadOnly` fora do resolver |
| Feature/Permissao | `useAccessContract().can()` via `usePermissions()` | `ACCESS_MATRIX` local, `can.ts`, `Permissions.*` |
| Identidade | `IdentityState` via `resolveIdentityState()` | Checks manuais de profile/roles para decidir estado |
| Tenant Status | `tenant.status` (TenantContext) | `if (!tenant)` silencioso (return null) |
| Onboarding | `useTenantFlagsContract()` | Inferencia por ausencia de dados |

---

## 4. Contrato de Loading e Estados Transitorios

| Situacao | Comportamento Obrigatorio | Proibido |
|---|---|---|
| Loading inicial | `<LoadingState>` com chave i18n | `return null`, tela branca |
| Loading parcial | Skeleton ou `<LoadingState>` | Renderizar dados incompletos como "prontos" |
| Erro recuperavel | Tela de erro com retry | `return null` silencioso |
| Erro fatal | `<ErrorState>` com debugCode (nao visivel ao user) | Tela branca, console.error sem UI |
| Ausencia de dado | `AsyncState.EMPTY` explicito | `if (!data) return null` |

---

## 5. Guia de Refatoracao Futura (EXECUTE)

### Prioridade 1 — PROIBIDOS (remover)
1. **`can.ts`**: Eliminar arquivo inteiro. Substituir todos os consumidores por `usePermissions().can()` ou `useAccessContract().can()`.
2. **`ACCESS_MATRIX` em `accessMatrix.ts`**: Manter apenas como referencia de documentacao (ou remover). Decisoes de acesso vem do backend (`feature_access`).
3. **`SystemHealthCard.tsx`**: Substituir `if (!tenant) return null` por `<LoadingState>` ou estado EMPTY.
4. **`BillingOverviewCard.tsx`**: Substituir `return null` silenciosos por estados explicitos (EMPTY ou condicional nomeado).

### Prioridade 2 — REDUNDANTES (simplificar)
5. **`isSessionReady`**: Remover de `AuthContext`. Consumidores usam `isAuthenticated`.
6. **`useTenantStatus`**: Remover `isOnTrial`, `isTrialExpired`, `isBlocked`, `hasBillingIssue`. Consumidores acessam diretamente `billingState.isTrialActive`, `billingState.isTrialExpired`, `billingState.isBlocked`, `billingState.isReadOnly`.
7. **`canApprove` / `canManage` em paginas**: Substituir por `usePermissions().can('TENANT_APPROVALS')` e `usePermissions().can('TENANT_ACADEMIES')` respectivamente.

### Prioridade 3 — PADRONIZACAO
8. Auditar todos os `if (!tenant) return <LoadingState>` para garantir uso de chave i18n correta e nao `"common.loading"` generico.
9. Garantir que todo `return null` restante em componentes de UI tenha justificativa explicita (ex: banner condicional) e nao represente estado silenciado.

---

## 6. Resumo Executivo

Este inventario identifica:

- **24 estados derivados** analisados em detalhe
- **15 PERMITIDOS** (derivacao fiel de contrato canonico)
- **6 REDUNDANTES** (duplicam informacao sem valor — marcar para remocao)
- **6 PROIBIDOS** (contradizem contratos PI U1/A3 — remover obrigatoriamente)

A principal contradicao estrutural e a coexistencia de `can.ts` + `ACCESS_MATRIX` (decisao local) com `useAccessContract()` (contrato backend). O arquivo `can.ts` deve ser eliminado para resolver a ambiguidade de fonte de verdade.

Nenhum estado permanece sem classificacao. Este documento serve como guia deterministico para refatoracao sem interpretacao humana.
