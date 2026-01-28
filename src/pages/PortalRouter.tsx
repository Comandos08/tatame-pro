import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";

export default function PortalRouter() {
  const { isAuthenticated, isLoading, isGlobalSuperadmin } = useCurrentUser();
  const { identityState, wizardCompleted, redirectPath } = useIdentity();

  /**
   * 🔐 REGRA ABSOLUTA
   * PortalRouter só bloqueia por AUTH.
   * Identity nunca deve travar render aqui.
   */

  // 1️⃣ Auth ainda carregando (ÚNICO loading permitido aqui)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // 2️⃣ Não autenticado → login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 3️⃣ Wizard obrigatório
  if (identityState === "wizard_required" || (!wizardCompleted && identityState !== "superadmin")) {
    return <Navigate to="/identity/wizard" replace />;
  }

  // 4️⃣ Superadmin global
  if (identityState === "superadmin" || isGlobalSuperadmin) {
    return <Navigate to="/admin" replace />;
  }

  // 5️⃣ Redirect resolvido pelo backend
  if (identityState === "resolved" && redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  // 6️⃣ Fallback seguro (nunca spinner infinito)
  return <Navigate to="/identity/wizard" replace />;
}
