

## P2 — ADMIN POST-LOGIN REDIRECT RESPEITANDO BILLING

### Decisão Técnica Documentada

Após análise do `TenantLayout.tsx` (linhas 63-74):

```typescript
// Linha 64-66 do TenantLayout.tsx
const isProtectedRoute = location.pathname.includes('/app');
if (!tenant.isActive && isProtectedRoute) {
  return <TenantBlockedScreen ... />;
}
```

**CONCLUSÃO:** O TenantLayout JÁ renderiza `TenantBlockedScreen` quando `tenant.isActive === false` em rotas `/app/*`.

**DECISÃO:** 
- ❌ NÃO criar rota `/{slug}/blocked`
- ✅ Redirecionar para `/{slug}/app` — TenantLayout faz o bloqueio visual
- ✅ Adicionar query param `?billing=issue` para casos read-only

---

### Arquivos a Criar

#### 1. `src/lib/resolveAdminPostLoginRedirect.ts`

Função PURA seguindo o padrão do atleta:

```typescript
/**
 * SAFE GOLD — P2
 * Função única de redirect pós-login de ADMIN / STAFF
 * 
 * DECISÃO TÉCNICA:
 * - NÃO existe rota /blocked dedicada
 * - TenantLayout já bloqueia rotas /app/* quando tenant.isActive = false
 * - Por isso, isBlocked → retorna /app (TenantLayout bloqueia)
 */

import type { TenantBillingState } from '@/lib/billing';

export function resolveAdminPostLoginRedirect(
  tenantSlug: string,
  billingState: TenantBillingState
): string {
  const base = `/${tenantSlug}`;

  // isBlocked = true → TenantLayout irá renderizar TenantBlockedScreen
  // Não precisa de rota especial
  if (billingState.isBlocked) {
    return `${base}/app`;
  }

  // isReadOnly = true → Pode acessar mas com sinal visual
  if (billingState.isReadOnly) {
    return `${base}/app?billing=issue`;
  }

  // Tudo OK
  return `${base}/app`;
}
```

**Regras aplicadas:**

| Condição | Destino | Razão |
|----------|---------|-------|
| `isBlocked = true` | `/{slug}/app` | TenantLayout bloqueia automaticamente |
| `isReadOnly = true` | `/{slug}/app?billing=issue` | Permite exibir banner |
| Caso contrário | `/{slug}/app` | Acesso normal |

---

### Arquivos a Modificar

#### 2. `src/pages/Login.tsx`

**Mudanças no `useEffect` de redirect (linhas 28-60):**

A lógica atual:
```typescript
// Linha 45-50 atual
if (adminRoles && adminRoles.length > 0) {
  const tenantSlug = (adminRoles[0] as any).tenants?.slug;
  if (tenantSlug) {
    navigate(`/${tenantSlug}/app`);  // ❌ Sem verificar billing
    return;
  }
}
```

**Nova lógica proposta:**

```typescript
import { resolveTenantBillingState } from '@/lib/billing';
import { resolveAdminPostLoginRedirect } from '@/lib/resolveAdminPostLoginRedirect';

// Dentro do useEffect redirectUser:

if (adminRoles && adminRoles.length > 0) {
  const tenantId = adminRoles[0].tenant_id;
  const tenantSlug = (adminRoles[0] as any).tenants?.slug;
  
  if (tenantSlug && tenantId) {
    try {
      // 1. Buscar dados do tenant
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('is_active')
        .eq('id', tenantId)
        .maybeSingle();

      // 2. Buscar dados de billing
      const { data: billingData } = await supabase
        .from('tenant_billing')
        .select('status, is_manual_override, override_reason, override_at')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      // 3. Resolver estado de billing
      const billingState = resolveTenantBillingState(
        billingData ? {
          status: billingData.status,
          is_manual_override: billingData.is_manual_override,
          override_reason: billingData.override_reason,
          override_at: billingData.override_at,
        } : null,
        tenantData ? { is_active: tenantData.is_active } : null
      );

      // 4. Resolver destino via função pura
      const destination = resolveAdminPostLoginRedirect(tenantSlug, billingState);
      
      navigate(destination, { replace: true });
    } catch (error) {
      // FALLBACK RESTRITIVO: erro → vai para app (TenantLayout bloqueará se necessário)
      console.error('Admin post-login redirect failed:', error);
      navigate(`/${tenantSlug}/app`, { replace: true });
    }
    return;
  }
}
```

