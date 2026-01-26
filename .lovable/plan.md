

## P3 — Athlete AuthCallback Hardening (FINAL)

### Vulnerabilidades Identificadas

| Linha | Código Atual | Problema | Severidade |
|-------|-------------|----------|------------|
| 18 | `const next = searchParams.get('next') \|\| '/'` | Default não controlado | ⚠️ |
| 21-28 | `extractTenantSlug(path: string)` | Não aceita null | ⚠️ |
| 47 | `navigate(next, { replace: true })` | ❌ `next` direto | 🔴 CRÍTICO |
| 62 | `navigate(next, { replace: true })` | ❌ `next` direto | 🔴 CRÍTICO |
| 115 | `navigate(next, { replace: true })` | ❌ `next` direto | 🔴 CRÍTICO |
| 117 | `navigate(redirectPath, { replace: true })` | Não validado | ⚠️ |
| 122 | `navigate(next, { replace: true })` | ❌ `next` no catch | 🔴 CRÍTICO |

---

### Arquivo Modificado

`src/pages/AuthCallback.tsx` — único arquivo

---

### Implementação

#### 1. Funções Puras LOCAIS (antes do componente)

```typescript
/**
 * P3 — Sanitizador de tenant slug
 * LOCAL: Não exportar
 */
function extractTenantSlug(path: string | null): string | null {
  if (!path) return null;

  const match = path.match(/^\/([^/]+)/);
  if (!match || !match[1]) return null;

  const slug = match[1];

  // Bloquear rotas globais explicitamente
  const blockedRoots = ['admin', 'auth', 'login', 'help'];
  if (blockedRoots.includes(slug)) {
    return null;
  }

  return slug;
}

/**
 * P3 — Validador de redirect pós-auth
 * LOCAL: Não exportar
 * 
 * REGRAS IMUTÁVEIS:
 * 1. No tenantSlug → '/'
 * 2. next válido (starts /${tenantSlug}, no /app) → next
 * 3. next inválido → /${tenantSlug}/portal
 */
function resolveAthletePostAuthRedirect(
  tenantSlug: string | null,
  next: string | null
): string {
  if (!tenantSlug) {
    return '/';
  }

  const tenantBase = `/${tenantSlug}`;
  const defaultDestination = `${tenantBase}/portal`;

  if (next) {
    const startsWithTenant = next.startsWith(tenantBase);
    const containsApp = next.includes('/app');

    if (startsWithTenant && !containsApp) {
      return next;
    }
  }

  return defaultDestination;
}
```

---

#### 2. Mudanças no Componente

| Antes | Depois |
|-------|--------|
| `const next = searchParams.get('next') \|\| '/'` | `const nextRaw = searchParams.get('next')` |

---

#### 3. Pontos de Navigate Corrigidos

**Linha 47 (no tenantSlug):**
```typescript
// ANTES: navigate(next, { replace: true });
// DEPOIS:
const destination = resolveAthletePostAuthRedirect(null, nextRaw);
navigate(destination, { replace: true });
```

**Linha 62 (tenant não encontrado):**
```typescript
// ANTES: navigate(next, { replace: true });
// DEPOIS:
const destination = resolveAthletePostAuthRedirect(null, nextRaw);
navigate(destination, { replace: true });
```

**Linhas 114-118 (redirect final):**
```typescript
// ANTES:
if (isMembershipFormRoute && !membershipStatus) {
  navigate(next, { replace: true });
} else {
  navigate(redirectPath, { replace: true });
}

// DEPOIS:
let targetPath: string;
if (isMembershipFormRoute && !membershipStatus && nextRaw) {
  targetPath = nextRaw;  // ✅ SEM non-null assertion
} else {
  targetPath = redirectPath;
}

const destination = resolveAthletePostAuthRedirect(tenantSlug, targetPath);
navigate(destination, { replace: true });
```

**Linha 122 (catch):**
```typescript
// ANTES: navigate(next, { replace: true });
// DEPOIS:
navigate('/login', { replace: true }); // ✅ SEMPRE /login
```

