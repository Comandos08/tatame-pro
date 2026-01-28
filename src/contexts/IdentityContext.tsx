/**
 * 🔐 IDENTITY CONTEXT — Consume-Only State Machine (HARDENED)
 *
 * Fixes:
 * - Never infinite 'loading'
 * - Only checks identity when authenticated AND token exists
 * - 10s timeout fail-safe
 * - Prevent concurrent checks
 * - Proper response.ok handling
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/contexts/AuthContext";

export type IdentityState =
  | "resolved" // stable / neutral (doesn't block UI by itself)
  | "loading"
  | "wizard_required"
  | "superadmin"
  | "error";

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

function resetState(setters: {
  setIdentityState: (s: IdentityState) => void;
  setError: (e: IdentityError | null) => void;
  setWizardCompleted: (b: boolean) => void;
  setTenant: (t: TenantInfo | null) => void;
  setRole: (r: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null) => void;
  setRedirectPath: (p: string | null) => void;
}) {
  setters.setIdentityState("resolved");
  setters.setError(null);
  setters.setWizardCompleted(false);
  setters.setTenant(null);
  setters.setRole(null);
  setters.setRedirectPath(null);
}

export function IdentityProvider({ children }: IdentityProviderProps) {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  // ✅ Start stable: do NOT block the app on boot
  const [identityState, setIdentityState] = useState<IdentityState>("resolved");
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [role, setRole] = useState<"ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const isCheckingRef = useRef(false);

  const clearTimersAndAbort = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    isCheckingRef.current = false;
  };

  const checkIdentity = useCallback(async () => {
    // Prevent concurrent checks
    if (isCheckingRef.current) return;

    // Must be authenticated with a currentUser id
    if (!isAuthenticated || !currentUser?.id) {
      if (isMountedRef.current) {
        resetState({
          setIdentityState,
          setError,
          setWizardCompleted,
          setTenant,
          setRole,
          setRedirectPath,
        });
      }
      return;
    }

    isCheckingRef.current = true;
    setError(null);
    setIdentityState("loading");

    // New abort controller per check
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Hard timeout: never infinite loading
    timeoutRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      if (signal.aborted) return;
      console.error("[IdentityContext] Timeout in identity check");
      setIdentityState("error");
      setError({ code: "UNKNOWN", message: "Identity check timed out" });
      clearTimersAndAbort();
    }, 10000);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (signal.aborted) return;

      if (sessionErr) {
        throw new Error(sessionErr.message || "Failed to get session");
      }

      const accessToken = sessionData?.session?.access_token;

      // ✅ CRITICAL: If user is authenticated but token is missing -> ERROR (not loading forever)
      if (!accessToken) {
        console.error("[IdentityContext] Authenticated but no access token");
        setIdentityState("error");
        setError({ code: "UNKNOWN", message: "Missing access token after login" });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "CHECK" }),
        signal,
      });

      if (signal.aborted) return;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Identity check failed (${response.status}) ${text}`.trim());
      }

      const result = await response.json();
      if (!isMountedRef.current) return;

      switch (result.status) {
        case "RESOLVED": {
          setWizardCompleted(true);
          setTenant(result.tenant || null);
          setRole(result.role || null);
          setRedirectPath(result.redirectPath || null);

          if (result.role === "SUPERADMIN_GLOBAL") setIdentityState("superadmin");
          else setIdentityState("resolved");
          break;
        }

        case "WIZARD_REQUIRED": {
          setWizardCompleted(false);
          setTenant(null);
          setRole(null);
          setRedirectPath(null);
          setIdentityState("wizard_required");
          break;
        }

        case "ERROR": {
          setIdentityState("error");
          setError(result.error || { code: "UNKNOWN", message: "Failed to verify identity" });
          break;
        }

        default: {
          setIdentityState("error");
          setError({ code: "UNKNOWN", message: `Unknown identity status: ${String(result.status)}` });
          break;
        }
      }
    } catch (e: any) {
      if (abortRef.current?.signal.aborted) return;
      console.error("[IdentityContext] Check identity error:", e);
      if (isMountedRef.current) {
        setIdentityState("error");
        setError({ code: "UNKNOWN", message: e?.message || "Failed to connect to identity service" });
      }
    } finally {
      if (!abortRef.current?.signal.aborted) {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        isCheckingRef.current = false;
      }
    }
  }, [isAuthenticated, currentUser?.id]);

  useEffect(() => {
    isMountedRef.current = true;

    // Always cleanup previous inflight work on relevant changes
    clearTimersAndAbort();

    // While auth is loading: do not force identity to loading
    if (authLoading) {
      return () => {
        isMountedRef.current = false;
        clearTimersAndAbort();
      };
    }

    // Not authenticated: stable state
    if (!isAuthenticated || !currentUser?.id) {
      resetState({
        setIdentityState,
        setError,
        setWizardCompleted,
        setTenant,
        setRole,
        setRedirectPath,
      });

      return () => {
        isMountedRef.current = false;
        clearTimersAndAbort();
      };
    }

    // Authenticated: check identity once
    checkIdentity();

    return () => {
      isMountedRef.current = false;
      clearTimersAndAbort();
    };
  }, [authLoading, isAuthenticated, currentUser?.id, checkIdentity]);

  const refreshIdentity = async () => {
    clearTimersAndAbort();
    await checkIdentity();
  };

  const completeWizard = async (payload: CompleteWizardPayload): Promise<CompleteWizardResult> => {
    if (!currentUser?.id) {
      return { success: false, error: { code: "PERMISSION_DENIED", message: "Not authenticated" } };
    }

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (sessionErr || !accessToken) {
        return { success: false, error: { code: "PERMISSION_DENIED", message: "No session" } };
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "COMPLETE_WIZARD", payload }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          success: false,
          error: { code: "UNKNOWN", message: `Wizard failed (${response.status}) ${text}`.trim() },
        };
      }

      const result = await response.json();

      if (result.status === "RESOLVED") {
        setWizardCompleted(true);
        setTenant(result.tenant || null);
        setRole(result.role || null);
        setRedirectPath(result.redirectPath || null);

        if (result.role === "SUPERADMIN_GLOBAL") setIdentityState("superadmin");
        else setIdentityState("resolved");

        return {
          success: true,
          tenant: result.tenant,
          role: result.role,
          redirectPath: result.redirectPath,
        };
      }

      if (result.status === "ERROR") {
        return { success: false, error: result.error || { code: "UNKNOWN", message: "Failed to complete wizard" } };
      }

      return { success: false, error: { code: "UNKNOWN", message: "Unexpected response" } };
    } catch (e: any) {
      console.error("[IdentityContext] Complete wizard error:", e);
      return { success: false, error: { code: "UNKNOWN", message: e?.message || "Failed to complete wizard" } };
    }
  };

  const setIdentityError = (newError: IdentityError) => {
    setError(newError);
    setIdentityState("error");
  };

  const clearError = () => {
    setError(null);
    // Re-check only if authenticated; otherwise keep stable
    if (isAuthenticated && currentUser?.id) {
      refreshIdentity();
    } else {
      setIdentityState("resolved");
    }
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
  if (!context) throw new Error("useIdentity must be used within an IdentityProvider");
  return context;
}
