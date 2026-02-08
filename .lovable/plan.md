
# PI-D6.1 — Contract & Invariant Verification (E2E + Enforcement)

**Status:** PLAN (Aguardando aprovação)
**Objetivo:** Provar (não assumir) que invariantes do sistema são respeitados em runtime
**Impacto funcional:** Zero
**Risco de regressão:** Muito baixo
**Arquivos a criar:** 3
**Arquivos a modificar:** 2

---

## 1. Análise do Estado Atual

### 1.1 Estrutura de Testes Existente

O projeto já possui uma arquitetura robusta de testes de contrato em `e2e/contract/`:

```text
e2e/contract/
├── README.md                      — Política NEVER REMOVE
├── safe-gold-invariants.spec.ts   — Invariantes SAFE GOLD (C.3.x)
├── tenant-lifecycle.spec.ts       — Lifecycle do tenant (T.C.x)
├── billing-contract.spec.ts       — Billing SAFE GOLD (B.C.x)
├── impersonation-contract.spec.ts — Impersonation (I.C.x)
└── ... (outros contratos)
```

### 1.2 Padrões Observados

| Padrão | Uso |
|--------|-----|
| `freezeTime()` | Tempo determinístico |
| `logTestStep()` / `logTestAssertion()` | Logging estruturado |
| `PROTECTED_TABLES` | Mutation boundary |
| `data-*` selectors | DOM observability |
| `route()` interceptors | Mutation detection |
| `invokeEdgeFunction()` | Teste direto de Edge Functions |

### 1.3 Gaps Identificados

```text
┌────────────────────────────────────────────────────────────────┐
│ GAP 1: TENANT LIFECYCLE GUARD SEM TESTE DE EDGE FUNCTION      │
│                                                                │
│ O tenant-lifecycle.spec.ts testa UI/DOM, mas NÃO testa       │
│ que Edge Functions (generate-digital-card, generate-diploma)  │
│ bloqueiam emissão para tenants SETUP/BLOCKED.                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ GAP 2: FEDERATION GOVERNANCE SEM TESTES E2E                   │
│                                                                │
│ join-federation e leave-federation foram criados no D6.0,    │
│ mas não há testes validando:                                  │
│   - Bloqueio para tenant SETUP                                │
│   - Auditoria com federation_id                               │
│   - Soft history (left_at, não DELETE)                        │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ GAP 3: INVARIANTS.md SEM REFERÊNCIA DE TEST COVERAGE         │
│                                                                │
│ O documento INVARIANTS.md lista invariantes, mas não         │
│ referencia quais testes as validam.                           │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Arquivos a Criar

### 2.1 `e2e/contract/tenant-lifecycle-guard.spec.ts`

**Objetivo:** Validar que Edge Functions respeitam I4 (Tenant Lifecycle)

**Estrutura:**

```text
TG.C — Tenant Lifecycle Guard Contract
│
├── TG.C.1: generate-digital-card BLOCKS for tenant SETUP
│           → Chama Edge Function diretamente
│           → Espera { success: false, code: "TENANT_NOT_ACTIVE" }
│           → HTTP 200 (erro neutro)
│
├── TG.C.2: generate-digital-card BLOCKS for tenant BLOCKED
│           → Mesmo padrão
│
├── TG.C.3: generate-digital-card ALLOWS for tenant ACTIVE
│           → Espera { success: true } (ou erro de billing, não de tenant)
│
├── TG.C.4: generate-diploma BLOCKS for tenant SETUP
│           → Mesmo padrão
│
├── TG.C.5: generate-diploma BLOCKS for tenant BLOCKED
│           → Mesmo padrão
│
├── TG.C.6: Tenant inexistente retorna erro neutro
│           → UUID inválido → success: false
│           → Sem vazamento semântico
│
└── TG.C.7: Todas respostas são HTTP 200
            → Validar que nenhum erro retorna 4xx/5xx
```

**Padrão de implementação:**

```typescript
// Usa securityTestClient.ts para invocar Edge Functions
const { status, data } = await invokeEdgeFunction(
  session,
  'generate-digital-card',
  { membershipId: TEST_MEMBERSHIP_ID }
);

