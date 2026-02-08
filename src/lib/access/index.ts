/**
 * 🔐 ACCESS MODULE — Central Export Point
 * 
 * SAFE GOLD CONTRACT:
 * One resolver. All guards consume it.
 */

export type {
  AccessDeniedReason,
  AccessResult,
  AccessContext,
  AccessResolutionInput,
} from './types';

export { ACCESS_RESOLUTION_TIMEOUT_MS } from './types';

export { resolveAccess, inferRouteContext } from './resolveAccess';
