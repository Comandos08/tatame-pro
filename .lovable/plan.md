

# PI-D6.0 — Core Stability & Architecture Hardening

**Status:** PLAN (Aguardando aprovacao)
**Escopo:** Fluxos criticos + blindagem arquitetural
**Impacto funcional:** Baixo (correcoes estruturais, sem features novas)
**Risco de regressao:** Controlado (escopo fechado + criterios explicitos)

---

## 1. Diagnostico do Estado Atual

### 1.1 Arquitetura de Seguranca Existente

O sistema ja possui uma base solida de seguranca documentada em:

```text
docs/
├── SSF-CONSTITUTION.md      — Documento constitucional (imutavel)
├── HARDENING.md             — P3 COMPLETE (v1.4.0)
├── SECURITY-AUTH-CONTRACT.md — Auth state machine
├── SECURITY/threat-model.md — Modelo de ameacas formal
└── SAFE_GOLD/T1.0-*.md      — Contratos de tenant lifecycle
```

### 1.2 Edge Functions Criticas Analisadas

| Funcao | Status | Gaps Identificados |
|--------|--------|-------------------|
| `complete-tenant-onboarding` | ✅ COMPLETO | Contrato explicito, rollback atomico, auditoria |
| `generate-digital-card` | ⚠️ PARCIAL | **NAO valida tenant.status antes de emissao** |
| `generate-diploma` | ⚠️ PARCIAL | Valida billing, mas **NAO valida tenant.lifecycle_status** |
| `verify-document` | ✅ COMPLETO | Usa Golden Rule (isInstitutionalDocumentValid) |
| `verify-digital-card` | ✅ COMPLETO | Usa Golden Rule |
| `resolve-identity-wizard` | ✅ COMPLETO | CREATE_TENANT cria em status=SETUP corretamente |

### 1.3 Invariantes Existentes (Documentadas)

**SAFE GOLD ja define:**
- Tenant lifecycle: SETUP → ACTIVE → BLOCKED
- Mutation boundaries para tabelas protegidas
- Golden Rule para documentos (tenant ACTIVE + billing OK + doc ACTIVE)

**Federation (PI-D5.A):**
- Eventos federativos exigem `federation_id` nos metadados
- Auditoria valida campos obrigatorios

### 1.4 Gaps Criticos Identificados

```text
┌────────────────────────────────────────────────────────────────┐
│ GAP 1: EMISSAO DE DOCUMENTO SEM VALIDACAO DE TENANT STATUS    │
│                                                                │
│ generate-digital-card e generate-diploma NAO verificam se     │
│ tenant.lifecycle_status === 'ACTIVE' antes de emitir.         │
│                                                                │
│ Risco: Documento emitido para tenant em SETUP ou BLOCKED.     │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ GAP 2: FEDERACAO SEM EDGE FUNCTIONS DEDICADAS                 │
│                                                                │
│ federation_tenants (vinculo fed↔org) nao tem Edge Function.   │
│ Operacoes de JOIN/LEAVE podem ocorrer diretamente via RLS.    │
│                                                                │
│ Risco: Historico federativo nao auditado explicitamente.      │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ GAP 3: INVARIANTES NAO CENTRALIZADAS                          │
│                                                                │
│ Invariantes estao espalhadas em docs diferentes.              │
│ Nao existe um INVARIANTS.md canonical.                        │
│                                                                │
│ Risco: Violacao acidental por falta de visibilidade.          │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ GAP 4: CONTRATOS DE EDGE FUNCTIONS NAO DOCUMENTADOS           │
│                                                                │
│ Funcoes criticas nao tem INPUT/PRE/POST documentado inline.   │
│                                                                │
│ Risco: Comportamento inesperado, dificil manutencao.          │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Estrategia de Execucao

### 2.1 Divisao em Sub-PIs

```text
PI-D6.0 (Este Plano)
    │
    ├── PI-D6.1 — Core Stability (Fluxos Criticos)
    │       ├── 6.1.1 — Tenant lifecycle validation em emissao
    │       ├── 6.1.2 — Federation Edge Functions (JOIN/LEAVE)
    │       └── 6.1.3 — Verificacao publica hardening
    │
    └── PI-D6.2 — Architecture Hardening (Contratos e Invariantes)
            ├── 6.2.1 — INVARIANTS.md canonical
            ├── 6.2.2 — Edge Function contracts inline
            └── 6.2.3 — requireTenantActive shared utility
