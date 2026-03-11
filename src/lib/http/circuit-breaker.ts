/**
 * Circuit Breaker Pattern for HTTP integrations.
 *
 * States:
 *   CLOSED   → Normal operation, requests pass through
 *   OPEN     → Failures exceeded threshold, requests fail fast
 *   HALF_OPEN → Testing recovery, allow limited requests
 *
 * Usage:
 *   const breaker = createCircuitBreaker({ name: 'stripe-api' });
 *   const result = await breaker.call(() => fetch('/api/stripe/...'));
 *
 * Integrates with http.ts via composition — does NOT modify http.ts.
 *
 * @module src/lib/http/circuit-breaker
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Identifier for logging/debugging */
  name: string;
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeout?: number;
  /** Max requests allowed in HALF_OPEN state (default: 1) */
  halfOpenMaxAttempts?: number;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number | null;
  halfOpenAttempts: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly circuitState: CircuitState
  ) {
    super(`Circuit breaker "${circuitName}" is ${circuitState}`);
    this.name = 'CircuitBreakerError';
  }
}

export interface CircuitBreaker {
  /** Execute a function through the circuit breaker */
  call<T>(fn: () => Promise<T>): Promise<T>;
  /** Get current state */
  getState(): CircuitBreakerState;
  /** Manually reset to CLOSED */
  reset(): void;
}

export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const {
    name,
    failureThreshold = 5,
    resetTimeout = 30_000,
    halfOpenMaxAttempts = 1,
  } = options;

  const state: CircuitBreakerState = {
    state: 'CLOSED',
    failures: 0,
    lastFailureTime: null,
    halfOpenAttempts: 0,
  };

  function shouldAttemptReset(): boolean {
    if (state.state !== 'OPEN' || !state.lastFailureTime) return false;
    return Date.now() - state.lastFailureTime >= resetTimeout;
  }

  function onSuccess(): void {
    state.failures = 0;
    state.halfOpenAttempts = 0;
    state.state = 'CLOSED';
  }

  function onFailure(): void {
    state.failures++;
    state.lastFailureTime = Date.now();

    if (state.state === 'HALF_OPEN') {
      state.state = 'OPEN';
    } else if (state.failures >= failureThreshold) {
      state.state = 'OPEN';
    }
  }

  return {
    async call<T>(fn: () => Promise<T>): Promise<T> {
      // OPEN: check if it's time to try recovery
      if (state.state === 'OPEN') {
        if (shouldAttemptReset()) {
          state.state = 'HALF_OPEN';
          state.halfOpenAttempts = 0;
        } else {
          throw new CircuitBreakerError(name, state.state);
        }
      }

      // HALF_OPEN: limit concurrent attempts
      if (state.state === 'HALF_OPEN') {
        if (state.halfOpenAttempts >= halfOpenMaxAttempts) {
          throw new CircuitBreakerError(name, state.state);
        }
        state.halfOpenAttempts++;
      }

      try {
        const result = await fn();
        onSuccess();
        return result;
      } catch (error) {
        onFailure();
        throw error;
      }
    },

    getState(): CircuitBreakerState {
      return { ...state };
    },

    reset(): void {
      state.state = 'CLOSED';
      state.failures = 0;
      state.lastFailureTime = null;
      state.halfOpenAttempts = 0;
    },
  };
}
