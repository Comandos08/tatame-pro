
# PI-ONB-001 — Correção Definitiva do Onboarding para Tenant Existente

## Resumo

Este PI implementa o suporte para entrada de atletas em organizações existentes através do Identity Wizard. A solução adiciona uma nova action `JOIN_EXISTING_TENANT` à Edge Function `resolve-identity-wizard`, separando claramente as intenções de "criar organização" e "entrar em organização existente".

---

## Arquitetura da Solução

```text
ANTES (Bloqueado)
─────────────────────────────────────────────
UI: joinMode="existing" + inviteCode="tier-one"
     │
     ▼
Edge Function: COMPLETE_WIZARD
     │
     ▼
❌ ERRO: "Only 'new' organization mode is supported"


DEPOIS (Funcional)
─────────────────────────────────────────────
UI: "Criar nova organização"       UI: "Entrar em organização existente"
     │                                   │
     ▼                                   ▼
action: CREATE_TENANT              action: JOIN_EXISTING_TENANT
     │                                   │
     ▼                                   ▼
Cria tenant + ADMIN_TENANT         Valida slug + PENDING_REVIEW membership
     │                                   │
     ▼                                   ▼
Redirect: /{slug}/app/onboarding   Redirect: /{slug}/membership/status
```

---

## Escopo de Implementação

### 1. Banco de Dados — Índice de Idempotência

Criar índice parcial único para garantir que um usuário não possa ter múltiplas solicitações ativas/pendentes no mesmo tenant:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_applicant_active_or_pending
ON public.memberships (tenant_id, applicant_profile_id)
WHERE status IN ('PENDING_REVIEW', 'ACTIVE', 'APPROVED');
```

### 2. Edge Function — `resolve-identity-wizard`

#### 2.1 Atualizar Types

```typescript
// Antes
type Action = "CHECK" | "COMPLETE_WIZARD";

// Depois
type Action = 
  | "CHECK" 
  | "CREATE_TENANT" 
  | "JOIN_EXISTING_TENANT" 
  | "ACCEPT_INVITE"    // Stub para futuro
  | "COMPLETE_WIZARD"; // Compatibilidade temporária
```

#### 2.2 Atualizar Router de Ações

O router será expandido para:
- `CHECK` → Mantém comportamento atual (read-only)
- `CREATE_TENANT` → Nova action, lógica idêntica ao `handleWizardCompletion` atual
- `JOIN_EXISTING_TENANT` → Nova action para entrada em tenant existente
- `ACCEPT_INVITE` → Stub retornando NOT_IMPLEMENTED
- `COMPLETE_WIZARD` → Compatibilidade: roteia para CREATE_TENANT ou JOIN_EXISTING_TENANT baseado no joinMode

#### 2.3 Implementar `handleJoinExistingTenant`

Esta função:
1. Valida formato do código/slug (letras, números, hífen, 3-64 chars)
2. Busca tenant por slug (case-insensitive via `ilike`)
3. Valida que tenant está com `status = 'ACTIVE'`
4. Verifica se já existe membership do usuário neste tenant
5. Cria membership com `status = 'PENDING_REVIEW'`
6. Marca `wizard_completed = true` no profile (sem setar `tenant_id`)
7. Registra audit log
8. Retorna redirect para `/{slug}/membership/status`

#### 2.4 Renomear Handler Existente

- `handleWizardCompletion` → `handleCreateTenant`
- Lógica permanece 100% idêntica

### 3. Frontend — `IdentityContext.tsx`

#### 3.1 Novos Types

```typescript
export interface CreateTenantPayload {
  orgName: string;
}

export interface JoinExistingTenantPayload {
  tenantCode: string;
}

export interface CreateTenantResult {
  success: boolean;
  tenant?: TenantInfo;
  role?: "ADMIN_TENANT";
  redirectPath?: string;
  error?: IdentityError;
}

export interface JoinExistingTenantResult {
  success: boolean;
  tenant?: TenantInfo;
  role?: "ATHLETE";
  redirectPath?: string;
  error?: IdentityError;
}
```

#### 3.2 Novos Métodos

```typescript
const createTenant = async (payload: CreateTenantPayload): Promise<CreateTenantResult>
const joinExistingTenant = async (payload: JoinExistingTenantPayload): Promise<JoinExistingTenantResult>
```

O método `completeWizard` existente será mantido para compatibilidade mas marcado como deprecated.

### 4. Frontend — `IdentityWizard.tsx`

#### 4.1 Atualizar `handleComplete`

```typescript
// Antes
const payload: CompleteWizardPayload = {
  joinMode,
  profileType,
  ...(joinMode === 'existing' && { inviteCode: inviteCode.trim() }),
  ...(joinMode === 'new' && { newOrgName: newOrgName.trim() }),
};
const result = await completeWizard(payload);

