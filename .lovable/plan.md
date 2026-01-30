

# P3 — IDENTITY OBSERVABILITY & ENFORCEMENT (LOCK + CI GUARDRAILS)

## RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| Arquivos a CRIAR | 2 |
| Arquivos a MODIFICAR | 3 |
| Alterações em P0/P1/P2 | ZERO (comportamento) |
| Novos redirects | ZERO |
| Cobertura | Transições, redirects, invariantes, CI |

---

## DIAGNÓSTICO DO ESTADO ATUAL

### IdentityGate.tsx
- **Status:** ✅ Conforme P2
- Já possui guardrail DEV-only nas linhas 116-126
- Falta: observabilidade de transições de estado

### src/lib/identity/
- **Arquivos existentes:**
  - `identity-state-machine.ts` (inclui `isValidIdentityTransition`)
  - `identity-redirect-map.ts`
  - `identity-error-escape.ts`
  - `index.ts`
- **Falta:** módulo de observabilidade

### package.json
- Scripts existentes: `dev`, `build`, `lint`, `test`, `i18n:check`
- **Falta:** scripts de contract check e CI identity

### docs/IDENTITY-CONTRACT.md
- Versão atual: 3.0.0
- **Falta:** seção de Enforcement (P3)

---

## ARQUIVOS A CRIAR

### 1. `src/lib/identity/identity-observability.ts`

Responsabilidade única: registrar transições/decisões e validar invariantes DEV-only.

```typescript
/**
 * 🔍 IDENTITY OBSERVABILITY — DEV-Only Logging & Invariant Validation
 *
 * P3: Observabilidade sem alteração de comportamento.
 * NUNCA throw em produção. NUNCA redireciona. NUNCA altera fluxo.
 */

import type { IdentityState } from './identity-state-machine';
import type { RedirectDecision, RedirectContext } from './identity-redirect-map';
import { isValidIdentityTransition } from './identity-state-machine';

export type IdentityInvariantViolation = {
  kind: 'INVALID_TRANSITION' | 'LOADING_TIMEOUT_RISK' | 'REDIRECT_CONTRACT_VIOLATION';
  message: string;
  meta?: Record<string, unknown>;
};

export type IdentityObservationEvent = {
  from: IdentityState | null;
  to: IdentityState;
  pathname: string;
  decision?: RedirectDecision | null;
  context?: Partial<RedirectContext>;
  timestamp: string;
};

export const IDENTITY_OBS_ENV_KEY = 'VITE_IDENTITY_OBSERVABILITY';

/**
 * Valida transição e redirect contract.
 * FUNÇÃO PURA — sem side effects.
 */
export function observeIdentityTransition(args: {
  from: IdentityState | null;
  to: IdentityState;
  pathname: string;
  decision?: RedirectDecision | null;
  context?: Partial<RedirectContext>;
}): { event: IdentityObservationEvent; violations: IdentityInvariantViolation[] } {
  const event: IdentityObservationEvent = {
    ...args,
    timestamp: new Date().toISOString(),
  };

  const violations: IdentityInvariantViolation[] = [];

  // V1: Transição deve ser válida (exceto primeira resolução null -> state)
  if (args.from !== null && !isValidIdentityTransition(args.from, args.to)) {
    violations.push({
      kind: 'INVALID_TRANSITION',
      message: `Invalid identity transition: ${args.from} -> ${args.to}`,
      meta: { from: args.from, to: args.to, pathname: args.pathname },
    });
  }

  // V2: Redirect contract — se shouldRedirect então destination deve existir
  if (args.decision?.shouldRedirect && !args.decision.destination) {
    violations.push({
      kind: 'REDIRECT_CONTRACT_VIOLATION',
      message: `RedirectDecision invalid: shouldRedirect=true but destination is null`,
      meta: { pathname: args.pathname, decision: args.decision },
    });
  }

  return { event, violations };
}

/**
 * DEV-only sink. No-op em produção.
 * NUNCA throw. NUNCA redireciona.
 */
export function devLogIdentityObservation(payload: {
  event: IdentityObservationEvent;
  violations: IdentityInvariantViolation[];
}): void {
  const enabled =
    import.meta.env.DEV &&
    (import.meta.env[IDENTITY_OBS_ENV_KEY] ?? 'true') !== 'false';

  if (!enabled) return;

  const { event, violations } = payload;

  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[IdentityObs] ${event.from ?? '∅'} → ${event.to} @ ${event.pathname}`
  );
  // eslint-disable-next-line no-console
  console.log('event', event);
  if (violations.length) {
    // eslint-disable-next-line no-console
    console.warn('violations', violations);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}
