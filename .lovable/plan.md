

# P2.1 — IDENTITY CONTRACT LOCKDOWN (ANTI-REGRESSAO TOTAL)

## RESUMO EXECUTIVO

| Metrica | Valor |
|---------|-------|
| Arquivos a CRIAR | 0 |
| Arquivos a MODIFICAR | 2 |
| Arquivos a REMOVER | 1 |
| Alteracoes em P0/P1 | ZERO |
| Novos redirects | ZERO |

---

## DIAGNOSTICO COMPLETO

### PROBLEMA 1: Codigo Morto com Decisao Distribuida

**Arquivo:** `src/components/identity/IdentityGuard.tsx`

**Status:** CODIGO MORTO — Exportado mas NUNCA usado

**Evidencia:**
- App.tsx importa `IdentityGate` diretamente (linha 2)
- Busca por `import.*IdentityGuard|<IdentityGuard` = 0 resultados
- Exportado em `index.ts` "para compatibilidade retroativa" que NAO existe

**Violacao P2:** Linhas 95-109 contem logica de decisao distribuida:
```typescript
// ❌ PROIBIDO - decisao fora do modulo identity
if (identityState === "wizard_required") {
  const target = "/identity/wizard";
  navigate(target, { replace: true });
}
```

**Acao:** REMOVER arquivo inteiro

---

### PROBLEMA 2: Documento Desatualizado

**Arquivo:** `docs/IDENTITY-CONTRACT.md`

**Status:** DESATUALIZADO — Referencia IdentityGuard como componente ativo

**Violacao:** Linha 30 lista `IdentityGuard` na arquitetura quando o sistema usa `IdentityGate` com state machine.

**Acao:** ATUALIZAR para refletir arquitetura P2

---

### PROBLEMA 3: Export Desnecessario

**Arquivo:** `src/components/identity/index.ts`

**Status:** Exporta componente morto

**Acao:** REMOVER export do IdentityGuard

---

## PASSO 1 — REMOCAO DO IDENTITYGUARD.TSX

**Arquivo:** `src/components/identity/IdentityGuard.tsx`

**Acao:** DELETAR arquivo inteiro

**Justificativa:**
- Codigo morto (nunca importado)
- Contem decisao distribuida (anti-pattern P2)
- Duplica logica que ja existe no IdentityGate
- Risco de regressao se alguem usar acidentalmente

---

## PASSO 2 — LIMPEZA DO INDEX.TS

**Arquivo:** `src/components/identity/index.ts`

**ANTES:**
```typescript
export { IdentityGate } from './IdentityGate';
export { IdentityGuard } from './IdentityGuard';
export { IdentityErrorScreen, IdentityErrorPage } from './IdentityErrorScreen';
```

**DEPOIS:**
```typescript
/**
 * 🔐 Identity Components — Single Gate Architecture
 * 
 * P2: IdentityGate is the ONLY canonical gate.
 * All identity decisions go through src/lib/identity module.
 */
export { IdentityGate } from './IdentityGate';
export { IdentityErrorScreen, IdentityErrorPage } from './IdentityErrorScreen';
```

---

## PASSO 3 — ATUALIZACAO DO IDENTITY-CONTRACT.MD

**Arquivo:** `docs/IDENTITY-CONTRACT.md`

**Modificacoes:**
1. Atualizar tabela de componentes (remover IdentityGuard, referenciar IdentityGate)
2. Adicionar secao sobre state machine
3. Adicionar anti-patterns explicitos
4. Atualizar para versao 3.0.0

**CONTEUDO ATUALIZADO:**

