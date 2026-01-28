/**
 * 🔐 IDENTITY CONTEXT — Consume-Only State Machine
 *
 * FIXED (No infinite loader):
 * - When NOT authenticated (or no access token) => identityState becomes "resolved" (stable)
 * - checkIdentity never sets "loading" for unauthenticated
 * - Avoids re-running effect on currentUser object reference changes
 * - Prevents concurrent checks + adds request timeout
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/contexts/AuthContext";

export type IdentityState = "loading" | "wizard_required" | "resolved" | "superadmin" | "error";

export interface IdentityError {
  code:
    | "TENANT_NOT_FOUND"
    | "INVITE_INVALID"
    | "PERMISSION_DENIED"
    | "IMPERSONATION_INVALID"
    | "SLUG_TAKEN"
    | "VALIDATION_ERROR"
    | "UNKNOWN";
  message: string;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

interface IdentityContextType {
  identityState: IdentityState;
  error: IdentityError | null;
  wizardCompleted: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  tenant: TenantInfo | null;
  role: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null;
  redirectPath: string | null;
  refreshIdentity: () => Promise<void>;
  completeWizard: (payload: CompleteWizardPayload) => Promise<CompleteWizardResult>;
  setIdentityError: (error: IdentityError) => void;
  clearError: () => void;
}

export interface CompleteWizardPayload {
  joinMode: "existing" | "new";
  inviteCode?: string;
  newOrgName?: string;
  profileType: "admin" | "athlete";
}

export interface CompleteWizardResult {
  success: boolean;
  tenant?: TenantInfo;
  role?: "ADMIN_TENANT" | "ATHLETE";
  redirectPath?: string;
  error?: IdentityError;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

interface IdentityProviderProps {
  children: ReactNode;
}

function resetIdentityState(setters: {
  setIdentityState: (s: IdentityState) => void;
  setWizardCompleted: (b: boolean) => void;
  setTenant: (t: TenantInfo | null) => void;
  setRole: (r: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null) => void;
  setRedirectPath: (p: string | null) => void;
  setError: (e: IdentityError | null) => void;
}) {
  // IMPORTANT: Use a STABLE (non-loading) state when unauthenticated.
  setters.setIdentityState("resolved");
  setters.setWizardCompleted(false);
  setters.setTenant(null);
  setters.setRole(null);
  setters.setRedirectPath(null);
  setters.setError(null);
}

export function IdentityProvider({ children }: IdentityProviderProps) {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  // 🔐 F0.2.6 FIX: Start with "resolved" to avoid blocking public routes
  // Identity loading only happens AFTER auth is confirmed and user is authenticated
  const [identityState, setIdentityState] = useState<IdentityState>("resolved");
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [role, setRole] = useState<"ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCheckingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const checkIdentity = useCallback(
    async (signal: AbortSignal) => {
      // Prevent concurrent checks (StrictMode + rerenders)
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;

      try {
        // If user is missing, we must NOT go to loading
        if (!currentUser?.id) {
          if (isMountedRef.current) {
            resetIdentityState({
              setIdentityState,
              setWizardCompleted,
              setTenant,
              setRole,
              setRedirectPath,
              setError,
            });
          }
          return;
        }

        // Only authenticated users should ever be put into loading
        if (isMountedRef.current) {
          setIdentityState("loading");
          setError(null);
        }

        // Get access token
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        // If no token, treat as unauthenticated, NEVER loading forever
        if (!accessToken) {
          if (isMountedRef.current) {
            resetIdentityState({
              setIdentityState,
              setWizardCompleted,
              setTenant,
              setRole,
              setRedirectPath,
              setError,
            });
          }
          return;
        }

        // Request timeout (hard stop)
        const timeoutMs = 12000;
        const timeoutPromise = new Promise<Response>((_, reject) => {
          const t = setTimeout(() => {
            clearTimeout(t);
            reject(new Error("Identity check timed out"));
          }, timeoutMs);
        });

        const fetchPromise = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "CHECK" }),
          signal,
        });

        const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response;

        if (signal.aborted) return;

        let result: any = null;
        try {
          result = await response.json();
        } catch {
          // If backend returned non-json
          throw new Error(`Identity check failed (invalid response)`);
        }

        if (!isMountedRef.current) return;

        if (result?.status === "RESOLVED") {
          setWizardCompleted(true);
          setTenant(result.tenant || null);
          setRole(result.role || null);
          setRedirectPath(result.redirectPath || null);

          if (result.role === "SUPERADMIN_GLOBAL") {
            setIdentityState("superadmin");
          } else {
            setIdentityState("resolved");
          }
          return;
        }

        if (result?.status === "WIZARD_REQUIRED") {
          setWizardCompleted(false);
          setTenant(null);
          setRole(null);
          setRedirectPath(null);
          setError(null);
          setIdentityState("wizard_required");
          return;
        }

        if (result?.status === "ERROR") {
          setWizardCompleted(false);
          setTenant(null);
          setRole(null);
          setRedirectPath(null);
          setError(result.error || { code: "UNKNOWN", message: "Failed to verify identity" });
          setIdentityState("error");
          return;
        }

        // Unknown status
        setWizardCompleted(false);
        setTenant(null);
        setRole(null);
        setRedirectPath(null);
        setError({ code: "UNKNOWN", message: `Unknown identity status: ${String(result?.status)}` });
        setIdentityState("error");
      } catch (err: any) {
        if (signal.aborted) return;

        console.error("[IdentityContext] Check identity error:", err);

        if (isMountedRef.current) {
          setWizardCompleted(false);
          setTenant(null);
          setRole(null);
          setRedirectPath(null);
          setError({ code: "UNKNOWN", message: err?.message || "Failed to connect to identity service" });
          setIdentityState("error");
        }
      } finally {
        isCheckingRef.current = false;
      }
    },
    [currentUser?.id],
  );

  // Main effect (stable dependencies)
  useEffect(() => {
    isMountedRef.current = true;

    // Always cleanup previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // 🔐 F0.2.6 FIX: While auth is loading, DO NOT set identity to loading
    // This prevents blocking public routes during initial auth check
    if (authLoading) {
      // Keep current state (resolved by default), don't block render
      return () => {
        isMountedRef.current = false;
      };
    }

    // Not authenticated => stable resolved (NEVER loading)
    if (!isAuthenticated || !currentUser?.id) {
      resetIdentityState({
        setIdentityState,
        setWizardCompleted,
        setTenant,
        setRole,
        setRedirectPath,
        setError,
      });

      lastUserIdRef.current = null;

      return () => {
        isMountedRef.current = false;
      };
    }

    // If user changed, clear stale data quickly (but keep stable)
    if (lastUserIdRef.current !== currentUser.id) {
      lastUserIdRef.current = currentUser.id;
      setWizardCompleted(false);
      setTenant(null);
      setRole(null);
      setRedirectPath(null);
      setError(null);
    }

    // Start check
    abortControllerRef.current = new AbortController();
    void checkIdentity(abortControllerRef.current.signal);

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [authLoading, isAuthenticated, currentUser?.id, checkIdentity]);

  const refreshIdentity = async () => {
    // If not authenticated, keep stable state and stop
    if (!isAuthenticated || !currentUser?.id) {
      resetIdentityState({
        setIdentityState,
        setWizardCompleted,
        setTenant,
        setRole,
        setRedirectPath,
        setError,
      });
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    await checkIdentity(abortControllerRef.current.signal);
  };

  const completeWizard = async (payload: CompleteWizardPayload): Promise<CompleteWizardResult> => {
    if (!currentUser?.id) {
      return { success: false, error: { code: "PERMISSION_DENIED", message: "Not authenticated" } };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: { code: "PERMISSION_DENIED", message: "No session" } };
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "COMPLETE_WIZARD",
          payload,
        }),
      });

      const result = await response.json();

      if (result?.status === "RESOLVED") {
        setWizardCompleted(true);
        setTenant(result.tenant || null);
        setRole(result.role || null);
        setRedirectPath(result.redirectPath || null);

        if (result.role === "SUPERADMIN_GLOBAL") {
          setIdentityState("superadmin");
        } else {
          setIdentityState("resolved");
        }

        return {
          success: true,
          tenant: result.tenant,
          role: result.role,
          redirectPath: result.redirectPath,
        };
      }

      if (result?.status === "ERROR") {
        return {
          success: false,
          error: result.error || { code: "UNKNOWN", message: "Failed to complete wizard" },
        };
      }

      return { success: false, error: { code: "UNKNOWN", message: "Unexpected response" } };
    } catch (err) {
      console.error("[IdentityContext] Complete wizard error:", err);
      return { success: false, error: { code: "UNKNOWN", message: "Failed to complete wizard" } };
    }
  };

  const setIdentityError = (newError: IdentityError) => {
    setError(newError);
    setIdentityState("error");
  };

  const clearError = () => {
    setError(null);

    // If not authenticated, go stable
    if (!isAuthenticated || !currentUser?.id) {
      resetIdentityState({
        setIdentityState,
        setWizardCompleted,
        setTenant,
        setRole,
        setRedirectPath,
        setError,
      });
      return;
    }

    // Otherwise re-check
    void refreshIdentity();
  };

  return (
    <IdentityContext.Provider
      value={{
        identityState,
        error,
        wizardCompleted,
        tenantId: tenant?.id || null,
        tenantSlug: tenant?.slug || null,
        tenant,
        role,
        redirectPath,
        refreshIdentity,
        completeWizard,
        setIdentityError,
        clearError,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return context;
}
