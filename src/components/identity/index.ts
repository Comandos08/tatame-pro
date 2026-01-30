/**
 * 🔐 Identity Components — Single Gate Architecture
 * 
 * P2: IdentityGate is the ONLY canonical gate.
 * All identity decisions go through src/lib/identity module.
 */
export { IdentityGate } from './IdentityGate';
export { IdentityErrorScreen, IdentityErrorPage } from './IdentityErrorScreen';
export { IdentityLoadingScreen } from './IdentityLoadingScreen';