// Depois
if (joinMode === 'new') {
  const result = await createTenant({ orgName: newOrgName.trim() });
  // handle result...
} else if (joinMode === 'existing') {
  const result = await joinExistingTenant({ tenantCode: inviteCode.trim() });
  // handle result...
}
```

#### 4.2 Tratamento de Erros Específicos

Adicionar handling para os novos códigos de erro:
- `TENANT_NOT_FOUND` → "Organização não encontrada"
- `TENANT_INACTIVE` → "Esta organização não está ativa"
- `ALREADY_REQUESTED` → "Sua solicitação já está em análise"
- `ALREADY_MEMBER` → "Você já faz parte desta organização"

---

## Contratos Técnicos

### Action: `JOIN_EXISTING_TENANT`

**Input:**
```json
{
  "action": "JOIN_EXISTING_TENANT",
  "payload": { "tenantCode": "tier-one-grappling-school" }
}
```

**Output (Sucesso):**
```json
{
  "status": "RESOLVED",
  "role": "ATHLETE",
  "tenant": { 
    "id": "bc8ab41f-a006-4be2-adfc-89dc4c593552", 
    "slug": "tier-one-grappling-school", 
    "name": "Tier One Grappling School" 
  },
  "redirectPath": "/tier-one-grappling-school/membership/status"
}
```

**Códigos de Erro:**

| Código | Quando | Mensagem |
|--------|--------|----------|
| `VALIDATION_ERROR` | Código vazio ou formato inválido | "Código da organização é obrigatório" / "Código inválido..." |
| `TENANT_NOT_FOUND` | Slug não existe | "Organização não encontrada" |
| `TENANT_INACTIVE` | `status != 'ACTIVE'` | "Esta organização não está ativa para novos membros" |
| `ALREADY_REQUESTED` | Membership PENDING_REVIEW existe | "Sua solicitação já está em análise" |
| `ALREADY_MEMBER` | Membership ACTIVE/APPROVED existe | "Você já faz parte desta organização" |
| `ONBOARDING_FORBIDDEN` | Membership CANCELLED/EXPIRED existe | "Não foi possível solicitar entrada. Contate a administração" |

---

## Arquivos Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `supabase/migrations/[timestamp]_join_existing_tenant.sql` | CREATE | Índice de idempotência |
| `supabase/functions/resolve-identity-wizard/index.ts` | MODIFY | Nova action + handler |
| `src/contexts/IdentityContext.tsx` | MODIFY | Novos métodos + types |
| `src/pages/IdentityWizard.tsx` | MODIFY | Usar novos métodos |

---

## Regras SAFE GOLD Aplicadas

| Regra | Aplicação |
|-------|-----------|
| ✅ Sem `profiles.tenant_id` no JOIN | Apenas `wizard_completed = true` |
| ✅ Idempotência via índice único | Partial index em memberships |
| ✅ Checagem usando mesma tabela que escreve | Verifica memberships antes de inserir |
| ✅ Actions distintas | CREATE_TENANT vs JOIN_EXISTING_TENANT |
| ✅ Audit log em cada operação | ATHLETE_JOIN_REQUEST_VIA_WIZARD |
| ✅ Zero refatoração fora do escopo | Apenas código necessário |

---

## Ordem de Execução

1. **Migração SQL** — Criar índice de idempotência
2. **Edge Function** — Adicionar types e router expandido
3. **Edge Function** — Implementar `handleJoinExistingTenant`
4. **Edge Function** — Renomear `handleWizardCompletion` → `handleCreateTenant`
5. **Edge Function** — Implementar compatibilidade `COMPLETE_WIZARD`
6. **Deploy Edge Function** — Validar com curl
7. **IdentityContext** — Adicionar types e métodos
8. **IdentityWizard** — Usar métodos explícitos

---

## Critérios de Aceitação

### Funcionais
- [ ] Atleta pode entrar em tenant existente via slug
- [ ] Nenhum tenant é criado quando JOIN_EXISTING_TENANT é chamado
- [ ] Cria membership com status PENDING_REVIEW
- [ ] Redirect correto para `/{slug}/membership/status`
- [ ] Repetir JOIN não duplica (retorna ALREADY_REQUESTED)

### Técnicos
- [ ] JOIN_EXISTING_TENANT não toca em `profiles.tenant_id`
- [ ] COMPLETE_WIZARD mapeia `existing` → JOIN e `new` → CREATE
- [ ] Índice de idempotência criado
- [ ] Audit logs gravados

### Regressão
- [ ] Criar nova organização continua funcionando
- [ ] Fluxo `/join/*` não é afetado
