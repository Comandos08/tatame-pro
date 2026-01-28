import { ReactNode } from "react";

interface IdentityGuardProps {
  children: ReactNode;
}

/**
 * 🔓 IdentityGuard — PASS-THROUGH (NEUTRO)
 *
 * IMPORTANTE:
 * - NÃO faz redirect
 * - NÃO renderiza loader
 * - NÃO consome IdentityContext
 * - NÃO consome AuthContext
 *
 * Toda decisão de navegação e bloqueio é responsabilidade
 * EXCLUSIVA do IdentityGate.
 *
 * Este componente existe APENAS para manter compatibilidade
 * estrutural com AppProviders.
 */
export function IdentityGuard({ children }: IdentityGuardProps) {
  return <>{children}</>;
}

export default IdentityGuard;
