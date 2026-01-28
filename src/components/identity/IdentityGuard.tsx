/**
 * 🔐 IDENTITY GUARD — Global Enforcement (HARDENED)
 *
 * GOAL:
 * - Public routes must NEVER be blocked by identity/auth loaders
 * - Only authenticated users can be blocked by identity resolution
 * - Wizard redirects must be deterministic and loop-safe
 *
 * WHY THIS FIX:
 * - Trailing slash / basename / pathname mismatch was breaking BYPASS
 * - Loader was being shown even when bypass should apply
 */

import React, { ReactNode, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useIdentity } from "@/contexts/IdentityContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { IdentityErrorScreen } from "./IdentityErrorScreen";

interface IdentityGuardProps {
  children: ReactNode;
}

/** Normalize pathname to avoid bypass mismatch:
 * - remove query/hash from decision (location.pathname already has none, but keep safe)
 * - remove trailing slashes (except root)
 */
function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  // Remove trailing slashes
  const noTrailing = pathname.replace(/\/+$/, "");
  return noTrailing === "" ? "/" : noTrailing;
}

/**
 * Routes that MUST bypass identity enforcement.
 * IMPORTANT: compare against normalized pathname.
 */
const BYPASS_ROUTES = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/help",
  "/auth/callback",
  "/identity/wizard",
  "/identity/error",
]);

/**
 * Public tenant routes that don't require identity.
 * Patterns are tested against normalized pathname.
 */
const PUBLIC_TENANT_PATTERNS: RegExp[] = [
  /^\/[^/]+\/verify\//, // /:tenant/verify/*
  /^\/[^/]+\/membership\/new$/, // /:tenant/membership/new
  /^\/[^/]+\/membership\/adult$/, // /:tenant/membership/adult
  /^\/[^/]+\/membership\/youth$/, // /:tenant/membership/youth
  /^\/[^/]+\/membership\/success$/, // /:tenant/membership/success
  /^\/[^/]+\/academies$/, // /:tenant/academies
  /^\/[^/]+\/rankings$/, // /:tenant/rankings
  /^\/[^/]+\/events$/, // /:tenant/events (public list)
  /^\/[^/]+\/events\/[^/]+$/, // /:tenant/events/:id (public detail)
  /^\/[^/]+\/login$/, // /:tenant/login (athlete login)
  /^\/[^/]+$/, // /:tenant (landing)
];

export function IdentityGuard({ children }: IdentityGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { identityState, error } = useIdentity();
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();

  // Prevent repeated redirects
  const redirectedRef = useRef<string | null>(null);

  const pathname = useMemo(() => normalizePathname(location.pathname), [location.pathname]);

  const shouldBypass = useMemo(() => {
    if (BYPASS_ROUTES.has(pathname)) return true;
    return PUBLIC_TENANT_PATTERNS.some((re) => re.test(pathname));
  }, [pathname]);

  // Reset redirect memory when route changes
  useEffect(() => {
    redirectedRef.current = null;
  }, [pathname]);

  /**
   * Redirect rule: only for AUTHENTICATED users
   * - wizard_required => /identity/wizard
   */
  useEffect(() => {
    // Never enforce on bypass routes
    if (shouldBypass) return;

    // Only enforce identity routing when user is authenticated
    if (!isAuthenticated) return;

    // If identity says wizard required, force wizard
    if (identityState === "wizard_required") {
      const target = "/identity/wizard";
      if (redirectedRef.current === target) return; // loop guard
      redirectedRef.current = target;
      navigate(target, { replace: true });
      return;
    }
  }, [shouldBypass, isAuthenticated, identityState, navigate]);

  /**
   * ✅ ABSOLUTE RULE:
   * Public routes MUST render immediately.
   */
  if (shouldBypass) {
    return <>{children}</>;
  }

  /**
   * ✅ If user is not authenticated:
   * Do NOT block with loaders here.
   * Let routes/components decide (ex: /portal may redirect, /login renders, etc).
   */
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  /**
   * ✅ From here: user IS authenticated.
   * Now we can show loaders/errors for identity resolution.
   */
  if (authLoading || identityState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando identidade...</p>
        </div>
      </div>
    );
  }

  if (identityState === "error" && error) {
    return <IdentityErrorScreen error={error} />;
  }

  // If wizard_required and we are authenticated, effect will redirect; show a tiny loader while moving.
  if (identityState === "wizard_required") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Redirecionando para configuração...</p>
        </div>
      </div>
    );
  }

  // resolved or superadmin: allow app to render; other guards handle permissions
  return <>{children}</>;
}

export default IdentityGuard;
