// src/contexts/IdentityContext.tsx

/**
 * 🔐 IDENTITY CONTEXT — Consume-Only State Machine (HARDENED)
 *
 * FIX P0:
 * - Adds HARD TIMEOUT to prevent infinite loading if Edge Function hangs
 * - Never leaves identityState stuck in "loading"
 * - Resets cleanly on logout
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

// ✅ HARD timeout (ms) – evita loader infinito
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

export function IdentityProvider({ children }: IdentityProviderProps) {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  const [identityState, setIdentityState] = useState<IdentityState>("loading");
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [role, setRole] = useState<"ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL" | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const inFlightAbortRef = useRef<null | (() => void)>(null);

  const reset = useCallback(() => {
    if (!isMountedRef.current) return;
    setIdentityState("resolved"); // ✅ não bloqueia rotas públicas
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

    // ERROR / unknown
    setIdentityState("error");
    setError(
      result?.error || {
        code: "UNKNOWN",
        message: "Falha ao verificar identidade (resposta inesperada).",
      },
    );
  }, []);

  const checkIdentity = useCallback(async () => {
    // Abort anterior
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current();
      inFlightAbortRef.current = null;
    }

    // Se não autenticado (ou sem user id), não tem porque travar identidade
    if (!currentUser?.id || !isAuthenticated) {
      reset();
      return;
    }

    // Aqui SIM: usuário autenticado → identidade precisa resolver
    if (!isMountedRef.current) return;
    setIdentityState("loading");
    setError(null);

    const { signal, abort, clear } = hardAbortableFetch(IDENTITY_TIMEOUT_MS);
    inFlightAbortRef.current = abort;

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        throw sessionErr;
      }

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        // sem token => não dá pra chamar a function
        setIdentityState("error");
        setError({ code: "PERMISSION_DENIED", message: "Sessão inválida (sem token)." });
        return;
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "CHECK" }),
        signal,
      });

      // Se abortou por timeout
      if (signal.aborted) {
        setIdentityState("error");
        setError({
          code: "UNKNOWN",
          message: "Identity service timeout (Edge Function não respondeu).",
        });
        return;
      }

      // Response inválida
      if (!resp.ok) {
        let body: any = null;
        try {
          body = await resp.json();
        } catch {
          // ignore
        }
        setIdentityState("error");
        setError({
          code: "UNKNOWN",
          message: body?.error?.message || `Falha ao verificar identidade (HTTP ${resp.status}).`,
        });
        return;
      }

      const result = await resp.json();
      applyResult(result);
    } catch (err: any) {
      if (!isMountedRef.current) return;

      // Timeout/abort
      if (err?.name === "AbortError") {
        setIdentityState("error");
        setError({
          code: "UNKNOWN",
          message: "Identity service timeout (request abortada).",
        });
        return;
      }

      console.error("[IdentityContext] checkIdentity error:", err);
      setIdentityState("error");
      setError({
        code: "UNKNOWN",
        message: "Falha ao conectar ao serviço de identidade.",
      });
    } finally {
      clear();
      inFlightAbortRef.current = null;
    }
  }, [applyResult, currentUser?.id, isAuthenticated, reset]);

  useEffect(() => {
    isMountedRef.current = true;

    // Enquanto auth carrega, não trava tudo (deixa o app respirar)
    if (authLoading) return;

    // Logout / usuário não autenticado
    if (!isAuthenticated || !currentUser?.id) {
      reset();
      return;
    }

    // Usuário autenticado -> checar identidade
    checkIdentity();

    return () => {
      isMountedRef.current = false;
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current();
        inFlightAbortRef.current = null;
      }
    };
  }, [authLoading, isAuthenticated, currentUser?.id, checkIdentity, reset]);

  const refreshIdentity = async () => {
    await checkIdentity();
  };

  const completeWizard = async (payload: CompleteWizardPayload): Promise<CompleteWizardResult> => {
    if (!currentUser?.id) {
      return { success: false, error: { code: "PERMISSION_DENIED", message: "Not authenticated" } };
    }

    // Abort anterior
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current();
      inFlightAbortRef.current = null;
    }

    const { signal, abort, clear } = hardAbortableFetch(IDENTITY_TIMEOUT_MS);
    inFlightAbortRef.current = abort;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: { code: "PERMISSION_DENIED", message: "No session" } };
      }

      setIdentityState("loading");
      setError(null);

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "COMPLETE_WIZARD", payload }),
        signal,
      });

      if (signal.aborted) {
        setIdentityState("error");
        setError({ code: "UNKNOWN", message: "Timeout ao completar wizard." });
        return { success: false, error: { code: "UNKNOWN", message: "Timeout ao completar wizard." } };
      }

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

      if (result?.status === "ERROR") {
        setIdentityState("error");
        setError(result.error || { code: "UNKNOWN", message: "Falha ao completar wizard" });
        return { success: false, error: result.error || { code: "UNKNOWN", message: "Falha ao completar wizard" } };
      }

      setIdentityState("error");
      setError({ code: "UNKNOWN", message: "Resposta inesperada ao completar wizard." });
      return { success: false, error: { code: "UNKNOWN", message: "Resposta inesperada ao completar wizard." } };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setIdentityState("error");
        setError({ code: "UNKNOWN", message: "Timeout ao completar wizard (abort)." });
        return { success: false, error: { code: "UNKNOWN", message: "Timeout ao completar wizard." } };
      }

      console.error("[IdentityContext] completeWizard error:", err);
      setIdentityState("error");
      setError({ code: "UNKNOWN", message: "Falha ao completar wizard." });
      return { success: false, error: { code: "UNKNOWN", message: "Falha ao completar wizard." } };
    } finally {
      clear();
      inFlightAbortRef.current = null;
    }
  };

  const setIdentityError = (newError: IdentityError) => {
    setError(newError);
    setIdentityState("error");
  };

  const clearError = () => {
    setError(null);
    // tenta resolver de novo
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