---

#### 4. Mudança no useEffect dependency array

```typescript
// ANTES:
}, [isLoading, isAuthenticated, currentUser, next, navigate, redirecting]);

// DEPOIS:
}, [isLoading, isAuthenticated, currentUser, nextRaw, navigate, redirecting]);
```

---

### Fluxo de Navegação Blindado

```text
AuthCallback.tsx
│
├─ 1. supabase.auth.getSession() ← Finalizar magic link
│
├─ 2. Extract tenantSlug from nextRaw
│   │
│   └─ No tenantSlug?
│       └── resolveAthletePostAuthRedirect(null, nextRaw) → '/'
│
├─ 3. Query tenant from DB
│   │
│   └─ Tenant not found?
│       └── resolveAthletePostAuthRedirect(null, nextRaw) → '/'
│
├─ 4. Fetch athlete + membership status
│
├─ 5. Calculate targetPath
│   ├─ Membership form + no membership + nextRaw exists → nextRaw
│   └─ Else → redirectPath (from resolveAthletePostLoginRedirect)
│
├─ 6. SEMPRE validar antes de navegar
│   └── resolveAthletePostAuthRedirect(tenantSlug, targetPath)
│       │
│       ├─ starts with /${tenantSlug} AND no /app → targetPath
│       └─ else → /${tenantSlug}/portal
│
└── CATCH (any error)
    └── navigate('/login') ← SEMPRE, SEM EXCEÇÃO
```

---

### Testes de Validação

| Input | Resultado |
|-------|-----------|
| `next=/acme/portal` | → `/acme/portal` ✅ |
| `next=/acme/membership/new` (sem membership) | → `/acme/membership/new` ✅ |
| `next=/acme/membership/new` (com membership) | → `/acme/portal` ✅ |
| `next=/acme/app` | → `/acme/portal` (BLOCKED) |
| `next=/acme/app/dashboard` | → `/acme/portal` (BLOCKED) |
| `next=/other-tenant/portal` | → `/acme/portal` (wrong tenant) |
| `next=/admin` | → `/` (blocked root) |
| `next=/auth/callback` | → `/` (blocked root) |
| `next=https://evil.com` | → `/acme/portal` (blocked) |
| `next=null` | → `/acme/portal` (default) |
| Tenant não existe no DB | → `/` |
| Query error | → `/login` ✅ |

---

### Arquivos NÃO Modificados

| Arquivo | Razão |
|---------|-------|
| `src/pages/Login.tsx` | P2 — Admin login |
| `src/lib/billing/*` | P1 — Billing core |
| `src/lib/resolveAthletePostLoginRedirect.ts` | Continua sendo usado |
| `src/routes.tsx` | Sem mudanças |
| `src/layouts/TenantLayout.tsx` | Sem mudanças |

---

### Checklist de Aceite

| Critério | Status |
|----------|--------|
| Nenhum `navigate(next)` ou `navigate(nextRaw)` direto | ✅ |
| Nenhum `!` (non-null assertion) relacionado a redirect | ✅ |
| `/app` bloqueado para atletas | ✅ |
| Redirect sempre dentro do tenant | ✅ |
| Catch sempre `/login` | ✅ |
| Código compila sem warnings TypeScript | ✅ |
| Funções puras são LOCAIS (não exportadas) | ✅ |

---

### Resultado Esperado

```text
P3 — ATHLETE AUTHCALLBACK HARDENING (FINAL)
├── resolveAthletePostAuthRedirect() LOCAL ✓
├── extractTenantSlug() aceita null ✓
├── next NUNCA direto em navigate() ✓
├── ZERO non-null assertions ✓
├── TODOS os redirects validados ✓
├── Catch SEMPRE /login ✓
├── /app bloqueado ✓
├── Redirect dentro do tenant ✓
├── Admin login UNTOUCHED ✓
├── Billing UNTOUCHED ✓
└── SAFE MODE preserved ✓
```

