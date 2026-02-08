/**
 * OBSERVABILITY SAFE GOLD — v1.0
 *
 * Public API
 */

export {
  emitObservableEvent,
  registerObservabilityProvider,
  clearObservabilityProvider,
  createEvent,
} from './observability';

export { sentryProvider, datadogProvider } from './sentryProvider';

export type {
  ObservableEvent,
  ObservabilityProvider,
  SafeEventDomain,
  SafeEventLevel,
} from './types';

export { SAFE_EVENT_DOMAINS, SAFE_EVENT_LEVELS } from './types';