```

---

## 3. Bloco A — Core Stability (PI-D6.1)

### 3.1 Tenant Lifecycle Validation em Emissao

**Problema:**
- `generate-digital-card` e `generate-diploma` NAO verificam `tenant.lifecycle_status`
- Documento pode ser emitido para tenant em SETUP ou BLOCKED

**Solucao:**

Criar utility compartilhada e aplicar em ambas funcoes:

```typescript
// supabase/functions/_shared/requireTenantActive.ts
export async function requireTenantActive(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ allowed: boolean; status: string | null; error?: string }> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('lifecycle_status')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !tenant) {
    return { allowed: false, status: null, error: 'Tenant not found' };
  }

  if (tenant.lifecycle_status !== 'ACTIVE') {
    return { 
      allowed: false, 
      status: tenant.lifecycle_status,
      error: `Tenant not active: ${tenant.lifecycle_status}` 
    };
  }

  return { allowed: true, status: 'ACTIVE' };
}
```

**Aplicacao:**

| Funcao | Alteracao |
|--------|-----------|
| `generate-digital-card` | Adicionar `requireTenantActive()` antes de emissao |
| `generate-diploma` | Adicionar `requireTenantActive()` antes de emissao |

**Resposta para tenant nao-ACTIVE:**
```json
{
  "success": false,
  "error": "Operation blocked",
  "code": "TENANT_NOT_ACTIVE"
}
```

### 3.2 Federation Edge Functions (JOIN/LEAVE)

**Problema:**
- Vinculos `federation_tenants` podem ser criados/removidos diretamente
- Historico federativo nao e auditado explicitamente

**Solucao:**

Criar duas Edge Functions dedicadas:

#### 3.2.1 `join-federation`

```typescript
// supabase/functions/join-federation/index.ts
// CONTRACT:
// INPUT: { tenantId: UUID, federationId: UUID }
// PRE: tenant.lifecycle_status === 'ACTIVE'
// PRE: federation.status === 'ACTIVE'
// PRE: requester has FED_ADMIN or ADMIN_TENANT role
// POST: federation_tenants row created
// POST: audit event TENANT_JOINED_FEDERATION with federation_id
```

#### 3.2.2 `leave-federation`

```typescript
// supabase/functions/leave-federation/index.ts
// CONTRACT:
// INPUT: { tenantId: UUID, federationId: UUID, reason: string }
// PRE: vinculo exists and is ACTIVE
// PRE: requester has FED_ADMIN or ADMIN_TENANT role
// POST: federation_tenants.status = 'LEFT' (soft delete)
// POST: audit event TENANT_LEFT_FEDERATION with federation_id
```

**Principios:**
- NUNCA apagar vinculo (soft history)
- SEMPRE auditar com `metadata.federation_id`
- Estados derivados do historico, nao o contrario

### 3.3 Verificacao Publica Hardening

**Status Atual:** ✅ JA COMPLETO

Ambas funcoes (`verify-document`, `verify-digital-card`) ja seguem:
- HTTP 200 sempre
- Mensagem neutra unica para falha
- Golden Rule aplicada

**Acao:** Apenas validar via E2E que todos os cenarios retornam resposta neutra:
- Token invalido
- Documento inexistente
- Documento revogado
- Tenant bloqueado

---

## 4. Bloco B — Architecture Hardening (PI-D6.2)

### 4.1 INVARIANTS.md Canonical

**Problema:**
Invariantes estao espalhadas em:
- `docs/PRODUCT-SAFETY.md` (invariantes de UX)
- `docs/SSF-CONSTITUTION.md` (principios)
- `e2e/contract/README.md` (invariantes de teste)
- Varias Edge Functions (inline)

**Solucao:**
Criar `docs/SECURITY/INVARIANTS.md` como ponto unico:

```markdown
# TATAME Pro — System Invariants

