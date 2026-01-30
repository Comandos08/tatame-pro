/**
 * 🔐 IDENTITY MODULE — Central Export Point
 */

export {
  type IdentityState,
  type IdentityResolutionInput,
  resolveIdentityState,
  isValidIdentityTransition,
  VALID_IDENTITY_TRANSITIONS,
  LOADING_STATE_CONTRACT,
} from './identity-state-machine';

export {
  type RedirectContext,
  type RedirectDecision,
  resolveIdentityRedirect,
} from './identity-redirect-map';

export {
  type ErrorEscapeOptions,
  resolveErrorEscapeHatch,
  assertErrorHasEscape,
} from './identity-error-escape';
