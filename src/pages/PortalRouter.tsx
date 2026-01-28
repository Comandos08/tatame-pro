import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useI18n } from "@/contexts/I18nContext";

export default function PortalRouter() {
  const { t } = useI18n();
  const { isAuthenticated, isLoading, isGlobalSuperadmin } = useCurrentUser();
  const { identityState, wizardCompleted, redirectPath } = useIdentity();

  // 1️⃣ Auth ainda carregando
  if (isLoading || identityState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // 2️⃣ Não autenticado
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

  // 6️⃣ Fallback seguro
  return <Navigate to="/identity/wizard" replace />;
}
