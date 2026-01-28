/**
 * 🔐 IDENTITY GUARD — Compatibility Re-export
 * 
 * F0.2.1 CONTRACT: This is now a pass-through wrapper.
 * All routing logic lives in IdentityGate.
 * 
 * Kept ONLY for backward compatibility with existing imports.
 * NO ROUTING LOGIC HERE.
 */
import React, { ReactNode } from 'react';

interface IdentityGuardProps {
  children: ReactNode;
}

/**
 * Pass-through wrapper for backward compatibility.
 * Does NOT make any routing decisions.
 */
export function IdentityGuard({ children }: IdentityGuardProps) {
  return <React.Fragment>{children}</React.Fragment>;
}

export default IdentityGuard;
