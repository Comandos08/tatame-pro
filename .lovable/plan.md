

# PI U5 — OBSERVABILITY SINGLE SOURCE OF TRUTH (Execucao)

## Fase U5.E1 — Remover Dead Code

### Acoes

1. **Deletar `src/observability/` inteiro** (4 arquivos: `types.ts`, `observability.ts`, `sentryProvider.ts`, `index.ts`)
2. **Atualizar `e2e/contract/observability.spec.ts`** — unico consumidor externo
   - Mover as constantes `SAFE_EVENT_DOMAINS` e `SAFE_EVENT_LEVELS` para `src/lib/observability/types.ts` (compatibilidade com contrato E2E)
   - Atualizar o import no spec para `@/lib/observability/types`

---

## Fase U5.E2 — Unificacao de Tipos

### 2.1 Em `src/lib/observability/types.ts` — adicionar tipos canonicos

```text
// Adicionar (FROZEN CONTRACT):
export type Severity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export type ObservabilityDomain =
  | 'AUTH' | 'IDENTITY' | 'TENANT' | 'BILLING'
  | 'MEMBERSHIP' | 'JOB' | 'SECURITY' | 'SYSTEM'
  | 'INTEGRATION';

// Migrar de src/observability/types.ts:
export const SAFE_EVENT_DOMAINS = [...] as const;
export const SAFE_EVENT_LEVELS = [...] as const;
export type SafeEventDomain = ...;
export type SafeEventLevel = ...;
```

### 2.2 Health Status — sem mudanca

- `SafeHealthStatus` permanece em `src/types/health-state.ts` (FROZEN SAFE GOLD)
- `HealthStatus` em `src/types/observability.ts` ja esta alinhada (OK, DEGRADED, CRITICAL, UNKNOWN)
- Nenhuma duplicacao a resolver — ambas coexistem legitimamente (uma e contrato SAFE GOLD, outra e tipo de dominio UI)

### 2.3 `EventSeverity` em `src/types/observability.ts`

- **Mantida como esta** (LOW, MEDIUM, HIGH, CRITICAL) — esta nao e log severity, e classificacao de severidade de eventos de auditoria/alertas
- Separacao semantica: `Severity` (logs) != `EventSeverity` (audit events)
- Adicionar comentario documental explicitando esta distincao

### 2.4 `error-report.ts` — alinhar severity

- Campo `severity` no `ErrorContext` atualmente usa `'low' | 'medium' | 'high' | 'critical'` (lowercase)
- Alinhar para usar `Severity` canonico: `'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'`

---

## Fase U5.E3 — Error Pipeline

### 3.1 Novos loggers especializados em `logger.ts`

```text
export const securityLogger = createLogger('Security');
export const auditLogger = createLogger('Audit');
export const realtimeLogger = createLogger('Realtime');
```

### 3.2 Substituicoes de console direto

| Arquivo | Atual | Substituicao |
|---|---|---|
| `auth-state-machine.ts:73` | `console.error('[AuthStateMachine] INVALID...')` | `authLogger.error('Invalid transition', {...})` |
| `auth-state-machine.ts:115` | `console.warn('[AuthStateMachine] Unknown...')` | `authLogger.warn('Unknown auth event', {...})` |
| `security-boundary.ts:147` | `console.warn('[SecurityBoundary] Unknown...')` | `securityLogger.warn('Unknown security event', {...})` |
| `auditEvent.ts:126` | `console.error('[B3-AUDIT] Failed:...')` | `auditLogger.error('Audit insert failed', {...})` |
| `auditEvent.ts:130` | `console.error('[B3-AUDIT] Exception:...')` | `auditLogger.error('Audit exception', {...})` |
| `realtime.ts:97` | `console.warn('[realtime] Failed to transform...')` | `realtimeLogger.warn('Transform failed', {...})` |
| `realtime.ts:193` | `console.error('[realtime] Error processing...')` | `realtimeLogger.error('Event processing error', {...})` |
| `realtime.ts:206` | `console.error('[realtime] Subscription error:...')` | `realtimeLogger.error('Subscription error', {...})` |

### 3.3 Permitidos (DEV-only contract validation — sem mudanca)

| Arquivo | Motivo |
|---|---|
| `institutionalErrors.ts:197, 216` | DEV-only (`!import.meta.env.PROD`), validacao de contrato |
| `contractValidation.ts:55, 65, 89` | DEV-only, validacao de contrato de navegacao |
| `identity-observability.ts:92` | DEV-only, validacao de transicoes |
| `lib/observability/types.ts:68, 75` | DEV-only (`import.meta.env.PROD` guard), validacao de HealthSignal |

---

## Resumo de Arquivos Afetados

| Arquivo | Acao |
|---|---|
| `src/observability/*` (4 arquivos) | DELETAR |
| `src/lib/observability/types.ts` | Adicionar `Severity`, `ObservabilityDomain`, migrar `SAFE_EVENT_*` |
| `src/lib/observability/logger.ts` | Adicionar 3 loggers especializados |
| `src/lib/observability/error-report.ts` | Alinhar `severity` para `Severity` canonico |
| `src/lib/auth/auth-state-machine.ts` | Migrar 2 console diretos para `authLogger` |
| `src/lib/auth/security-boundary.ts` | Migrar 1 console direto para `securityLogger` |
| `src/lib/audit/auditEvent.ts` | Migrar 2 console diretos para `auditLogger` |
| `src/lib/observability/realtime.ts` | Migrar 3 console diretos para `realtimeLogger` |
| `src/types/observability.ts` | Adicionar comentario documental (EventSeverity != Severity) |
| `e2e/contract/observability.spec.ts` | Atualizar import path |

---

## Risco

Baixo-Medio. Mitigado por:
- Dead code confirmado (zero consumidores de `src/observability/`)
- Logger `createLogger` ja e padrao testado no sistema
- Substituicoes sao 1:1 (mesma semantica, formato estruturado)
- DEV-only `console.warn` preservados (sem impacto em producao)

