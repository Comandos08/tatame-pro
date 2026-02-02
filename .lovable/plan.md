

# P0 FIX: IMPLEMENTAR COMPLETE_WIZARD — PLANO FINAL AJUSTADO

> **Status:** APROVADO COM AJUSTES  
> **Escopo:** APENAS `supabase/functions/resolve-identity-wizard/index.ts`  
> **Modo:** SAFE GOLD / ZERO INTERPRETAÇÃO / NO REGRESSION

---

## Ajustes Incorporados

| Ajuste Solicitado | Status | Implementação |
|-------------------|--------|---------------|
| `role` retorna exatamente `"ADMIN_TENANT"` | ✅ | Conforme enum `app_role` |
| `joinMode === "existing"` retorna ERROR | ✅ | `UNSUPPORTED_JOIN_MODE` + comentário |
| Billing como best-effort | ✅ | Log warning, não aborta, continua RESOLVED |
| Escopo estrito (1 arquivo) | ✅ | Apenas Edge Function |
| Fail-closed absoluto | ✅ | Nunca retorna WIZARD_REQUIRED |
| Contrato frontend preservado | ✅ | Zero chaves novas |

---

## Contrato de Response (FINAL)

### Sucesso
```json
{
  "status": "RESOLVED",
  "role": "ADMIN_TENANT",
  "tenant": {
    "id": "uuid",
    "slug": "org-slug",
    "name": "Org Name"
  },
  "redirectPath": "/{tenantSlug}/onboarding"
}
```

### Erro
```json
{
  "status": "ERROR",
  "error": {
    "code": "SOME_CODE",
    "message": "Mensagem curta"
  }
}
```

---

## Implementação Detalhada

### 1. Estrutura da Função `handleCompleteWizard()`

```typescript
/**
 * Handles COMPLETE_WIZARD action for new organization creation.
 * 
 * IMPORTANT: joinMode === "existing" is intentionally NOT implemented.
 * This will be addressed in a future phase. Any attempt to use it
 * returns ERROR with code UNSUPPORTED_JOIN_MODE.
 */
async function handleCompleteWizard(
  supabase: SupabaseClient,
  userId: string,
  payload: any
): Promise<IdentityResponse>
```

### 2. Validações (Fail-Closed)

**2.1. joinMode**
```typescript
// ⛔ joinMode === "existing" is intentionally NOT implemented.
// This feature will be addressed in a future phase.
// For now, only "new" organization creation is supported.
if (payload?.joinMode !== "new") {
  return {
    status: "ERROR",
    error: {
      code: "UNSUPPORTED_JOIN_MODE",
      message: "Only 'new' organization mode is supported."
    }
  };
}
```

**2.2. newOrgName**
```typescript
const orgName = payload?.newOrgName?.trim();
if (!orgName || orgName.length < 3) {
  return {
    status: "ERROR",
    error: {
      code: "INVALID_PAYLOAD",
      message: "Organization name must be at least 3 characters."
    }
  };
}
```

### 3. Idempotência

```typescript
// Check if user already completed wizard
const { data: profile } = await supabase
  .from("profiles")
  .select("wizard_completed, tenant_id")
  .eq("id", userId)
  .limit(1);

if (profile?.[0]?.wizard_completed === true && profile?.[0]?.tenant_id) {
  // Already completed - fetch existing tenant and return RESOLVED
  const { data: existingTenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("id", profile[0].tenant_id)
    .limit(1);
  
  if (existingTenant?.[0]) {
    return {
      status: "RESOLVED",
      role: "ADMIN_TENANT",
      tenant: existingTenant[0],
      redirectPath: `/${existingTenant[0].slug}/onboarding`
    };
  }
}
```

### 4. Geração de Slug Único

```typescript
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 48);
}

// Check uniqueness with retry
let finalSlug = baseSlug;
for (let i = 2; i <= 20; i++) {
  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", finalSlug)
    .limit(1);
  
  if (!existing || existing.length === 0) break;
  
  finalSlug = `${baseSlug}-${i}`;
  if (i === 20) {
    return {
      status: "ERROR",
      error: { code: "SLUG_CONFLICT", message: "Could not generate unique slug." }
    };
  }
}
```

### 5. Criar Tenant

```typescript
const { data: newTenant, error: tenantError } = await supabase
  .from("tenants")
  .insert({
    name: orgName,
    slug: finalSlug,
    onboarding_completed: false,
    sport_types: ["BJJ"]
  })
  .select("id, slug, name")
  .single();

if (tenantError || !newTenant) {
  console.error("[resolve-identity-wizard] TENANT_CREATE_FAILED:", tenantError);
  return {
    status: "ERROR",
    error: { code: "TENANT_CREATE_FAILED", message: "Failed to create organization." }
  };
}
```

### 6. Criar Role (ADMIN_TENANT)

