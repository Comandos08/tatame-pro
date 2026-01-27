/**
 * 🔐 PORTAL ROUTER — SINGLE DECISION POINT (SECURITY HARDENED)
 *
 * Este é o ÚNICO componente que decide o destino final após login.
 *
 * REGRAS IMUTÁVEIS (veja docs/SECURITY-AUTH-CONTRACT.md):
 * 1. Usuário não autenticado → /login
 * 2. Wizard não completo → /identity/wizard (BLOCKING)
 * 3. Global Superadmin → /admin
 * 4. Admin/Staff de tenant → resolver billing → /{tenant}/app
 * 5. Atleta comum → /{tenant}/portal
 * 6. Fallback → /identity/wizard (force wizard)
 *
 * SECURITY PATTERNS:
 * - AbortController for all async operations
 * - useRef guards for single execution
 * - No setTimeout for redirects
 * - Deterministic state transitions
 *
 * NENHUM outro componente pode ter lógica de redirect pós-login.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";

import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveTenantBillingState } from "@/lib/billing";
import { resolveAdminPostLoginRedirect } from "@/lib/resolveAdminPostLoginRedirect";
import { useI18n } from "@/contexts/I18nContext";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RouterState = "loading" | "not_authenticated" | "wizard_required" | "resolving_destination" | "redirecting" | "no_context";

export default function PortalRouter() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const { currentUser, isAuthenticated, isLoading, isGlobalSuperadmin, signOut } = useCurrentUser();
  const { identityState, wizardCompleted } = useIdentity();

  // 🔒 Guard de execução única (React 18 / StrictMode safe)
  const hasProcessedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  
  // 🔒 AbortController for async operations
  const abortControllerRef = useRef<AbortController | null>(null);

  const [routerState, setRouterState] = useState<RouterState>("loading");

  useEffect(() => {
    // 🔒 Create new AbortController for this effect run
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // ✅ Reset do guard quando o usuário muda (ou quando currentUser chega/atualiza)
    const userId = currentUser?.id ?? null;
    if (lastUserIdRef.current !== userId) {
      lastUserIdRef.current = userId;
      hasProcessedRef.current = false;
    }

    // Aguardar carregamento inicial do AuthContext e IdentityContext
    if (isLoading || identityState === 'loading') {
      setRouterState("loading");
      return;
    }

    // 1️⃣ Usuário NÃO autenticado → /login
    if (!isAuthenticated || !currentUser) {
      setRouterState("not_authenticated");
      navigate("/login", { replace: true });
      return;
    }

    // 2️⃣ Wizard NÃO completo → /identity/wizard (BLOCKING)
    if (identityState === 'wizard_required' || (!wizardCompleted && identityState !== 'superadmin')) {
      setRouterState("wizard_required");
      navigate("/identity/wizard", { replace: true });
      return;
    }

    // Evitar processamento duplicado
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    setRouterState("resolving_destination");
    resolveDestination(signal);
    
    // 🔒 Cleanup: abort ongoing operations
    return () => {
      abortControllerRef.current?.abort();
    };
    // ✅ CRÍTICO: incluir identityState e wizardCompleted para reagir corretamente
  }, [isLoading, isAuthenticated, currentUser, isGlobalSuperadmin, identityState, wizardCompleted, navigate]);

  const resolveDestination = async (signal: AbortSignal) => {
    try {
      // 🔒 Check abort before each async operation
      if (signal.aborted) return;

      // 2️⃣ Global Superadmin → /admin
      if (isGlobalSuperadmin) {
        setRouterState("redirecting");
        navigate("/admin", { replace: true });
        return;
      }

      // 3️⃣ Buscar papéis administrativos do usuário
      const { data: adminRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("tenant_id, tenants!inner(slug)")
        .eq("user_id", currentUser!.id)
        .in("role", ["ADMIN_TENANT", "STAFF_ORGANIZACAO", "COACH_PRINCIPAL"])
        .limit(1);

      if (signal.aborted) return;

      if (rolesError) {
        console.error("[PortalRouter] Failed to fetch admin roles", rolesError);
      }

      if (adminRoles && adminRoles.length > 0) {
        const tenantId = adminRoles[0].tenant_id;
        const tenantSlug = (adminRoles[0] as any).tenants?.slug;

        if (tenantSlug && tenantId) {
          await redirectToTenantAdmin(tenantId, tenantSlug, signal);
          return;
        }
      }

      if (signal.aborted) return;

      // 4️⃣ Buscar vínculo de atleta
      const { data: athleteData, error: athleteError } = await supabase
        .from("athletes")
        .select("tenant_id, tenants!inner(slug)")
        .eq("profile_id", currentUser!.id)
        .limit(1);

      if (signal.aborted) return;

      if (athleteError) {
        console.error("[PortalRouter] Failed to fetch athlete data", athleteError);
      }

      if (athleteData && athleteData.length > 0) {
        const tenantSlug = (athleteData[0] as any).tenants?.slug;
        if (tenantSlug) {
          setRouterState("redirecting");
          navigate(`/${tenantSlug}/portal`, { replace: true });
          return;
        }
      }

      if (signal.aborted) return;

      // 5️⃣ Buscar membership pendente
      const { data: pendingMembership, error: membershipError } = await supabase
        .from("memberships")
        .select("tenant_id, tenants!inner(slug)")
        .eq("applicant_profile_id", currentUser!.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (signal.aborted) return;

      if (membershipError) {
        console.error("[PortalRouter] Failed to fetch pending membership", membershipError);
      }

      if (pendingMembership && pendingMembership.length > 0) {
        const tenantSlug = (pendingMembership[0] as any).tenants?.slug;
        if (tenantSlug) {
          setRouterState("redirecting");
          navigate(`/${tenantSlug}/membership/status`, { replace: true });
          return;
        }
      }

      // 6️⃣ FALLBACK: Nenhum contexto válido → force wizard
      setRouterState("no_context");
      // Instead of showing no_context screen, force wizard
      navigate("/identity/wizard", { replace: true });
    } catch (error) {
      if (signal.aborted) return;
      console.error("[PortalRouter] Unexpected error during destination resolution", error);
      setRouterState("no_context");
      navigate("/identity/wizard", { replace: true });
    }
  };

  const redirectToTenantAdmin = async (tenantId: string, tenantSlug: string, signal: AbortSignal) => {
    try {
      if (signal.aborted) return;

      const { data: tenantData } = await supabase.from("tenants").select("is_active").eq("id", tenantId).maybeSingle();

      if (signal.aborted) return;

      const { data: billingData } = await supabase
        .from("tenant_billing")
        .select("status, is_manual_override, override_reason, override_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (signal.aborted) return;

      const billingState = resolveTenantBillingState(
        billingData
          ? {
              status: billingData.status,
              is_manual_override: billingData.is_manual_override ?? false,
              override_reason: billingData.override_reason,
              override_at: billingData.override_at,
            }
          : null,
        tenantData ? { is_active: tenantData.is_active ?? false } : null,
      );

      const destination = resolveAdminPostLoginRedirect(tenantSlug, billingState);

      setRouterState("redirecting");
      navigate(destination, { replace: true });
    } catch (error) {
      if (signal.aborted) return;
      console.error("[PortalRouter] Failed to resolve tenant admin destination", error);
      setRouterState("redirecting");
      navigate(`/${tenantSlug}/app`, { replace: true });
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleGoHome = () => {
    navigate("/", { replace: true });
  };

  // ===== RENDER =====
  if (routerState === "loading" || routerState === "resolving_destination" || routerState === "redirecting" || routerState === "wizard_required") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {routerState === "loading" && t("common.loading")}
            {routerState === "resolving_destination" && t("portal.resolvingDestination")}
            {routerState === "redirecting" && t("portal.redirecting")}
            {routerState === "wizard_required" && t("portal.redirecting")}
          </p>
        </div>
      </div>
    );
  }

  // 🔒 no_context should never be rendered - always redirect to wizard
  // This is a fallback in case the navigate() in resolveDestination didn't work
  if (routerState === "no_context") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t("portal.redirecting")}</p>
        </div>
      </div>
    );
  }

  return null;
}
