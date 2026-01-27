/**
 * 🔐 PORTAL ROUTER — SINGLE DECISION POINT
 *
 * Este é o ÚNICO componente que decide o destino final após login.
 *
 * REGRAS IMUTÁVEIS:
 * 1. Usuário não autenticado → /login
 * 2. Global Superadmin → /admin
 * 3. Admin/Staff de tenant → resolver billing → /{tenant}/app
 * 4. Atleta comum → /{tenant}/portal
 * 5. Fallback → exibir estado neutro (nunca loop)
 *
 * NENHUM outro componente pode ter lógica de redirect pós-login.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";

import { useCurrentUser } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveTenantBillingState } from "@/lib/billing";
import { resolveAdminPostLoginRedirect } from "@/lib/resolveAdminPostLoginRedirect";
import { useI18n } from "@/contexts/I18nContext";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RouterState = "loading" | "not_authenticated" | "resolving_destination" | "redirecting" | "no_context";

export default function PortalRouter() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const { currentUser, isAuthenticated, isLoading, isGlobalSuperadmin, signOut } = useCurrentUser();

  // 🔒 Guard de execução única (React 18 / StrictMode safe)
  const hasProcessedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const [routerState, setRouterState] = useState<RouterState>("loading");

  useEffect(() => {
    // ✅ Reset do guard quando o usuário muda (ou quando currentUser chega/atualiza)
    const userId = currentUser?.id ?? null;
    if (lastUserIdRef.current !== userId) {
      lastUserIdRef.current = userId;
      hasProcessedRef.current = false;
    }

    // Aguardar carregamento inicial do AuthContext
    if (isLoading) {
      setRouterState("loading");
      return;
    }

    // 1️⃣ Usuário NÃO autenticado → /login
    if (!isAuthenticated || !currentUser) {
      setRouterState("not_authenticated");
      navigate("/login", { replace: true });
      return;
    }

    // Evitar processamento duplicado
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    setRouterState("resolving_destination");
    resolveDestination();
    // ✅ CRÍTICO: incluir isGlobalSuperadmin para o router reagir corretamente
  }, [isLoading, isAuthenticated, currentUser, isGlobalSuperadmin, navigate]);

  const resolveDestination = async () => {
    try {
      // 🔍 DEBUG: Log state for diagnosis (remove after fix confirmed)
      console.info("[PortalRouter] Resolving destination", {
        userId: currentUser?.id,
        roles: currentUser?.roles?.map(r => ({ role: r.role, tenantId: r.tenantId })),
        isGlobalSuperadmin,
      });

      // 2️⃣ Global Superadmin → /admin
      if (isGlobalSuperadmin) {
        console.info("[PortalRouter] → Routing to /admin (Global Superadmin)");
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

      console.info("[PortalRouter] Admin roles query result", {
        adminRoles,
        rolesError: rolesError?.message,
      });

      if (rolesError) {
        console.error("[PortalRouter] Failed to fetch admin roles", rolesError);
      }

      if (adminRoles && adminRoles.length > 0) {
        const tenantId = adminRoles[0].tenant_id;
        const tenantSlug = (adminRoles[0] as any).tenants?.slug;

        console.info("[PortalRouter] → Found admin role", { tenantId, tenantSlug });

        if (tenantSlug && tenantId) {
          await redirectToTenantAdmin(tenantId, tenantSlug);
          return;
        }
      }

      // 4️⃣ Buscar vínculo de atleta
      const { data: athleteData, error: athleteError } = await supabase
        .from("athletes")
        .select("tenant_id, tenants!inner(slug)")
        .eq("profile_id", currentUser!.id)
        .limit(1);

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

      // 5️⃣ Buscar membership pendente
      const { data: pendingMembership, error: membershipError } = await supabase
        .from("memberships")
        .select("tenant_id, tenants!inner(slug)")
        .eq("applicant_profile_id", currentUser!.id)
        .order("created_at", { ascending: false })
        .limit(1);

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

      // 6️⃣ FALLBACK: Nenhum contexto válido
      setRouterState("no_context");
    } catch (error) {
      console.error("[PortalRouter] Unexpected error during destination resolution", error);
      setRouterState("no_context");
    }
  };

  const redirectToTenantAdmin = async (tenantId: string, tenantSlug: string) => {
    try {
      const { data: tenantData } = await supabase.from("tenants").select("is_active").eq("id", tenantId).maybeSingle();

      const { data: billingData } = await supabase
        .from("tenant_billing")
        .select("status, is_manual_override, override_reason, override_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();

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
  if (routerState === "loading" || routerState === "resolving_destination" || routerState === "redirecting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {routerState === "loading" && t("common.loading")}
            {routerState === "resolving_destination" && t("portal.resolvingDestination")}
            {routerState === "redirecting" && t("portal.redirecting")}
          </p>
        </div>
      </div>
    );
  }

  if (routerState === "no_context") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>{t("portal.noContextTitle")}</CardTitle>
            <CardDescription>{t("join.noContextCtaDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => navigate("/join", { replace: true })} className="w-full">
              {t("join.noContextCta")}
            </Button>
            <Button onClick={handleGoHome} variant="outline" className="w-full">
              {t("common.goToHome")}
            </Button>
            <Button onClick={handleLogout} variant="ghost" className="w-full">
              {t("auth.logout")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
