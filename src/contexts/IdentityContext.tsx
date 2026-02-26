// src/contexts/IdentityContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/contexts/AuthContext";
import { emitInstitutionalEvent } from "@/lib/institutional";
import { type ContextIdentityState } from "@/lib/identity/identity-state-machine";

export type IdentityState = ContextIdentityState;

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

interface IdentityResult {
  status?: "RESOLVED" | "WIZARD_REQUIRED" | "ERROR";
  tenant?: TenantInfo;
  role?: "ADMIN_TENANT" | "ATLETA" | "SUPERADMIN_GLOBAL";
  redirectPath?: string | null;
  error?: IdentityError;
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
  completeWizard: (payload: unknown) => Promise<any>;
  createTenant: (payload: unknown) => Promise<any>;
  joinExistingTenant: (payload: unknown) => Promise<any>;
  setIdentityError: (error: IdentityError) => void;
  clearError: () => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

const IDENTITY_TIMEOUT_MS = 12_000;

function unwrapInvoke<T>(data: any): T {
  return data?.ok ? data.data : data;
}

function hardAbortableFetch(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    clear: () => window.clearTimeout(timeoutId),
  };
}

// --- Institutional emit (type-safe bypass) ---
// The institutional event bus has a closed union for "type" and strict metadata typing.
// We keep runtime events but bypass TS constraints here to avoid build breaks.
function emitInstitutional(payload: {
  domain: string;
  type: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    emitInstitutionalEvent(payload as any);
  } catch {
    // never break identity flow due to telemetry
  }
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
  const requestIdRef = useRef(0);

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

  const applyResult = useCallback((result: IdentityResult) => {
    if (!isMountedRef.current) return;

    if (result?.status === "RESOLVED") {
      setWizardCompleted(true);
      setTenant(result.tenant || null);
      setRole(result.role || null);
      setRedirectPath(result.redirectPath || null);

      setIdentityState(result.role === "SUPERADMIN_GLOBAL" ? "superadmin" : "resolved");

      setError(null);

      // Keep existing RESOLVED event (type likely exists), but still pass via wrapper for safety
      emitInstitutional({
        domain: "IDENTITY",
        type: "IDENTITY_RESOLVED",
        tenantId: result.tenant?.id,
        metadata: { role: result.role ?? null },
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

    emitInstitutional({
      domain: "IDENTITY",
      type: "IDENTITY_ERROR",
      metadata: {
        code: result?.error?.code ?? "UNKNOWN",
        message: result?.error?.message ?? "Falha ao verificar identidade.",
      },
    });
  }, []);

  // ============================
  // CHECK IDENTITY (COM TIMEOUT)
  // ============================

  const checkIdentity = useCallback(async () => {
    if (!session?.user?.id || !isAuthenticated) {
      reset();
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    if (inFlightAbortRef.current) {
      inFlightAbortRef.current();
      inFlightAbortRef.current = null;
    }

    setIdentityState("loading");
    setError(null);

    const { signal, abort, clear } = hardAbortableFetch(IDENTITY_TIMEOUT_MS);
    inFlightAbortRef.current = abort;

    try {
      const invokePromise = supabase.functions.invoke("resolve-identity-wizard", {
        body: { action: "CHECK" },
      });

      const abortPromise = new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

      const { data, error } = (await Promise.race([invokePromise, abortPromise])) as any;

      if (error) throw error;

      // Ignore stale responses
      if (currentRequestId !== requestIdRef.current) return;

      const unwrapped = unwrapInvoke<IdentityResult>(data);
      applyResult(unwrapped);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setIdentityState("error");
        setError({
          code: "IDENTITY_TIMEOUT",
          message: "Timeout identity.",
        });

        emitInstitutional({
          domain: "IDENTITY",
          type: "IDENTITY_TIMEOUT",
        });

        return;
      }

      logger.error("[IdentityContext] checkIdentity error:", err);

      setIdentityState("error");
      setError({
        code: "UNKNOWN",
        message: "Falha ao conectar ao serviço.",
      });

      emitInstitutional({
        domain: "IDENTITY",
        type: "IDENTITY_ERROR",
        metadata: { message: String(err?.message ?? "unknown") },
      });
    } finally {
      clear();
      inFlightAbortRef.current = null;
    }
  }, [session?.user?.id, isAuthenticated, reset, applyResult]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !session?.user?.id) {
      reset();
      return;
    }

    checkIdentity();
  }, [authLoading, isAuthenticated, session?.user?.id, checkIdentity, reset]);

  const refreshIdentity = async () => {
    await checkIdentity();
  };

  // ============================
  // Shared invoke for actions
  // ============================

  const invokeAction = async (action: string, payload?: unknown) => {
    const { data, error } = await supabase.functions.invoke("resolve-identity-wizard", {
      body: { action, payload },
    });

    if (error) {
      return {
        success: false,
        error: { code: "UNKNOWN", message: error.message },
      };
    }

    const unwrapped = unwrapInvoke<IdentityResult>(data);

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
        completeWizard: (payload) => invokeAction("COMPLETE_WIZARD", payload),
        createTenant: (payload) => invokeAction("CREATE_TENANT", payload),
        joinExistingTenant: (payload) => invokeAction("JOIN_EXISTING_TENANT", payload),
        setIdentityError: (e) => {
          setError(e);
          setIdentityState("error");
        },
        clearError: () => {
          setError(null);
          checkIdentity();
        },
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