```markdown
# 🔐 IDENTITY CONTRACT — Single Source of Truth

**Version:** 3.0.0  
**Last Updated:** 2026-01-30  
**Status:** ✅ LOCKED (P2 Hardened)

## REGRA ABSOLUTA

❌ **E PROIBIDO decidir estado de identidade fora do modulo `src/lib/identity`.**

Isso inclui:
- Redirects
- Avaliacao de wizard
- Avaliacao de superadmin
- Avaliacao de tenant
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

## UNICO FLUXO VALIDO

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

## O QUE NAO FAZER (ANTI-PATTERNS)

```typescript
// ❌ PROIBIDO — decisao distribuida
if (identityState === 'wizard_required') { 
  navigate('/identity/wizard');
}

// ❌ PROIBIDO — fallback implicito
if (!wizardCompleted) {
  navigate('/identity/wizard');
}

// ❌ PROIBIDO — heuristica de superadmin
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

Todos os erros tem escape explicito via `resolveErrorEscapeHatch()`:

| Error Code | Can Retry | Can Logout | Action |
|------------|-----------|------------|--------|
| `PERMISSION_DENIED` | ❌ | ✅ | Login com outra conta |
| `TENANT_NOT_FOUND` | ✅ | ✅ | Tentar novamente |
| `IMPERSONATION_INVALID` | ✅ | ✅ | Sessao expirada |
| `UNKNOWN` | ✅ | ✅ | Fallback seguro |

**GARANTIA:** Usuario NUNCA fica preso em tela de erro sem acao.

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

## ALTERACOES FUTURAS

Qualquer mudanca neste fluxo exige:

1. Atualizacao do modulo `src/lib/identity`
2. Testes unitarios novos
3. E2E verde (`npx playwright test p0-regression`)
4. Atualizacao deste documento
5. Revisao formal

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
```

---

## VERIFICACAO — PORTALROUTER

**Status:** ✅ CONFORME

O arquivo ja esta correto apos P2:
- ❌ NAO avalia identityState
- ❌ NAO avalia wizardCompleted
- ❌ NAO avalia superadmin
- ❌ NAO decide redirect
- ❌ NAO tem fallback para wizard
- ✅ APENAS espera authLoading
- ✅ APENAS redireciona para /login se nao autenticado
- ✅ APENAS retorna null quando autenticado

---

## VERIFICACAO — IDENTITYGATE

**Status:** ✅ CONFORME

O arquivo ja esta correto apos P2:
- ✅ UMA chamada a `resolveIdentityState()`
- ✅ UMA chamada a `resolveIdentityRedirect()`
- ✅ Renderizacao baseada exclusivamente no switch/case
- ✅ Nenhum if/else baseado em identityState fora do switch
- ✅ Redirects apenas via `redirectDecision.destination`

---

## CHECKLIST DE ACEITE P2.1

| Criterio | Status |
|----------|--------|
| Nenhum componente decide identidade | ✅ (apos remover IdentityGuard) |
| PortalRouter e passthrough puro | ✅ JA CONFORME |
| IdentityGate e o unico orquestrador | ✅ JA CONFORME |
| Modulo `identity` e a unica fonte de verdade | ✅ JA CONFORME |
| Documento `IDENTITY-CONTRACT.md` atualizado | A implementar |
| IdentityGuard removido | A implementar |
| Nenhuma regressao P0/P1 | A validar |

---

## COMANDOS DE VALIDACAO

```bash
# Validar tipos
npm run typecheck

# Rodar E2E para garantir nenhuma regressao
npx playwright test p0-regression --project=chromium
```

---

## RESUMO DAS ACOES

1. **DELETAR** `src/components/identity/IdentityGuard.tsx`
2. **MODIFICAR** `src/components/identity/index.ts` (remover export)
3. **ATUALIZAR** `docs/IDENTITY-CONTRACT.md` (versao 3.0.0)

---

## GARANTIAS

- **ZERO alteracoes em P0** — Rotas inalteradas
- **ZERO alteracoes em P1** — E2E tests inalterados
- **ZERO alteracoes em RLS/Supabase** — Backend inalterado
- **ZERO novos redirects** — Apenas remocao de codigo morto
- **ZERO mudanca de comportamento** — IdentityGuard nunca era usado

