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
        metadata: {
          role: result.role,
          status: result.status,
        },
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

  // ============================
  // CHECK IDENTITY (COM TIMEOUT)
  // ============================

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
      const invokePromise = supabase.functions.invoke("resolve-identity-wizard", { body: { action: "CHECK" } });

      const abortPromise = new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

      const { data: invokeResult, error: invokeError } = (await Promise.race([invokePromise, abortPromise])) as any;

      if (invokeError) throw invokeError;

      const unwrapped = invokeResult?.ok ? invokeResult.data : invokeResult;

      applyResult(unwrapped);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setIdentityState("error");
        setError({
          code: "IDENTITY_TIMEOUT",
          message: "Timeout identity.",
        });
        return;
      }

      logger.error("[IdentityContext] checkIdentity error:", err);

      setIdentityState("error");
      setError({
        code: "UNKNOWN",
        message: "Falha ao conectar ao serviço.",
      });
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

  // ============================
  // COMPLETE WIZARD
  // ============================

  const completeWizard = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke("resolve-identity-wizard", {
      body: { action: "COMPLETE_WIZARD", payload },
    });

    if (error) {
      return {
        success: false,
        error: { code: "UNKNOWN", message: error.message },
      };
    }

    const unwrapped = data?.ok ? data.data : data;

    if (unwrapped?.status === "RESOLVED") {
      applyResult(unwrapped);
      return {
        success: true,
        tenant: unwrapped.tenant,
        role: unwrapped.role,
        redirectPath: unwrapped.redirectPath,
      };
    }

    return { success: false, error: unwrapped?.error };
  };

  // ============================
  // CREATE TENANT
  // ============================

  const createTenant = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke("resolve-identity-wizard", {
      body: { action: "CREATE_TENANT", payload },
    });

    if (error) {
      return {
        success: false,
        error: { code: "UNKNOWN", message: error.message },
      };
    }

    const unwrapped = data?.ok ? data.data : data;

    if (unwrapped?.status === "RESOLVED") {
      applyResult(unwrapped);
      return {
        success: true,
        tenant: unwrapped.tenant,
        role: unwrapped.role,
        redirectPath: unwrapped.redirectPath,
      };
    }

    return { success: false, error: unwrapped?.error };
  };

  // ============================
  // JOIN EXISTING TENANT
  // ============================

  const joinExistingTenant = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke("resolve-identity-wizard", {
      body: { action: "JOIN_EXISTING_TENANT", payload },
    });

    if (error) {
      return {
        success: false,
        error: { code: "UNKNOWN", message: error.message },
      };
    }

    const unwrapped = data?.ok ? data.data : data;

    if (unwrapped?.status === "RESOLVED") {
      applyResult(unwrapped);
      return {
        success: true,
        tenant: unwrapped.tenant,
        role: unwrapped.role,
        redirectPath: unwrapped.redirectPath,
      };
    }

    return { success: false, error: unwrapped?.error };
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
