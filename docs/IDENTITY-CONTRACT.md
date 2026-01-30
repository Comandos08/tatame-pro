# 🔐 IDENTITY CONTRACT — Single Source of Truth

**Version:** 3.0.0  
**Last Updated:** 2026-01-30  
**Status:** ✅ LOCKED (P2 Hardened)

## REGRA ABSOLUTA

❌ **É PROIBIDO decidir estado de identidade fora do módulo `src/lib/identity`.**

Isso inclui:
- Redirects
- Avaliação de wizard
- Avaliação de superadmin
- Avaliação de tenant
- Fallbacks

---

## Architecture

### Components

| Component | Purpose |
|-----------|---------|
| `resolve-identity-wizard` | Edge Function - ALL identity resolution & writes |
| `IdentityContext` | Consumes state ONLY (no direct queries) |
| `IdentityGate` | **SINGLE canonical gate** - delegates to state machine |
| `IdentityWizard` | UI for onboarding, calls Edge Function |
| `IdentityErrorScreen` | Explicit error display with escape hatch |

### Identity State Machine (P2)

```typescript
// src/lib/identity/identity-state-machine.ts
type IdentityState =
  | 'UNAUTHENTICATED'
  | 'LOADING'
  | 'WIZARD_REQUIRED'
  | 'SUPERADMIN'
  | 'RESOLVED'
  | 'ERROR';

// SINGLE POINT OF DECISION
function resolveIdentityState(input: IdentityResolutionInput): IdentityState
function resolveIdentityRedirect(state: IdentityState, context: RedirectContext): RedirectDecision
function resolveErrorEscapeHatch(error: IdentityError | null): ErrorEscapeOptions
```

---

## ÚNICO FLUXO VÁLIDO

1. **Hooks** → coletam dados brutos
2. **`resolveIdentityState()`** → resolve estado determinístico
3. **`resolveIdentityRedirect()`** → decide navegação
4. **Componentes** → APENAS renderizam

```typescript
// ✅ CORRETO — IdentityGate.tsx
const input: IdentityResolutionInput = {
  isAuthenticated,
  isAuthLoading: authLoading,
  backendStatus,
  hasError: !!error,
};

const resolvedState = resolveIdentityState(input);
const redirectDecision = resolveIdentityRedirect(resolvedState, context);

switch (resolvedState) {
  case 'UNAUTHENTICATED':
    return <Navigate to={redirectDecision.destination!} replace />;
  // ...
}
```

---

## O QUE NÃO FAZER (ANTI-PATTERNS)

```typescript
// ❌ PROIBIDO — decisão distribuída
if (identityState === 'wizard_required') { 
  navigate('/identity/wizard');
}

// ❌ PROIBIDO — fallback implícito
if (!wizardCompleted) {
  navigate('/identity/wizard');
}

// ❌ PROIBIDO — heurística de superadmin
if (isSuperadmin) {
  navigate('/admin');
}

// ❌ PROIBIDO — redirect fora do map
navigate('/some-path'); // sem passar pelo resolveIdentityRedirect
```

---

## Core Principles (Non-Negotiable)

1. **Authenticated user without tenant = INVALID STATE**
2. **No protected route accessible without resolved tenant**
3. **All identity flows end in: explicit success OR explicit error (blocking)**
4. **No silent redirects**
5. **Client NEVER writes to: user_roles, tenant_billing, identity decisions**
6. **Single source of truth: Edge Function + State Machine**

---

## Edge Function API

### CHECK Action (Read-Only)

```typescript
// Request
{ action: "CHECK" }

// Response
{
  status: "RESOLVED" | "WIZARD_REQUIRED" | "ERROR",
  tenant?: { id: string, slug: string, name: string },
  role?: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL",
  redirectPath?: string,
  error?: { code: string, message: string }
}
```

### COMPLETE_WIZARD Action (Write)

```typescript
// Request
{
  action: "COMPLETE_WIZARD",
  payload: {
    joinMode: "existing" | "new",
    inviteCode?: string,
    newOrgName?: string,
    profileType: "admin" | "athlete"
  }
}
```

---

## Error Escape Hatch (P2)

Todos os erros têm escape explícito via `resolveErrorEscapeHatch()`:

| Error Code | Can Retry | Can Logout | Action |
|------------|-----------|------------|--------|
| `PERMISSION_DENIED` | ❌ | ✅ | Login com outra conta |
| `TENANT_NOT_FOUND` | ✅ | ✅ | Tentar novamente |
| `IMPERSONATION_INVALID` | ✅ | ✅ | Sessão expirada |
| `UNKNOWN` | ✅ | ✅ | Fallback seguro |

**GARANTIA:** Usuário NUNCA fica preso em tela de erro sem ação.

---

## Security Blocks

### Absolute Prohibitions

| ❌ Prohibited | Why |
|---------------|-----|
| Client writing to `user_roles` | Privilege escalation risk |
| Client creating `tenant_billing` | Bypass payment risk |
| Open search on `tenants` (ilike) | Tenant enumeration attack |
| Auto-complete wizard | Silent state changes |
| Direct identity logic in client | Scattered, inconsistent |
| Decision outside state machine | Non-deterministic behavior |

---

## ALTERAÇÕES FUTURAS

Qualquer mudança neste fluxo exige:

1. Atualização do módulo `src/lib/identity`
2. Testes unitários novos
3. E2E verde (`npx playwright test p0-regression`)
4. Atualização deste documento
5. Revisão formal

---

## Files Locked (P2)

| File | Status |
|------|--------|
| `src/lib/identity/identity-state-machine.ts` | 🔒 LOCKED |
| `src/lib/identity/identity-redirect-map.ts` | 🔒 LOCKED |
| `src/lib/identity/identity-error-escape.ts` | 🔒 LOCKED |
| `src/components/identity/IdentityGate.tsx` | 🔒 LOCKED |
| `src/pages/PortalRouter.tsx` | 🔒 LOCKED |

---

*This document is part of the TATAME PRO security and identity baseline.*
*P2 Hardened — 2026-01-30*
