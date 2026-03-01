import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tenant, TenantContext as TenantContextType } from "@/types/tenant";
import { useCurrentUser } from "@/contexts/AuthContext";

interface ExtendedTenantContext extends TenantContextType {
  billingInfo: TenantBillingInfo | null;
  refetchTenant: () => void;
  boundaryViolation: boolean;
}

interface TenantBillingInfo {
  status: string;
  stripe_customer_id: string | null;
  scheduled_delete_at: string | null;
  trial_expires_at: string | null;
}

const TenantContext = createContext<ExtendedTenantContext | undefined>(undefined);

// ============================================================================
// RESERVED SLUGS — Symmetric validation (creation + resolution)
// Must stay in sync with IdentityGate.tsx RESERVED_ROUTE_SEGMENTS
// and lib/slugify.ts RESERVED_SLUGS
// ============================================================================
const RESERVED_SLUGS = new Set([
  'about', 'admin', 'api', 'app', 'auth',
  'forgot-password', 'help', 'identity', 'join',
  'login', 'logout', 'portal', 'reset-password',
  'signup', 'verify',
]);

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { currentUser, isAuthenticated, isGlobalSuperadmin, currentRolesByTenant } = useCurrentUser();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [billingInfo, setBillingInfo] = useState<TenantBillingInfo | null>(null);
  const [boundaryViolation, setBoundaryViolation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ✅ UX/02 — Refetch trigger for forcing context reload
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // 🔐 HARDENING: Track mount state to prevent setState after unmount
  const isMountedRef = useRef(true);

  // ✅ P-IMP-01 — Guard to prevent concurrent fetches
  const isFetchingRef = useRef(false);

  // ✅ UX/02 — Expose refetch function
  const refetchTenant = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // ✅ P-IMP-FIX — Separate mount/unmount tracking from fetch effect
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // =========================================================================
  // BOUNDARY VIOLATION — Separated from fetch to avoid currentUser in deps
  // Runs when tenant or auth state changes, but does NOT re-trigger fetch
  // =========================================================================
  useEffect(() => {
    if (!tenant) {
      setBoundaryViolation(false);
      return;
    }

    if (isAuthenticated && currentUser && !isGlobalSuperadmin) {
      const hasAccess = currentRolesByTenant.has(tenant.id);
      setBoundaryViolation(!hasAccess);
    } else if (isAuthenticated && !currentUser) {
      // Profile still loading — do not set boundary violation yet
      setBoundaryViolation(false);
    } else {
      // SUPERADMIN handled by IdentityGate, unauthenticated handled by RLS
      setBoundaryViolation(false);
    }
  }, [tenant, isAuthenticated, currentUser, isGlobalSuperadmin, currentRolesByTenant]);

  // ============================================================================
  // SLUG STABILITY — Prevent redundant fetch for identical slug + trigger
  // ============================================================================
  const previousSlugRef = useRef<string | undefined>(undefined);
  const previousTriggerRef = useRef<number>(0);

  // =========================================================================
  // FETCH EFFECT — Stable dependencies only
  // Does NOT depend on currentUser (boundary check is separate)
  // =========================================================================
  useEffect(() => {
    const abortController = new AbortController();

    async function fetchTenant() {
      // ✅ P-IMP-01 — Prevent concurrent fetches
      if (isFetchingRef.current) {
        logger.debug("[TENANT] Fetch already in progress, skipping");
        return;
      }

      // =====================================================================
      // GUARD 1: No slug
      // =====================================================================
      if (!tenantSlug) {
        if (isMountedRef.current) {
          setTenant(null);
          setBillingInfo(null);
          setIsLoading(false);
        }
        return;
      }

      // =====================================================================
      // GUARD 1.5: Same slug + same trigger — prevent redundant fetch
      // refetchTrigger bypass ensures refetchTenant() always works
      // =====================================================================
      if (previousSlugRef.current === tenantSlug && previousTriggerRef.current === refetchTrigger) {
        logger.debug("[TENANT] Slug and trigger unchanged, skipping fetch");
        return;
      }

      previousSlugRef.current = tenantSlug;
      previousTriggerRef.current = refetchTrigger;

      // =====================================================================
      // GUARD 2: Reserved slug — fail-closed, no network request
      // Symmetric with creation-time validation in slugify.ts
      // =====================================================================
      if (RESERVED_SLUGS.has(tenantSlug)) {
        logger.warn("[TENANT] Reserved slug detected at resolution:", tenantSlug);
        if (isMountedRef.current) {
          setError(new Error("Organização não encontrada"));
          setTenant(null);
          setBillingInfo(null);
          setIsLoading(false);
        }
        return;
      }

      isFetchingRef.current = true;
      logger.debug("[TENANT] Fetch started for slug:", tenantSlug);

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);

        // 🔒 HARD RESET — prevent stale tenant flash during slug transitions
        setTenant(null);
        setBillingInfo(null);
      }

      try {
        // =================================================================
        // PATCH A: .maybeSingle() — 0 rows = null, not PGRST116
        // =================================================================
        let { data, error: fetchError } = await supabase
          .from("tenants")
          .select("*")
          .eq("slug", tenantSlug)
          .eq("is_active", true)
          .maybeSingle();

        if (abortController.signal.aborted) return;

        if (fetchError) {
          throw fetchError; // real DB/network error
        }

        // If not found as active, check inactive
        if (!data) {
          const { data: inactiveTenant, error: inactiveError } = await supabase
            .from("tenants")
            .select("*")
            .eq("slug", tenantSlug)
            .eq("is_active", false)
            .maybeSingle();

          if (abortController.signal.aborted) return;

          if (inactiveError) {
            throw inactiveError;
          }

          if (inactiveTenant) {
            data = inactiveTenant;
          }
        }

        if (!isMountedRef.current) return;

        if (!data) {
          // Slug does not match any tenant (active or inactive)
          setError(new Error("Organização não encontrada"));
          setTenant(null);
          setBillingInfo(null);
        } else {
          const tenantData: Tenant = {
            id: data.id,
            slug: data.slug,
            name: data.name,
            description: data.description,
            logoUrl: data.logo_url,
            primaryColor: data.primary_color || "#dc2626",
            sportTypes: (data.sport_types || []) as Tenant["sportTypes"],
            stripeCustomerId: data.stripe_customer_id,
            isActive: data.is_active ?? true,
            createdAt: data.created_at ?? "",
            updatedAt: data.updated_at ?? "",
            onboardingCompleted: data.onboarding_completed ?? undefined,
            status: (data.status as Tenant["status"]) ?? undefined,
            creationSource: (data.creation_source as Tenant["creationSource"]) ?? undefined,
          };
          setTenant(tenantData);

          // Fetch billing info
          if (!abortController.signal.aborted) {
            const { data: billing } = await supabase
              .from("tenant_billing")
              .select("status, stripe_customer_id, scheduled_delete_at, trial_expires_at")
              .eq("tenant_id", data.id)
              .maybeSingle();

            if (!abortController.signal.aborted && isMountedRef.current) {
              setBillingInfo(billing);
            }
          }
        }
      } catch (err) {
        if (abortController.signal.aborted || !isMountedRef.current) return;

        logger.error("[TENANT] Fetch error:", err);
        setError(err instanceof Error ? err : new Error("Erro ao carregar organização"));
        setTenant(null);
        setBillingInfo(null);
      } finally {
        isFetchingRef.current = false;
        if (!abortController.signal.aborted && isMountedRef.current) {
          setIsLoading(false);
          logger.debug("[TENANT] Fetch completed");
        }
      }
    }

    fetchTenant();

    return () => {
      abortController.abort();
    };
  }, [tenantSlug, refetchTrigger]);

  return (
    <TenantContext.Provider value={{ tenant, isLoading, error, billingInfo, refetchTenant, boundaryViolation }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