## I1. Document Validity (Golden Rule)
Documento valido SOMENTE se:
- tenant.lifecycle_status === 'ACTIVE'
- billing.status ∈ ['ACTIVE', 'TRIALING']
- document.status ∈ ['ACTIVE', 'ISSUED']
- document.revoked_at === null

## I2. Federation Governance
- Federacao nunca existe sem federation_roles
- Vinculo tenant↔federation e imutavel (soft history)
- Eventos federativos exigem metadata.federation_id

## I3. Audit Trail
- audit_logs e append-only (DELETE/UPDATE bloqueados)
- Acoes institucionais exigem auditoria
- Eventos federativos exigem federation_id
- Eventos de conselho exigem federation_id + council_id

## I4. Tenant Lifecycle
- Tenant em SETUP: operacoes destrutivas bloqueadas
- Tenant em BLOCKED: todas operacoes bloqueadas
- Transicao SETUP→ACTIVE: atomica com billing bootstrap

## I5. RLS Independence
- Seguranca nunca depende de frontend
- Guards sao defense-in-depth, nao unica camada
- RLS em todas tabelas sensivel

## I6. Error Neutrality (Public Endpoints)
- HTTP 200 sempre em endpoints publicos
- Mensagem neutra unica para qualquer falha
- Zero vazamento semantico
```

### 4.2 Edge Function Contracts Inline

**Problema:**
Funcoes criticas nao tem contrato documentado de forma padronizada.

**Solucao:**
Adicionar JSDoc padronizado no topo de cada funcao critica:

```typescript
/**
 * @contract generate-digital-card
 * 
 * INPUT:
 *   - membershipId: UUID (obrigatorio)
 * 
 * PRECONDITIONS:
 *   - tenant.lifecycle_status === 'ACTIVE'
 *   - billing.status ∈ ['ACTIVE', 'TRIALING']
 *   - membership.payment_status === 'PAID'
 *   - membership.status ∈ ['PENDING_REVIEW', 'APPROVED', 'ACTIVE']
 * 
 * POSTCONDITIONS:
 *   - digital_cards row created
 *   - document_public_tokens row created
 *   - audit event DOCUMENT_ISSUED logged
 * 
 * ERRORS:
 *   - All errors return HTTP 200 with { success: false }
 *   - No stack traces exposed
 */
```

**Funcoes a documentar:**
1. `generate-digital-card`
2. `generate-diploma`
3. `complete-tenant-onboarding`
4. `approve-membership`
5. `verify-document`
6. `start-impersonation`

### 4.3 requireTenantActive Shared Utility

Criar em `supabase/functions/_shared/requireTenantActive.ts`:

```typescript
/**
 * Validates that tenant is in ACTIVE lifecycle status.
 * FAIL-CLOSED: Any error = blocked access.
 * 
 * @usage
 * const check = await requireTenantActive(supabase, tenantId);
 * if (!check.allowed) {
 *   return tenantNotActiveResponse(check.status);
 * }
 */
