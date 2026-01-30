
# P4 — IDENTITY TELEMETRY (Production-Safe, Zero UX Impact)

## RESUMO EXECUTIVO

| Metrica | Valor |
|---------|-------|
| Arquivos a CRIAR | 1 |
| Arquivos a MODIFICAR | 2 |
| Alteracoes em P0/P1/P2/P3 | ZERO (comportamento) |
| Novos redirects | ZERO |
| Impacto em UX | ZERO |

---

## DIAGNOSTICO DO ESTADO ATUAL

### src/lib/identity/
**Arquivos existentes:**
- `identity-state-machine.ts` — P2 LOCKED
- `identity-redirect-map.ts` — P2 LOCKED
- `identity-error-escape.ts` — P2 LOCKED
- `identity-observability.ts` — P3 (DEV-only)
- `index.ts` — Exports centralizados

**Falta:** Modulo de telemetria para producao

### IdentityGate.tsx
**Status:** Conforme P2/P3
- Observability DEV-only ativo (linha 134-152)
- Todos os hooks declarados antes do early return (linha 155)
- **Falta:** Telemetria de producao

---

## ARQUIVOS A CRIAR

### 1. `src/lib/identity/identity-telemetry.ts` (NOVO)

**Responsabilidade unica:** Emitir eventos de identidade de forma fire-and-forget, sem bloquear render, sem throws, sem PII.

```typescript
/**
 * 📡 IDENTITY TELEMETRY — Production-safe, fire-and-forget
 *
 * P4 GUARANTEES:
 * - NO throws
 * - NO await blocking UI
 * - NO PII (user_id, email, tenant_id, profile_id)
 * - NO behavior change
 * - Sampling enabled (default 10%)
 */

export type IdentityTelemetryEvent =
  | 'identity.state_resolved'
  | 'identity.redirect_decision'
  | 'identity.error_state'
  | 'identity.wizard_required'
  | 'identity.superadmin_access';

export interface IdentityTelemetryPayload {
  event: IdentityTelemetryEvent;
  state: string;
  pathname: string;
  redirectDestination?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  timestamp: string;
}

/**
 * Sampling control (production)
 * Default: 10% of events are logged
 */
const SAMPLE_RATE = 0.1;

function shouldSample(): boolean {
  return Math.random() < SAMPLE_RATE;
}

/**
 * Fire-and-forget telemetry emitter.
 * 
 * GUARANTEES:
 * - Never throws
 * - Never awaits
 * - Never blocks render
 * - Uses queueMicrotask for async execution
 */
export function emitIdentityTelemetry(payload: IdentityTelemetryPayload): void {
  try {
    // Skip if not sampled (90% of calls return immediately)
    if (!shouldSample()) return;

    // 🚫 NEVER await
    // 🚫 NEVER throw
    // 🚫 NEVER block render
    queueMicrotask(() => {
      try {
        // eslint-disable-next-line no-console
        console.info('[IdentityTelemetry]', payload);

        // FUTURE EXPANSION:
        // navigator.sendBeacon('/api/telemetry', JSON.stringify(payload))
      } catch {
        // SILENT BY DESIGN — telemetry must never crash the app
      }
    });
  } catch {
    // SILENT BY DESIGN — outer catch for extra safety
  }
}
```

---

## ARQUIVOS A MODIFICAR

### 2. `src/lib/identity/index.ts`

**Adicionar:** exports do modulo de telemetria.

**ANTES (linhas 26-32):**
```typescript
export {
  type IdentityInvariantViolation,
  type IdentityObservationEvent,
  IDENTITY_OBS_ENV_KEY,
  observeIdentityTransition,
  devLogIdentityObservation,
} from './identity-observability';
```

**DEPOIS (adicionar apos linha 32):**
```typescript
export {
  type IdentityTelemetryEvent,
  type IdentityTelemetryPayload,
  emitIdentityTelemetry,
} from './identity-telemetry';
```

---

### 3. `src/components/identity/IdentityGate.tsx`

**Objetivo:** Emitir telemetria SEM alterar fluxo, SEM bloquear render.

**Regras do patch:**
- ✅ Adicionar import de `emitIdentityTelemetry`
- ✅ Adicionar useEffect de telemetria APOS o useEffect de observability
- ❌ NUNCA adicionar redirect
- ❌ NUNCA alterar switch/case
- ❌ NUNCA fazer await
- ❌ NUNCA throw

---

#### PATCH 1 — Import (linha 21-29)

**ANTES:**
```typescript
import {
  resolveIdentityState,
  IdentityResolutionInput,
  resolveIdentityRedirect,
  resolveErrorEscapeHatch,
  observeIdentityTransition,
  devLogIdentityObservation,
  type IdentityState,
} from "@/lib/identity";
```

