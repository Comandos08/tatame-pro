/**
 * 🔍 IDENTITY OBSERVABILITY — DEV-Only Logging & Invariant Validation
 *
 * P3: Observabilidade sem alteração de comportamento.
 * NUNCA throw em produção. NUNCA redireciona. NUNCA altera fluxo.
 */

import { logger } from '@/lib/logger';
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
  logger.log('event', event);
  if (violations.length) {
    logger.warn('violations', violations);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}