```typescript
const { error: roleError } = await supabase
  .from("user_roles")
  .insert({
    user_id: userId,
    role: "ADMIN_TENANT",
    tenant_id: newTenant.id
  });

if (roleError) {
  console.error("[resolve-identity-wizard] ROLE_CREATE_FAILED:", roleError);
  // Rollback: delete tenant
  await supabase.from("tenants").delete().eq("id", newTenant.id);
  return {
    status: "ERROR",
    error: { code: "ROLE_CREATE_FAILED", message: "Failed to assign admin role." }
  };
}
```

### 7. Atualizar Profile

```typescript
const { error: profileError } = await supabase
  .from("profiles")
  .update({
    wizard_completed: true,
    tenant_id: newTenant.id
  })
  .eq("id", userId);

if (profileError) {
  console.error("[resolve-identity-wizard] PROFILE_UPDATE_FAILED:", profileError);
  return {
    status: "ERROR",
    error: { code: "PROFILE_UPDATE_FAILED", message: "Failed to update profile." }
  };
}
```

### 8. Billing Trial (Best-Effort)

```typescript
// 🔔 BILLING IS BEST-EFFORT FOR P0
// If billing creation fails, we log a warning but do NOT abort the flow.
// The user can still complete onboarding. Billing will be addressed separately.
try {
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const { error: billingError } = await supabase
    .from("tenant_billing")
    .insert({
      tenant_id: newTenant.id,
      status: "TRIALING",
      plan_name: "Trial",
      plan_price_id: "trial_placeholder",
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      trial_started_at: now.toISOString(),
      trial_expires_at: trialEnd.toISOString()
    });

  if (billingError) {
    console.warn("[resolve-identity-wizard] BILLING_CREATE_WARNING (non-blocking):", billingError);
    // Continue - billing does not block P0 onboarding
  }
} catch (billingErr) {
  console.warn("[resolve-identity-wizard] BILLING_CREATE_EXCEPTION (non-blocking):", billingErr);
  // Continue - billing does not block P0 onboarding
}
```

### 9. Retornar RESOLVED

```typescript
console.log("[resolve-identity-wizard] COMPLETE_WIZARD success:", {
  userId,
  tenantId: newTenant.id,
  slug: newTenant.slug
});

return {
  status: "RESOLVED",
  role: "ADMIN_TENANT",
  tenant: {
    id: newTenant.id,
    slug: newTenant.slug,
    name: newTenant.name
  },
  redirectPath: `/${newTenant.slug}/onboarding`
};
```

---

## Modificação do Switch Principal

**Antes (linhas 98-100):**
```typescript
if (body.action === "COMPLETE_WIZARD") {
  // 🔒 TEMPORARIAMENTE DESABILITADO COM SEGURANÇA
  return json({ status: "WIZARD_REQUIRED" });
}
```

**Depois:**
```typescript
if (body.action === "COMPLETE_WIZARD") {
  try {
    const result = await handleCompleteWizard(supabaseAdmin, user.id, body.payload);
    return json(result);
  } catch (err) {
    console.error("[resolve-identity-wizard] COMPLETE_WIZARD unexpected error:", err);
    return json({
      status: "ERROR",
      error: { code: "UNEXPECTED", message: "Erro inesperado ao completar wizard." }
    });
  }
}
```

---

## Códigos de Erro

| Code | Cenário | Blocking |
|------|---------|----------|
| `UNSUPPORTED_JOIN_MODE` | joinMode !== "new" | ✅ |
| `INVALID_PAYLOAD` | newOrgName inválido | ✅ |
| `SLUG_CONFLICT` | Não conseguiu slug único | ✅ |
| `TENANT_CREATE_FAILED` | Falha ao criar tenant | ✅ |
| `ROLE_CREATE_FAILED` | Falha ao criar role | ✅ |
| `PROFILE_UPDATE_FAILED` | Falha ao atualizar profile | ✅ |
| `UNEXPECTED` | Exceção não tratada | ✅ |
| (billing warning) | Falha ao criar billing | ❌ Non-blocking |

---

## Arquivo Modificado

| Arquivo | Operação |
|---------|----------|
| `supabase/functions/resolve-identity-wizard/index.ts` | EDIT |

**Proibido modificar:**
- ❌ UI / React
- ❌ Contexts
- ❌ RLS
- ❌ Schemas / Migrations
- ❌ Outras Edge Functions

---

## Critérios de Aceite (Binário)

| # | Critério | Esperado |
|---|----------|----------|
| 1 | Identity Wizard conclui sem erro | ✅ |
| 2 | Retorna `status: "RESOLVED"` | ✅ |
| 3 | Redireciona para `/{slug}/onboarding` | ✅ |
| 4 | Tenant criado corretamente | ✅ |
| 5 | Role `ADMIN_TENANT` criada | ✅ |
| 6 | `profiles.wizard_completed = true` | ✅ |
| 7 | Billing trial criado (best-effort) | ✅ (não bloqueia) |

---

## Comentários Obrigatórios no Código

```typescript
// ⛔ joinMode === "existing" is intentionally NOT implemented.
// This feature will be addressed in a future phase.
// Do NOT implement invite-based join in this PI.

// 🔔 BILLING IS BEST-EFFORT FOR P0
// If billing creation fails, log warning but do NOT abort.
// User can complete onboarding. Billing addressed separately.
```