**DEPOIS:**
```typescript
import {
  resolveIdentityState,
  IdentityResolutionInput,
  resolveIdentityRedirect,
  resolveErrorEscapeHatch,
  observeIdentityTransition,
  devLogIdentityObservation,
  emitIdentityTelemetry,
  type IdentityState,
} from "@/lib/identity";
```

---

#### PATCH 2 — useEffect Telemetria (inserir APOS linha 152, ANTES da linha 154)

```typescript
  // ===== P4: PRODUCTION TELEMETRY (fire-and-forget) =====
  useEffect(() => {
    // Skip for public paths (no identity resolution needed)
    if (isPublic) return;
    
    // Skip LOADING state (transitional, not actionable)
    if (resolvedState === 'LOADING') return;

    // Base event: state resolved
    emitIdentityTelemetry({
      event: 'identity.state_resolved',
      state: resolvedState,
      pathname,
      timestamp: new Date().toISOString(),
    });

    // Specific events by state
    if (resolvedState === 'WIZARD_REQUIRED') {
      emitIdentityTelemetry({
        event: 'identity.wizard_required',
        state: resolvedState,
        pathname,
        timestamp: new Date().toISOString(),
      });
    }

    if (resolvedState === 'SUPERADMIN') {
      emitIdentityTelemetry({
        event: 'identity.superadmin_access',
        state: resolvedState,
        pathname,
        timestamp: new Date().toISOString(),
      });
    }

    if (resolvedState === 'ERROR') {
      emitIdentityTelemetry({
        event: 'identity.error_state',
        state: resolvedState,
        pathname,
        timestamp: new Date().toISOString(),
      });
    }

    // Redirect decision event
    if (redirectDecision?.shouldRedirect) {
      emitIdentityTelemetry({
        event: 'identity.redirect_decision',
        state: resolvedState,
        pathname,
        redirectDestination: redirectDecision.destination,
        timestamp: new Date().toISOString(),
      });
    }
  }, [resolvedState, pathname, isPublic, redirectDecision?.shouldRedirect, redirectDecision?.destination]);
```

---

## ESTRUTURA FINAL

```text
src/lib/identity/
├── identity-state-machine.ts      (P2 - INALTERADO)
├── identity-redirect-map.ts       (P2 - INALTERADO)
├── identity-error-escape.ts       (P2 - INALTERADO)
├── identity-observability.ts      (P3 - INALTERADO)
├── identity-telemetry.ts          (NOVO - P4)
├── identity-state-machine.spec.ts (INALTERADO)
└── index.ts                       (MODIFICADO - exports)

src/components/identity/
└── IdentityGate.tsx               (MODIFICADO - telemetry useEffect)
```

---

## EVENTOS EMITIDOS

| Evento | Quando | Payload |
|--------|--------|---------|
| `identity.state_resolved` | Sempre que estado != LOADING | state, pathname |
| `identity.wizard_required` | Estado = WIZARD_REQUIRED | state, pathname |
| `identity.superadmin_access` | Estado = SUPERADMIN | state, pathname |
| `identity.error_state` | Estado = ERROR | state, pathname |
| `identity.redirect_decision` | shouldRedirect = true | state, pathname, destination |

---

## SEGURANCA & PRIVACIDADE (GARANTIAS)

**NAO LOGADO (PROIBIDO):**
- user_id
- email
- profile_id
- tenant_id
- role explicito
- tokens

**LOGADO (PERMITIDO):**
- Estado da maquina (RESOLVED, ERROR, etc.)
- Pathname (sem query params sensiveis)
- Destino de redirect
- Timestamp

---

## CHECKLIST DE ACEITE P4

| Criterio | Status |
|----------|--------|
| Nenhuma mudanca de UX | A validar |
| Nenhuma mudanca de fluxo | A validar |
| Telemetria assincrona (queueMicrotask) | A implementar |
| Sampling ativo (10%) | A implementar |
| Zero throws | A implementar |
| Zero awaits | A implementar |
| Zero regressoes P0-P3 | A validar |

---

## COMANDOS DE VALIDACAO

```bash
# Verificar tipos
npm run typecheck

# Verificar contract (P3)
node scripts/identity-contract-check.mjs

# Rodar E2E de regressao
npx playwright test p0-regression --project=chromium
```

---

## GARANTIAS

- **ZERO alteracoes em P0/P1/P2/P3** — Fluxo e roteamento inalterados
- **ZERO novos redirects** — Apenas telemetria
- **ZERO queries novas** — Sem acesso a banco
- **ZERO impacto em UX** — Usuario nao percebe
- **ZERO PII** — Nenhum dado sensivel logado
- **Sampling 10%** — Performance garantida
- **Fire-and-forget** — Nunca bloqueia render
