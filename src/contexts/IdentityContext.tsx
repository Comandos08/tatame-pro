// src/contexts/IdentityContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/contexts/AuthContext";
import { emitInstitutionalEvent } from "@/lib/institutional";

export type IdentityState = "loading" | "wizard_required" | "resolved" | "superadmin" | "error";

export interface IdentityError {
  code:
    | "TENANT_NOT_FOUND"
    | "TENANT_INACTIVE"
    | "INVITE_INVALID"
    | "PERMISSION_DENIED"
    | "IMPERSONATION_INVALID"
    | "SLUG_TAKEN"
    | "VALIDATION_ERROR"
    | "PROFILE_NOT_FOUND"
    | "NO_ROLES_ASSIGNED"
    | "BILLING_BLOCKED"
    | "IDENTITY_TIMEOUT"
    | "ALREADY_REQUESTED"
    | "ALREADY_MEMBER"
    | "ONBOARDING_FORBIDDEN"
    | "NOT_IMPLEMENTED"
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
  role: "ADMIN_TENANT" | "ATLETA" | "SUPERADMIN_GLOBAL" | null;
  redirectPath: string | null;
  refreshIdentity: () => Promise<void>;
  completeWizard: (payload: any) => Promise<any>;
  createTenant: (payload: any) => Promise<any>;
  joinExistingTenant: (payload: any) => Promise<any>;
  setIdentityError: (error: IdentityError) => void;
  clearError: () => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

const IDENTITY_TIMEOUT_MS = 12_000;

function hardAbortableFetch(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    clear: () => window.clearTimeout(timeoutId),
  };
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { session, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  const [identityState, setIdentityState] = useState<IdentityState>("loading");
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [role, setRole] = useState<"ADMIN_TENANT" | "ATLETA" | "SUPERADMIN_GLOBAL" | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const inFlightAbortRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current();
        inFlightAbortRef.current = null;
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (!isMountedRef.current) return;
    setIdentityState("loading");
    setError(null);
    setWizardCompleted(false);
    setTenant(null);
    setRole(null);
    setRedirectPath(null);
  }, []);

  const applyResult = useCallback((result: any) => {
    if (!isMountedRef.current) return;

    if (result?.status === "RESOLVED") {
      setWizardCompleted(true);
      setTenant(result.tenant || null);
      setRole(result.role || null);
      setRedirectPath(result.redirectPath || null);

      if (result.role === "SUPERADMIN_GLOBAL") setIdentityState("superadmin");
      else setIdentityState("resolved");

      setError(null);

      emitInstitutionalEvent({
        domain: "IDENTITY",
        type: "IDENTITY_RESOLVED",
        tenantId: result.tenant?.id,
        metadata: { role: result.role, status: result.status },
      });

      return;
    }

    if (result?.status === "WIZARD_REQUIRED") {
      setWizardCompleted(false);
      setTenant(null);
      setRole(null);
      setRedirectPath(null);
      setIdentityState("wizard_required");
      setError(null);
      return;
    }

    setIdentityState("error");
    setError(
      result?.error || {
        code: "UNKNOWN",
        message: "Falha ao verificar identidade.",
      },
    );
  }, []);

  const checkIdentity = useCallback(async () => {
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current();
      inFlightAbortRef.current = null;
    }

    if (!session?.user?.id || !isAuthenticated) {
      reset();
      return;
    }

    setIdentityState("loading");
    setError(null);

    const { signal, abort, clear } = hardAbortableFetch(IDENTITY_TIMEOUT_MS);
    inFlightAbortRef.current = abort;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No token");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "CHECK" }),
        signal,
      });

      if (signal.aborted) {
        setIdentityState("error");
        setError({ code: "IDENTITY_TIMEOUT", message: "Timeout identity." });
        return;
      }

      const result = await resp.json();

      if (!resp.ok) {
        setIdentityState("error");
        setError({
          code: "UNKNOWN",
          message: result?.error?.message || "Erro identidade.",
        });
        return;
      }

      // 🔥 AGORA CONSUME DIRETAMENTE
      applyResult(result);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setIdentityState("error");
        setError({ code: "IDENTITY_TIMEOUT", message: "Timeout identity." });
        return;
      }

      logger.error("[IdentityContext] checkIdentity error:", err);
      setIdentityState("error");
      setError({ code: "UNKNOWN", message: "Falha ao conectar ao serviço." });
    } finally {
      clear();
      inFlightAbortRef.current = null;
    }
  }, [applyResult, session?.user?.id, isAuthenticated, reset]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !session?.user?.id) {
      reset();
      return;
    }

    checkIdentity();

    return () => {
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current();
        inFlightAbortRef.current = null;
      }
    };
  }, [authLoading, isAuthenticated, session?.user?.id, checkIdentity, reset]);

  const refreshIdentity = async () => {
    await checkIdentity();
  };

  const completeWizard = async (payload: any) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: "COMPLETE_WIZARD", payload }),
    });

    const result = await resp.json();

    if (result?.status === "RESOLVED") {
      applyResult(result);
      return {
        success: true,
        tenant: result.tenant,
        role: result.role,
        redirectPath: result.redirectPath,
      };
    }

    return { success: false, error: result?.error };
  };

  const createTenant = async (payload: any) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: "CREATE_TENANT", payload }),
    });

    const result = await resp.json();

    if (result?.status === "RESOLVED") {
      applyResult(result);
      return {
        success: true,
        tenant: result.tenant,
        role: result.role,
        redirectPath: result.redirectPath,
      };
    }

    return { success: false, error: result?.error };
  };

  const joinExistingTenant = async (payload: any) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: "JOIN_EXISTING_TENANT", payload }),
    });

    const result = await resp.json();

    if (result?.status === "RESOLVED") {
      applyResult(result);
      return {
        success: true,
        tenant: result.tenant,
        role: result.role,
        redirectPath: result.redirectPath,
      };
    }

    return { success: false, error: result?.error };
  };

  const setIdentityError = (newError: IdentityError) => {
    setError(newError);
    setIdentityState("error");
  };

  const clearError = () => {
    setError(null);
    checkIdentity();
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
        createTenant,
        joinExistingTenant,
        setIdentityError,
        clearError,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used within an IdentityProvider");
  return ctx;
}
