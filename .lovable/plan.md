

## P4A — Athlete Route Guard (Security Only)

### Análise do Estado Atual

| Componente | Status | Problema |
|------------|--------|----------|
| `PortalProtectedRoute` (L77-95) | Existe | Só verifica auth, não valida tenant |
| `/app` routes | `ProtectedRoute` | Atleta pode tentar acessar via URL direta |
| Tenant validation | Não existe | Nenhum guard valida se tenant existe no DB |

---

### Arquivos a Criar

#### 1. `src/lib/resolveAthleteRouteAccess.ts`

**Função pura de decisão (100% testável, sem side effects):**

```typescript
/**
 * P4A — Athlete Route Access Decision Function
 * PURE FUNCTION: No side effects, no external dependencies
 * 
 * IMMUTABLE RULES (ORDER MATTERS):
 * 1. No tenantSlug → '/'
 * 2. /app route → /${tenantSlug}/portal (BLOCK)
 * 3. Tenant doesn't exist → '/'
 * 4. Auth required but not authenticated → /${tenantSlug}/login
 * 5. Otherwise → OK
 */
```

**Regras de decisão:**

| # | Condição | redirectTo | Reason |
|---|----------|------------|--------|
| 1 | `!tenantSlug` | `/` | NO_TENANT |
| 2 | `pathname === /${slug}/app` ou `pathname.startsWith(/${slug}/app/)` | `/${slug}/portal` | BLOCK_APP |
| 3 | `!tenantExists` | `/` | TENANT_NOT_FOUND |
| 4 | Rota portal/renew/status + `!isAuthenticated` | `/${slug}/login` | AUTH_REQUIRED |
| 5 | Caso contrário | `null` (allow) | OK |

**Rotas que exigem auth:**
- `/${tenantSlug}/portal`
- `/${tenantSlug}/portal/*`
- `/${tenantSlug}/membership/renew`
- `/${tenantSlug}/membership/status`

---

#### 2. `src/components/auth/AthleteRouteGuard.tsx`

**Guard wrapper com query mínima:**

| Responsabilidade | Implementação |
|------------------|---------------|
| Ler tenantSlug | `useParams()` |
| Ler pathname | `useLocation()` |
| Verificar auth | `useCurrentUser()` |
| Query tenant | `from('tenants').select('id').eq('slug', tenantSlug).maybeSingle()` |
| Prevenir loops | `useRef(hasRedirected)` |
| Decisão | `resolveAthleteRouteAccess()` exclusivamente |

**Comportamento:**
| Estado | Ação |
|--------|------|
| Loading (auth ou tenant check) | Mostrar loader |
| `allow = false` | `navigate(redirectTo, { replace: true })` |
| `allow = true` | Render `{children}` |

---

### Arquivo a Modificar

#### 3. `src/routes.tsx`

**Mudanças:**

1. **Adicionar import:**
```typescript
import { AthleteRouteGuard } from '@/components/auth/AthleteRouteGuard';
```

2. **Substituir `PortalProtectedRoute` por `AthleteRouteGuard`:**

| Rota | Antes | Depois |
|------|-------|--------|
| `portal` | `<PortalProtectedRoute>` | `<AthleteRouteGuard>` |
| `portal/events` | `<PortalProtectedRoute>` | `<AthleteRouteGuard>` |
| `portal/card` | `<PortalProtectedRoute>` | `<AthleteRouteGuard>` |
| `membership/renew` | `<PortalProtectedRoute>` | `<AthleteRouteGuard>` |
| `membership/status` | Sem guard | `<AthleteRouteGuard>` |

3. **Rotas que NÃO recebem guard (públicas):**
- `membership/new` — Público
- `membership/adult` — Público
- `membership/youth` — Público
- `membership/success` — Público

4. **Manter `PortalProtectedRoute` no arquivo** (não remover, pode ser usado em outros lugares)

---

### SAFE MODE — Arquivos NÃO Modificados

| Arquivo | Razão |
|---------|-------|
| `src/pages/Login.tsx` | P2 — Admin login |
| `src/pages/AuthCallback.tsx` | P3 — Athlete callback |
| `src/lib/billing/*` | P1 — Billing core |
| `src/lib/resolveAthletePostLoginRedirect.ts` | Post-login redirect |
| `src/layouts/TenantLayout.tsx` | Layout do tenant |

---

### Testes de Validação

| Cenário | Input | Resultado |
|---------|-------|-----------|
| Atleta tenta `/acme/app` | `pathname=/acme/app` | → `/acme/portal` (BLOCK_APP) |
| Atleta tenta `/acme/app/memberships` | `pathname=/acme/app/memberships` | → `/acme/portal` (BLOCK_APP) |
| Tenant inexistente | `tenantExists=false` | → `/` (TENANT_NOT_FOUND) |
| Portal sem auth | `isAuthenticated=false` | → `/acme/login` (AUTH_REQUIRED) |
| Portal com auth | `isAuthenticated=true` | → Render children (OK) |
| Membership/new sem auth | Público | → Render children (OK) |
| No tenantSlug | `tenantSlug=null` | → `/` (NO_TENANT) |

---

### Critérios de Aceite

| Critério | Status |
|----------|--------|
| `/app` bloqueado para atleta | ✅ |
| Tenant inexistente → `/` | ✅ |
| Portal sem auth → `/{slug}/login` | ✅ |
| Nenhum loop de redirect (useRef) | ✅ |
| Nenhum acesso fora do tenant | ✅ |
| Código compila sem warnings TS | ✅ |
| Função pura isolada | ✅ |
| NÃO usa billing | ✅ |
| NÃO usa membershipStatus | ✅ |
| P1/P2/P3 intactos | ✅ |

---

### Entregáveis

**Criar:**
1. `src/lib/resolveAthleteRouteAccess.ts` — Função pura
2. `src/components/auth/AthleteRouteGuard.tsx` — Guard wrapper

**Modificar:**
3. `src/routes.tsx` — Aplicar guard nas rotas atleta

---

### Resultado Esperado

```text
P4A — ATHLETE ROUTE GUARD (SECURITY)
├── Função pura centralizada ✓
├── Guard único de rotas ✓
├── /app bloqueado para atleta ✓
├── Tenant inexistente bloqueado ✓
├── Auth exigida no portal ✓
├── Fail-closed ✓
├── P1 / P2 / P3 intactos ✓
└── SAFE MODE preservado ✓
```

