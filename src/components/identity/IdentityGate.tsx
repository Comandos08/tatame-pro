/**
 * 🔐 IDENTITY GATE — Single Canonical Router/Guard
 *
 * FIX: Never block PUBLIC ROUTES.
 * - Public routes must render even if auth/identity are "loading"
 * - Prevents global "Carregando..." deadlocks
 */

import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useIdentity } from "@/contexts/IdentityContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";

interface IdentityGateProps {
  children: React.ReactNode;
}

/**
 * Rotas globais reservadas (não são slugs de tenant).
 * Baseado na estrutura de rotas definida em App.tsx.
 */
const RESERVED_ROUTE_SEGMENTS = new Set([
  "admin",
  "portal",
  "login",
  "auth",
  "identity",
  "help",
  "forgot-password",
  "reset-password",
]);

/**
 * Detecta estruturalmente se uma rota é de tenant (/:tenantSlug/*).
 *
 * Uma rota é de tenant se:
 * 1. Começa com / seguido de um segmento
 * 2. O primeiro segmento NÃO é uma rota global reservada
 * 3. O primeiro segmento NÃO é vazio
 *
 * Exemplos:
 * - /federacao-demo → true (tenant slug)
 * - /federacao-demo/portal → true (tenant portal)
 * - /admin → false (reservado)
 * - /login → false (reservado)
 * - / → false (root)
 */
function isTenantRoute(pathname: string): { isTenant: boolean; tenantSlug: string | null } {
  // Remove trailing slash e split
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);

  // Precisa ter pelo menos 1 segmento
  if (segments.length === 0) {
    return { isTenant: false, tenantSlug: null };
  }

  const firstSegment = segments[0].toLowerCase();

  // Se o primeiro segmento é reservado, não é rota de tenant
  if (RESERVED_ROUTE_SEGMENTS.has(firstSegment)) {
    return { isTenant: false, tenantSlug: null };
  }

  // É rota de tenant
  return { isTenant: true, tenantSlug: segments[0] };
}

/**
 * Public path rules:
 * 1) Root public: "/", "/login", "/forgot-password", "/reset-password", "/help", "/auth/callback"
 * 2) Identity flow public: "/identity/wizard", "/identity/error"
 * 3) Tenant public:
 *    "/:tenantSlug" (index), "/:tenantSlug/login",
 *    "/:tenantSlug/verify/*", "/:tenantSlug/academies", "/:tenantSlug/rankings",
 *    "/:tenantSlug/events", "/:tenantSlug/events/:id",
 *    "/:tenantSlug/membership/new|adult|youth|success"
 */
function isPublicPath(pathname: string) {
  // Root public
  const rootPublic = new Set([
    "/",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/help",
    "/auth/callback",
    "/identity/wizard",
    "/identity/error",
  ]);
  if (rootPublic.has(pathname)) return true;

  // Tenant public patterns
  const tenantPublicPatterns: RegExp[] = [
    // "/:tenantSlug" and "/:tenantSlug/login"
    /^\/[^/]+\/?$/,
    /^\/[^/]+\/login\/?$/,

    // Verify routes
    /^\/[^/]+\/verify\/card\/[^/]+\/?$/,
    /^\/[^/]+\/verify\/diploma\/[^/]+\/?$/,
    /^\/[^/]+\/verify\/membership\/[^/]+\/?$/,

    // Public lists
    /^\/[^/]+\/academies\/?$/,
    /^\/[^/]+\/rankings\/?$/,
    /^\/[^/]+\/events\/?$/,
    /^\/[^/]+\/events\/[^/]+\/?$/,

    // Public membership purchase flow
    /^\/[^/]+\/membership\/new\/?$/,
    /^\/[^/]+\/membership\/adult\/?$/,
    /^\/[^/]+\/membership\/youth\/?$/,
    /^\/[^/]+\/membership\/success\/?$/,
  ];

  return tenantPublicPatterns.some((re) => re.test(pathname));
}

/**
 * Canonical gate that enforces identity resolution before rendering protected content.
 * Uses ONLY backend state - no client-side DB queries.
 */
export function IdentityGate({ children }: IdentityGateProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  // ✅ ALL HOOKS MUST BE CALLED UNCONDITIONALLY (React rules)
  const { t } = useI18n();
  const { isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { identityState, redirectPath, error, refreshIdentity } = useIdentity();
  const { isImpersonating, session: impersonationSession } = useImpersonation();

  // ✅ HARD BYPASS: public routes must NEVER be blocked by auth/identity loaders
  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  // ===== R1: Auth loading state (ONLY for protected routes) =====
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // ===== R2: Not authenticated → redirect to login (protected routes only) =====
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ===== USER IS AUTHENTICATED FROM HERE =====

  // ===== R3: Identity loading state =====
  if (identityState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // ===== R4: Wizard required → /identity/wizard =====
  if (identityState === "wizard_required") {
    return <Navigate to="/identity/wizard" replace />;
  }

  // ===== R5: Superadmin → /admin (ou tenant se impersonating) =====
  if (identityState === "superadmin") {
    // Permitir acesso às rotas do tenant impersonado
    if (isImpersonating && impersonationSession?.targetTenantSlug) {
      const tenantPrefix = `/${impersonationSession.targetTenantSlug}`;
      if (pathname === tenantPrefix || pathname.startsWith(`${tenantPrefix}/`)) {
        return <>{children}</>;
      }
    }

    // Permitir acesso normal às rotas /admin
    if (pathname.startsWith("/admin")) return <>{children}</>;

    // ✅ AJUSTE 2: Detecção estrutural de rota de tenant
    const { isTenant, tenantSlug } = isTenantRoute(pathname);

    if (isTenant && tenantSlug) {
      // Superadmin tentando acessar rota de tenant SEM impersonation ativa
      // Mostrar UI explicativa em vez de redirect silencioso
      const hintText = t("identity.superadminTenantAccessHint").replace("{tenant}", tenantSlug);
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
              <CardTitle className="text-center">{t("impersonation.accessDenied")}</CardTitle>
              <CardDescription className="text-center">
                {t("impersonation.superadminMustImpersonate")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground text-center">
                {hintText}
              </p>
              <Button onClick={() => navigate("/admin")} className="w-full">
                {t("impersonation.goToAdmin")}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Qualquer outra rota global não /admin → redirecionar para /admin
    return <Navigate to="/admin" replace />;
  }

  // ===== R6: Resolved =====
  if (identityState === "resolved") {
    if (!redirectPath) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <CardTitle className="text-center">{t("identity.noContext")}</CardTitle>
              <CardDescription className="text-center">{t("identity.noContextDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={refreshIdentity} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("common.retry")}
              </Button>
              <Button variant="outline" onClick={() => signOut()} className="w-full">
                {t("auth.logout")}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Only auto-redirect on /portal (decision hub)
    if (pathname === "/portal" && redirectPath !== "/portal") {
      return <Navigate to={redirectPath} replace />;
    }

    return <>{children}</>;
  }

  // ===== R7: Error state =====
  if (identityState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <CardTitle className="text-center">{t("identity.error")}</CardTitle>
            <CardDescription className="text-center">{error?.message || t("identity.unknownError")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={refreshIdentity} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("common.retry")}
            </Button>
            <Button variant="outline" onClick={() => signOut()} className="w-full">
              {t("auth.logout")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback
  return <>{children}</>;
}

export default IdentityGate;