export async function requireTenantActive(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantActiveCheckResult>;

export function tenantNotActiveResponse(
  status: string | null
): Response;
```

---

## 5. Arquivos a Criar/Modificar

### 5.1 Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `docs/SECURITY/INVARIANTS.md` | Invariantes canonicas centralizadas |
| `supabase/functions/_shared/requireTenantActive.ts` | Utility para validar tenant ACTIVE |
| `supabase/functions/join-federation/index.ts` | Edge Function para vinculo fed↔org |
| `supabase/functions/leave-federation/index.ts` | Edge Function para saida de federacao |

### 5.2 Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/generate-digital-card/index.ts` | Adicionar requireTenantActive + contrato JSDoc |
| `supabase/functions/generate-diploma/index.ts` | Adicionar requireTenantActive + contrato JSDoc |
| `supabase/functions/complete-tenant-onboarding/index.ts` | Adicionar contrato JSDoc (ja tem logica ok) |
| `supabase/functions/approve-membership/index.ts` | Adicionar contrato JSDoc |
| `supabase/functions/verify-document/index.ts` | Adicionar contrato JSDoc (ja tem logica ok) |
| `supabase/functions/start-impersonation/index.ts` | Adicionar contrato JSDoc |

### 5.3 Arquivos de Teste

| Arquivo | Descricao |
|---------|-----------|
| `e2e/contract/tenant-active-guard.spec.ts` | Validar que emissao bloqueia para SETUP/BLOCKED |
| `e2e/contract/federation-lifecycle.spec.ts` | Validar JOIN/LEAVE e auditoria |

---

## 6. Criterios de Aceite (SAFE GOLD)

| Criterio | Validacao |
|----------|-----------|
| Fluxos criticos previsiveis | Nenhuma emissao para tenant nao-ACTIVE |
| Nenhuma decisao implicita | Todos contratos documentados inline |
| Seguranca independente de UI | requireTenantActive no backend |
| Auditoria obrigatoria | JOIN/LEAVE federativos auditados |
| Erros neutros | Verificacao publica nao vaza info |
| Sistema extensivel | INVARIANTS.md canonical |

---

## 7. Ordem de Execucao

```text
PI-D6.1.1 — requireTenantActive utility
    ↓
PI-D6.1.2 — Aplicar em generate-digital-card e generate-diploma
    ↓
PI-D6.1.3 — Edge Functions join-federation e leave-federation
    ↓
PI-D6.2.1 — INVARIANTS.md canonical
    ↓
PI-D6.2.2 — Contratos JSDoc em Edge Functions
    ↓
E2E — tenant-active-guard.spec.ts e federation-lifecycle.spec.ts
```

---

## 8. Fora de Escopo (Hard Freeze)

| Item | Motivo |
|------|--------|
| UX / UI | Nao e objetivo deste PI |
| Microcopy | Nao e objetivo deste PI |
| Layout | Nao e objetivo deste PI |
| Novos dashboards | Nao e objetivo deste PI |
| Features novas | Este PI remove fragilidade, nao adiciona funcionalidade |
| Otimizacao prematura | Foco em correcao, nao performance |

---

## 9. Proximo Passo

Se aprovado, execucao sera feita em etapas:

1. **PI-D6.1.1** — Criar `requireTenantActive.ts`
2. **PI-D6.1.2** — Aplicar em `generate-digital-card` e `generate-diploma`
3. **PI-D6.1.3** — Criar Edge Functions de federacao
4. **PI-D6.2.1** — Criar `INVARIANTS.md`
5. **PI-D6.2.2** — Documentar contratos JSDoc
6. **E2E** — Testes de contrato

Cada etapa sera um PI menor, testavel e reversivel.

---

## Resumo Executivo

Este PI consolida a estabilidade arquitetural do Tatame atraves de:

1. **Core Stability (D6.1):**
   - Validacao de tenant.lifecycle_status antes de emissao de documentos
   - Edge Functions dedicadas para governanca federativa (JOIN/LEAVE)
   - Confirmacao de hardening em verificacao publica

2. **Architecture Hardening (D6.2):**
   - INVARIANTS.md canonical centralizado
   - Contratos JSDoc padronizados em Edge Functions
   - Utility compartilhada `requireTenantActive`

**Impacto funcional:** Baixo (correcoes estruturais)
**Arquivos criados:** 4
**Arquivos modificados:** 6
**Risco de regressao:** Controlado (SAFE GOLD)