expect(status).toBe(200);
expect(data.success).toBe(false);
expect(data.code).toBe('TENANT_NOT_ACTIVE');
```

---

### 2.2 `e2e/contract/federation-lifecycle.spec.ts`

**Objetivo:** Validar I2 (Federation Governance) e I3 (Audit Trail)

**Estrutura:**

```text
FG.C — Federation Lifecycle Contract
│
├── FG.C.1: join-federation BLOCKS for tenant SETUP
│           → Chama Edge Function
│           → Espera bloqueio com código neutro
│
├── FG.C.2: join-federation BLOCKS for federation INACTIVE
│           → Federation.status !== 'ACTIVE' → bloqueio
│
├── FG.C.3: join-federation RETURNS 403 without role
│           → Sem FED_ADMIN ou ADMIN_TENANT → 403
│
├── FG.C.4: join-federation CREATES audit with federation_id
│           → Após join válido, verifica audit_logs
│           → metadata.federation_id MUST exist
│
├── FG.C.5: join-federation duplicate is idempotent
│           → Segunda chamada retorna neutro, não erro
│
├── FG.C.6: leave-federation SETS left_at (never deletes)
│           → Após leave, verifica:
│           → federation_tenants.left_at IS NOT NULL
│           → Row ainda existe
│
├── FG.C.7: leave-federation CREATES audit with federation_id
│           → metadata.federation_id + metadata.reason
│
├── FG.C.8: leave-federation duplicate is idempotent
│           → Já saiu → retorna neutro
│
└── FG.C.9: DELETE direto via RLS é BLOQUEADO
            → Tenta DELETE em federation_tenants
            → Deve falhar (RLS block)
```

---

### 2.3 `e2e/helpers/edge-function-invoker.ts`

**Objetivo:** Helper centralizado para invocar Edge Functions nos testes

**Funções:**

```typescript
export async function invokeEdgeFunctionWithSetup(
  functionName: string,
  body: Record<string, unknown>,
  options?: {
    tenantLifecycleStatus?: 'SETUP' | 'ACTIVE' | 'BLOCKED';
    userRole?: 'SUPERADMIN' | 'TENANT_ADMIN' | 'FED_ADMIN';
    expectSuccess?: boolean;
    expectCode?: string;
  }
): Promise<EdgeFunctionResult>;

export async function assertEdgeFunctionBlocked(
  functionName: string,
  body: Record<string, unknown>,
  expectedCode: string
): Promise<void>;

export async function assertAuditLogCreated(
  eventType: string,
  tenantId: string,
  requiredMetadataFields: string[]
): Promise<void>;
```

---

## 3. Arquivos a Modificar

### 3.1 `e2e/contract/README.md`

**Adicionar seções para novos contratos:**

```markdown
### `tenant-lifecycle-guard.spec.ts` (PI-D6.1)
- Edge Functions block for tenant SETUP/BLOCKED (I4)
- All errors return HTTP 200 (I6)
- No semantic leakage in error messages

### `federation-lifecycle.spec.ts` (PI-D6.1)
- Federation join/leave require proper roles (I2)
- Audit logs contain federation_id (I3)
- Soft history: left_at instead of DELETE (I2)
- RLS blocks direct DELETE on federation_tenants
```

---

### 3.2 `docs/SECURITY/INVARIANTS.md`

**Adicionar seção "Test Coverage":**

```markdown
---

## Test Coverage

Each invariant is validated by contract tests in `e2e/contract/`:

| Invariant | Test File | Test IDs |
|-----------|-----------|----------|
| I1. Document Validity | `safe-gold-invariants.spec.ts` | C.3.x |
| I2. Federation Governance | `federation-lifecycle.spec.ts` | FG.C.1-9 |
| I3. Audit Trail | `federation-lifecycle.spec.ts` | FG.C.4, FG.C.7 |
| I4. Tenant Lifecycle | `tenant-lifecycle-guard.spec.ts` | TG.C.1-7 |
| I5. RLS Independence | `safe-gold-invariants.spec.ts` | C.3.1, C.3.3 |
| I6. Error Neutrality | `tenant-lifecycle-guard.spec.ts` | TG.C.7 |
| I7. Billing Guard | `billing-contract.spec.ts` | B.C.x |
| I8. Impersonation | `impersonation-contract.spec.ts` | I.C.x |