```

---

### 2. `scripts/identity-contract-check.mjs`

Responsabilidade única: falhar CI se padrões proibidos forem encontrados fora de `src/lib/identity/*`.

```javascript
/**
 * 🔒 IDENTITY CONTRACT CHECK — CI Enforcement
 *
 * P3: Bloqueia regressões humanas que reintroduzam decisão distribuída.
 * Falha com exit code 1 se violação for encontrada.
 *
 * RUN: npm run identity:check
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// Arquivos onde padrões são PERMITIDOS
const ALLOWED_FILES = new Set([
  path.join(SRC, 'components/identity/IdentityGate.tsx'),
  path.join(SRC, 'pages/IdentityWizard.tsx'),
]);

// Diretórios onde padrões são PERMITIDOS
const ALLOWED_DIR_PREFIXES = [
  path.join(SRC, 'lib/identity') + path.sep,
];

// Padrões PROIBIDOS fora dos arquivos/diretórios permitidos
const FORBIDDEN_PATTERNS = [
  {
    name: 'IdentityGuard resurrection',
    re: /\bIdentityGuard\b/,
  },
  {
    name: 'Direct wizard navigation (navigate)',
    re: /navigate\(\s*['"]\/identity\/wizard['"]/,
  },
  {
    name: 'Direct wizard Navigate component',
    re: /<Navigate[^>]*to=['"]\/identity\/wizard['"]/,
  },
  {
    name: 'wizardCompleted heuristic outside wizard UI',
    re: /\bwizardCompleted\b/,
  },
];

function listTsFiles(dir) {
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        out.push(...listTsFiles(full));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return out;
}

function isAllowed(file) {
  if (ALLOWED_FILES.has(file)) return true;
  return ALLOWED_DIR_PREFIXES.some((prefix) => file.startsWith(prefix));
}

const files = listTsFiles(SRC);
const violations = [];

for (const file of files) {
  if (isAllowed(file)) continue;

  const content = fs.readFileSync(file, 'utf8');

  for (const p of FORBIDDEN_PATTERNS) {
    if (p.re.test(content)) {
      violations.push({ file: path.relative(ROOT, file), pattern: p.name });
    }
  }
}

if (violations.length) {
  console.error('❌ IDENTITY CONTRACT VIOLATIONS FOUND:\n');
  for (const v of violations) {
    console.error(`  - ${v.pattern}`);
    console.error(`    in ${v.file}\n`);
  }
  console.error('See docs/IDENTITY-CONTRACT.md for allowed patterns.');
  process.exit(1);
}

console.log('✅ Identity contract check passed.');
```

---

## ARQUIVOS A MODIFICAR

### 3. `src/lib/identity/index.ts`

**Adicionar:** exports do módulo de observabilidade.

**Patch (linhas 23-24, após último export):**

```typescript
export {
  type IdentityInvariantViolation,
  type IdentityObservationEvent,
  IDENTITY_OBS_ENV_KEY,
  observeIdentityTransition,
  devLogIdentityObservation,
} from './identity-observability';
```

---

### 4. `src/components/identity/IdentityGate.tsx`

**Objetivo:** Adicionar observabilidade DEV-only de transições SEM alterar comportamento.

**Regras do patch:**
- ✅ Adicionar `useRef` para guardar `prevState`
- ✅ Adicionar `useEffect` para observar transições
- ❌ NUNCA adicionar redirect
- ❌ NUNCA alterar switch/case
- ❌ NUNCA throw

**Patch 1 — Imports (linha 12):**

```typescript
import React, { useRef, useEffect } from "react";
```

**Patch 2 — Import observability (linha 26, após imports do identity):**

```typescript
import {
  observeIdentityTransition,
  devLogIdentityObservation,
  IdentityState,
} from "@/lib/identity";
```

**Patch 3 — Adicionar ref e effect (após linha 143, antes do switch):**

```typescript
  // ===== P3: DEV-ONLY OBSERVABILITY =====
  const prevStateRef = useRef<IdentityState | null>(null);

  useEffect(() => {
    const { event, violations } = observeIdentityTransition({
      from: prevStateRef.current,
      to: resolvedState,
      pathname,
      decision: redirectDecision,
      context: {
        redirectPath,
        isImpersonating,
        impersonationTenantSlug: impersonationSession?.targetTenantSlug,
      },
    });

    devLogIdentityObservation({ event, violations });
    prevStateRef.current = resolvedState;
  }, [resolvedState, pathname]);
```

---

### 5. `package.json`

**Adicionar scripts (após linha 14):**

```json
"identity:check": "node scripts/identity-contract-check.mjs",
"ci:identity": "npm run identity:check && npm run test && npx playwright test p0-regression --project=chromium"
```

---

### 6. `docs/IDENTITY-CONTRACT.md`

**Atualizar versão e adicionar seção Enforcement (P3).**

**Patch 1 — Versão (linha 3):**

```markdown
**Version:** 3.1.0  
```

**Patch 2 — Nova seção após "Files Locked" (antes do footer):**

```markdown
---

## Enforcement (P3)

### Contract Check Script

O sistema inclui um script de CI que bloqueia regressões humanas:

```bash
npm run identity:check
```

**Padrões proibidos detectados:**
- `IdentityGuard` (componente removido)
- `navigate('/identity/wizard')` fora do IdentityGate
- `<Navigate to="/identity/wizard">` fora do IdentityGate
- `wizardCompleted` usado como heurística de redirect

**Arquivos permitidos:**
- `src/lib/identity/*`
- `src/components/identity/IdentityGate.tsx`
- `src/pages/IdentityWizard.tsx`

### Observability (DEV-only)

Transições de estado são logadas automaticamente em DEV:

```
[IdentityObs] ∅ → LOADING @ /portal
[IdentityObs] LOADING → RESOLVED @ /portal
```

**Desativar:** `VITE_IDENTITY_OBSERVABILITY=false`

**Invariantes validadas:**
- Transição de estado é válida (per `VALID_IDENTITY_TRANSITIONS`)
- Redirect contract: `shouldRedirect=true` implica `destination !== null`

### CI Pipeline

```bash
npm run ci:identity
```

Executa:
1. `npm run identity:check` — Contract enforcement
2. `npm run test` — Unit tests
3. `npx playwright test p0-regression` — E2E regression

---
```

---

## ESTRUTURA FINAL

```text
src/lib/identity/
├── identity-state-machine.ts      (INALTERADO)
├── identity-redirect-map.ts       (INALTERADO)
├── identity-error-escape.ts       (INALTERADO)
├── identity-observability.ts      (NOVO - P3)
├── identity-state-machine.spec.ts (INALTERADO)
└── index.ts                       (MODIFICADO - exports)

src/components/identity/
└── IdentityGate.tsx               (MODIFICADO - observability)

scripts/
├── check-i18n-keys.js             (EXISTENTE)
└── identity-contract-check.mjs    (NOVO - P3)

docs/
└── IDENTITY-CONTRACT.md           (MODIFICADO - v3.1.0)

package.json                       (MODIFICADO - scripts)
```

---

## CHECKLIST DE ACEITE P3

| Critério | Status |
|----------|--------|
| Nenhum redirect novo | ✅ (diffs confirmam só logs/scripts/docs) |
| Observability não muda fluxo | ✅ (DEV-only, no-op em prod) |
| CI bloqueia regressão humana | A implementar |
| P1 continua verde | A validar |
| Typecheck ok | A validar |

---

## COMANDOS DE VALIDAÇÃO

```bash
# Verificar contract
npm run identity:check

# Verificar tipos
npm run typecheck

# Rodar E2E de regressão
npx playwright test p0-regression --project=chromium

# Pipeline completo
npm run ci:identity
```

---

## GARANTIAS

- **ZERO alterações em P0/P1/P2** — Fluxo e roteamento inalterados
- **ZERO novos redirects** — Apenas observabilidade
- **ZERO queries novas** — Sem acesso a banco
- **Somente observabilidade + enforcement CI**

