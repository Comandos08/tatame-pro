import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tenant, TenantContext as TenantContextType } from "@/types/tenant";
import { useCurrentUser } from "@/contexts/AuthContext";

// ============================================================================
// P2-FIX: Zod schemas for get_tenant_with_billing RPC response.
// Validates the payload shape before any cast, catching backend schema
// changes at the boundary rather than silently propagating bad data.
// ============================================================================
const TenantRpcSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logo_url: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  sport_types: z.array(z.string()).nullable().optional(),
  stripe_customer_id: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  created_at: z.string().nullable().optional(),
  onboarding_completed: z.boolean().nullable().optional(),
  status: z.enum(['SETUP', 'ACTIVE', 'SUSPENDED']).nullable().optional(),
});

const BillingRpcSchema = z.object({
  status: z.string(),
  stripe_customer_id: z.string().nullable().optional(),
  scheduled_delete_at: z.string().nullable().optional(),
  trial_expires_at: z.string().nullable().optional(),
}).nullable();

const TenantWithBillingRpcSchema = z.object({
  tenant: TenantRpcSchema.nullable().optional(),
  billing: BillingRpcSchema.optional(),
}).nullable();

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
      // GUARD 2: Reserved slug — fail-closed, no network request
      // Symmetric with creation-time validation in slugify.ts
      // =====================================================================
      if (RESERVED_SLUGS.has(tenantSlug)) {
        // Include the full pathname so future occurrences can be traced back
        // to the originating navigation (bookmark, stale redirect, broken
        // Link, etc.). Just logging the slug loses that context.
        logger.warn("[TENANT] Reserved slug detected at resolution", {
          slug: tenantSlug,
          pathname: typeof window !== "undefined" ? window.location.pathname : null,
          search: typeof window !== "undefined" ? window.location.search : null,
        });
        if (isMountedRef.current) {
          setError(new Error("TENANT_NOT_FOUND"));
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
        // SINGLE RPC — get_tenant_with_billing (1 round-trip)
        // Returns { tenant: {...}, billing: {...} | null }
        // =================================================================
        const { data: rpcResult, error: fetchError } = await supabase
          .rpc('get_tenant_with_billing', { p_slug: tenantSlug });

        if (abortController.signal.aborted) return;
        if (fetchError) throw fetchError;
        if (!isMountedRef.current) return;

        // P2-FIX: Validate RPC payload with Zod before any field access.
        // safeParse avoids throwing so fetch errors remain distinct from schema errors.
        const parseResult = TenantWithBillingRpcSchema.safeParse(rpcResult);
        if (!parseResult.success) {
          logger.error("[TENANT] RPC schema validation failed:", parseResult.error.issues);
          setError(new Error("TENANT_SCHEMA_ERROR"));
          setTenant(null);
          setBillingInfo(null);
          return;
        }

        const rpcData = parseResult.data;
        const tenantRaw = rpcData?.tenant;

        if (!tenantRaw) {
          setError(new Error("TENANT_NOT_FOUND"));
          setTenant(null);
          setBillingInfo(null);
        } else {
          const tenantData: Tenant = {
            id: tenantRaw.id,
            slug: tenantRaw.slug,
            name: tenantRaw.name,
            description: null,
            logoUrl: tenantRaw.logo_url ?? null,
            primaryColor: tenantRaw.primary_color ?? "#dc2626",
            sportTypes: (tenantRaw.sport_types ?? []) as Tenant["sportTypes"],
            stripeCustomerId: tenantRaw.stripe_customer_id ?? null,
            isActive: tenantRaw.is_active ?? true,
            createdAt: tenantRaw.created_at ?? "",
            updatedAt: "",
            onboardingCompleted: tenantRaw.onboarding_completed ?? undefined,
            status: tenantRaw.status ?? undefined,
            creationSource: undefined,
          };
          setTenant(tenantData);
          setBillingInfo(rpcData?.billing ?? null);
        }
      } catch (err) {
        if (abortController.signal.aborted || !isMountedRef.current) return;

        logger.error("[TENANT] Fetch error:", err);
        setError(err instanceof Error ? err : new Error("TENANT_FETCH_ERROR"));
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
      isFetchingRef.current = false;
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