**Fallback obrigatório:**
- Se qualquer query falhar → navegar para `/{slug}/app`
- TenantLayout funciona como rede de segurança

---

### Diagrama de Fluxo

```text
Login.tsx → redirectUser()
│
├─ currentUser = null?
│   └── return (aguarda login)
│
├─ isGlobalSuperadmin?
│   └── navigate('/admin') ✓ INALTERADO
│
├─ Buscar admin role (user_roles)
│   └── Encontrou? → tenantId, tenantSlug
│
├─ Buscar dados para billing
│   ├─ tenants: is_active
│   └─ tenant_billing: status, is_manual_override, ...
│
├─ resolveTenantBillingState(billingRaw, tenantRaw)
│   └── Retorna: TenantBillingState
│
├─ resolveAdminPostLoginRedirect(tenantSlug, billingState)
│   │
│   ├─ isBlocked? → /{slug}/app (TenantLayout bloqueia)
│   ├─ isReadOnly? → /{slug}/app?billing=issue
│   └─ OK → /{slug}/app
│
└─ navigate(destino, { replace: true })

    ⬇️ (TenantLayout.tsx)
    
TenantLayout → TenantContent
│
├─ tenant.isActive = false && rota inclui /app?
│   └── return <TenantBlockedScreen /> ✓ BLOQUEIO VISUAL
│
└── return <Outlet /> → App normal
```

---

### Arquivos NÃO Modificados (SAFE MODE)

| Arquivo | Razão |
|---------|-------|
| `src/lib/billing/resolveTenantBillingState.ts` | CORE — Não alterar |
| `src/hooks/useTenantStatus.ts` | CORE — Não alterar |
| `src/hooks/useBillingOverride.ts` | CORE — Não alterar |
| `src/pages/AuthCallback.tsx` | Fluxo atleta — Não alterar |
| `src/lib/resolveAthletePostLoginRedirect.ts` | Fluxo atleta — Não alterar |
| `src/layouts/TenantLayout.tsx` | Bloqueio reativo — Mantido intacto |
| `src/routes.tsx` | Sem nova rota necessária |
| `src/components/billing/TenantBlockedScreen.tsx` | UI existente — Sem alteração |

---

### Checklist de Validação

| Cenário | Resultado Esperado |
|---------|-------------------|
| SUPERADMIN_GLOBAL login | → `/admin` (inalterado) |
| ADMIN_TENANT billing ACTIVE | → `/{slug}/app` |
| ADMIN_TENANT billing TRIALING | → `/{slug}/app` |
| ADMIN_TENANT billing PAST_DUE | → `/{slug}/app?billing=issue` |
| ADMIN_TENANT billing UNPAID | → `/{slug}/app?billing=issue` |
| ADMIN_TENANT billing INCOMPLETE | → `/{slug}/app?billing=issue` |
| ADMIN_TENANT billing CANCELED | → `/{slug}/app` → TenantLayout bloqueia |
| ADMIN_TENANT tenant.is_active=false | → `/{slug}/app` → TenantLayout bloqueia |
| Override manual + ACTIVE | → `/{slug}/app` |
| Override manual + CANCELED | → `/{slug}/app` → TenantLayout bloqueia |
| Query falha | → `/{slug}/app` (TenantLayout = rede de segurança) |
| Atleta login (magic link) | → Fluxo inalterado via AuthCallback |

---

### Resumo de Alterações

| Ação | Arquivo |
|------|---------|
| **CREATE** | `src/lib/resolveAdminPostLoginRedirect.ts` |
| **MODIFY** | `src/pages/Login.tsx` |

**Total: 2 arquivos** (mínimo necessário)

---

### Resultado Esperado

```text
P2 — ADMIN POST-LOGIN REDIRECT CONCLUÍDO
├── resolveAdminPostLoginRedirect() → Função pura central
├── Login.tsx → Consulta billing ANTES de navegar
├── Decisão documentada: TenantLayout já bloqueia
├── Nenhuma rota nova criada
├── Fallback via TenantLayout preservado
├── Fluxo atleta → INALTERADO
├── CORE billing → INALTERADO
└── SAFE MODE preservado ✓
```

