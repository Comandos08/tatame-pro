/**
 * 🔐 PORTAL ROUTER — Redirect Hub (F0.2 CONTRACT-COMPLIANT)
 *
 * This component is now a SIMPLE redirect based on IdentityContext state.
 * NO client-side DB queries for routing decisions.
 * 
 * All routing logic uses ONLY:
 * - identityState from IdentityContext
 * - redirectPath from Edge Function
 * 
 * CONTRACT:
 * - C1: Single source of truth = Edge Function result
 * - C2: Deterministic navigation = redirectPath
 * - C3: No loops = check current path before redirect
 * - C4: Unauthenticated → /login
 */

import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useI18n } from "@/contexts/I18nContext";

export default function PortalRouter() {
  const { t } = useI18n();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { identityState, redirectPath } = useIdentity();

  // Prevent double processing in React 18 StrictMode
  const hasProcessedRef = useRef(false);

  // Reset on auth change
  useEffect(() => {
    hasProcessedRef.current = false;
  }, [isAuthenticated]);

  // ===== Loading state =====
  if (authLoading || identityState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // ===== Not authenticated → /login =====
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ===== Wizard required → /identity/wizard =====
  if (identityState === 'wizard_required') {
    return <Navigate to="/identity/wizard" replace />;
  }

  // ===== Superadmin → /admin =====
  if (identityState === 'superadmin') {
    return <Navigate to="/admin" replace />;
  }

  // ===== Resolved → redirectPath =====
  if (identityState === 'resolved' && redirectPath) {
    // Prevent loop: don't redirect to current path
    if (location.pathname === redirectPath) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{t("portal.redirecting")}</p>
          </div>
        </div>
      );
    }
    return <Navigate to={redirectPath} replace />;
  }

  // ===== Error or no redirect path → show loading (IdentityGate handles error) =====
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t("portal.resolvingDestination")}</p>
      </div>
    </div>
  );
}