**Policy:** All invariants MUST have corresponding contract tests.
```

---

## 4. Dependências de Dados

### 4.1 Fixtures Necessárias

Os testes precisam de dados seed para:

| Entidade | Requisito |
|----------|-----------|
| Tenant SETUP | `lifecycle_status = 'SETUP'` |
| Tenant BLOCKED | `lifecycle_status = 'BLOCKED'` |
| Tenant ACTIVE | `lifecycle_status = 'ACTIVE'` |
| Federation ACTIVE | `status = 'ACTIVE'` |
| Federation INACTIVE | `status = 'INACTIVE'` |
| User com FED_ADMIN | `federation_roles.role = 'FED_ADMIN'` |
| User sem role | Usuário autenticado sem papéis |

### 4.2 Estratégia de Seed

Usar `e2e/fixtures/users.seed.ts` existente + criar fixtures específicas via `beforeAll`:

```typescript
let tenantSetup: string;
let tenantBlocked: string;
let federationActive: string;

beforeAll(async () => {
  // Criar ou buscar tenants em estados específicos
  // Usar createTestSupabaseClient() do projeto
});
```

---

## 5. Estrutura Final de Arquivos

```text
e2e/
├── contract/
│   ├── README.md                        [MODIFICAR]
│   ├── tenant-lifecycle-guard.spec.ts   [CRIAR]
│   └── federation-lifecycle.spec.ts     [CRIAR]
├── helpers/
│   └── edge-function-invoker.ts         [CRIAR]
└── fixtures/
    └── (existentes, reutilizar)

docs/SECURITY/
└── INVARIANTS.md                        [MODIFICAR]
```

---

## 6. Critérios de Aceite (SAFE GOLD)

| Critério | Teste | Validação |
|----------|-------|-----------|
| Nenhum bypass de lifecycle | TG.C.1-2, TG.C.4-5 | success: false para SETUP/BLOCKED |
| Nenhuma emissão fora de ACTIVE | TG.C.1-5 | Edge Function retorna bloqueio |
| Nenhuma exclusão física de vínculo | FG.C.6 | left_at preenchido, row existe |
| Auditoria sempre presente | FG.C.4, FG.C.7 | metadata.federation_id obrigatório |
| HTTP neutro em público | TG.C.7 | Todos retornam HTTP 200 |
| Testes determinísticos | Todos | freezeTime(), mocks controlados |

---

## 7. Padrão de Nomenclatura de Testes

Seguindo o padrão existente:

| Prefixo | Domínio |
|---------|---------|
| C.x.x | Core SAFE GOLD |
| T.C.x | Tenant Lifecycle (UI) |
| TG.C.x | Tenant Guard (Edge Functions) |
| FG.C.x | Federation Governance |
| B.C.x | Billing |
| I.C.x | Impersonation |

---

## 8. Fora de Escopo (Hard Freeze)

| Item | Motivo |
|------|--------|
| UX / UI | Este PI é sobre backend |
| Performance | Foco em correção |
| Novas Edge Functions | Apenas testar existentes |
| Refactors cosméticos | Apenas testes |
| Copy / Microcopy | Não aplicável |

---

## 9. Ordem de Execução

```text
1. Criar e2e/helpers/edge-function-invoker.ts
   ↓
2. Criar e2e/contract/tenant-lifecycle-guard.spec.ts
   ↓
3. Criar e2e/contract/federation-lifecycle.spec.ts
   ↓
4. Atualizar e2e/contract/README.md
   ↓
5. Atualizar docs/SECURITY/INVARIANTS.md
```

---

## 10. Resumo Executivo

Este PI transforma o sistema de "bem escrito" para "provado":

1. **Tenant Lifecycle Guard Tests (TG.C):**
   - 7 cenários validando que Edge Functions respeitam I4
   - Testes diretos via API, não via UI
   - Validação de HTTP 200 para erro neutro (I6)

2. **Federation Lifecycle Tests (FG.C):**
   - 9 cenários validando I2 (Governance) e I3 (Audit)
   - Soft history validado (left_at, não DELETE)
   - Auditoria com federation_id obrigatório

3. **Documentação Atualizada:**
   - README.md com novos contratos
   - INVARIANTS.md com test coverage matrix

**Resultado:** Sistema blindado com invariantes executáveis, base sólida para Dia 7 sem medo de regressão estrutural.
