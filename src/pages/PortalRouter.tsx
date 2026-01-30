import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/contexts/AuthContext";

/**
 * 🔐 PORTAL ROUTER — Passthrough Puro
 *
 * REGRA ABSOLUTA (P2):
 * - NÃO resolve estado de identidade
 * - NÃO decide destino
 * - NÃO tem fallback para wizard
 *
 * Responsabilidade ÚNICA:
 * - Aguardar auth loading
 * - Redirecionar para /login se não autenticado
 * - Delegar todo o resto para IdentityGate (que envolve este componente)
 *
 * O IdentityGate é o ÚNICO responsável por:
 * - Resolver estado de identidade
 * - Decidir redirects (wizard, admin, tenant)
 * - Renderizar erros
 */
export default function PortalRouter() {
  const { isAuthenticated, isLoading } = useCurrentUser();

  // ÚNICO loading permitido: auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // NÃO autenticado → login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // AUTENTICADO:
  // O IdentityGate (wrapper) decide o que fazer.
  // Este componente retorna null — a rota /portal é resolvida pelo IdentityGate
  // que irá redirecionar para o redirectPath apropriado ou mostrar erro.
  return null;
}
