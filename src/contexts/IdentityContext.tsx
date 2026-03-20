// src/contexts/IdentityContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/contexts/AuthContext";
import { emitInstitutionalEvent } from "@/lib/institutional";
import { type IdentityState } from "@/lib/identity/identity-state-machine";

// ============================================================================
// P2-FIX: Zod schema for resolve-identity-wizard RPC response.
// Validates the envelope before applyResult() processes it, catching any
// backend contract drift at the boundary instead of via runtime type errors.
// ============================================================================
const IdentityRpcSchema = z.object({
  status: z.enum(["RESOLVED", "WIZARD_REQUIRED", "ERROR"]),
  role: z.enum(["SUPERADMIN_GLOBAL", "ADMIN_TENANT", "ATLETA"]).optional(),
  tenant: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
  }).optional(),
  redirectPath: z.string().nullable().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export type { IdentityState };

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

/**
 * P1-04 — Explicit action result contract (removes Promise<any>)
 */
export interface IdentityActionResult {
  success: boolean;
  tenant?: TenantInfo;
  role?: "ADMIN_TENANT" | "ATLETA" | "SUPERADMIN_GLOBAL";
  redirectPath?: string;
  error?: IdentityError;
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

  completeWizard: (payload: unknown) => Promise<IdentityActionResult>;
  createTenant: (payload: unknown) => Promise<IdentityActionResult>;
  joinExistingTenant: (payload: unknown) => Promise<IdentityActionResult>;

  setIdentityError: (error: IdentityError) => void;
  clearError: () => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

const IDENTITY_TIMEOUT_MS = 12_000;

/**
 * P1-04 — Remove any from unwrapInvoke
 */
function unwrapInvoke<T>(data: Record<string, unknown> | null | undefined): T {
  if (data && typeof data === "object" && "ok" in data && data["ok"]) {
    return data["data"] as T;
  }
  return data as T;
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

function emitInstitutional(payload: {
  domain: string;
  type: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    emitInstitutionalEvent(payload);
  } catch {
    // never break identity flow due to telemetry
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { session, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  const [identityState, setIdentityState] = useState<IdentityState>("LOADING");
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [role, setRole] = useState<"ADMIN_TENANT" | "ATLETA" | "SUPERADMIN_GLOBAL" | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const inFlightAbortRef = useRef<null | (() => void)>(null);
  const requestIdRef = useRef(0);
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 3_000;

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
    setIdentityState("LOADING");
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

      setIdentityState(result.role === "SUPERADMIN_GLOBAL" ? "SUPERADMIN" : "RESOLVED");

      setError(null);

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
      setIdentityState("WIZARD_REQUIRED");
      setError(null);
      return;
    }

    setIdentityState("ERROR");
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

    setIdentityState("LOADING");
    setError(null);

    const { signal, abort, clear } = hardAbortableFetch(IDENTITY_TIMEOUT_MS);
    inFlightAbortRef.current = abort;

    try {
      type InvokeResult = Awaited<ReturnType<typeof supabase.functions.invoke>>;

      const invokePromise = supabase.functions.invoke("resolve-identity-wizard", { body: { action: "CHECK" } });

      const abortPromise = new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });

      const { data, error } = await Promise.race<InvokeResult>([invokePromise, abortPromise]);

      if (error) throw error;

      if (currentRequestId !== requestIdRef.current) return;

      const unwrapped = unwrapInvoke<IdentityResult>(data);

      // P2-FIX: Validate RPC response shape before processing
      const parseResult = IdentityRpcSchema.safeParse(unwrapped);
      if (!parseResult.success) {
        logger.error("[IdentityContext] RPC schema validation failed:", parseResult.error.issues);
        setIdentityState("ERROR");
        setError({ code: "UNKNOWN", message: "Resposta inesperada do servidor de identidade." });
        return;
      }

      applyResult(parseResult.data);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        setIdentityState("ERROR");
        setError({
          code: "IDENTITY_TIMEOUT",
          message: "Timeout identity.",
        });
        return;
      }

      logger.error("[IdentityContext] checkIdentity error:", err);

      setIdentityState("ERROR");
      setError({
        code: "UNKNOWN",
        message: "Falha ao conectar ao serviço.",
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
    const now = Date.now();

    if (now - lastRefreshRef.current < REFRESH_DEBOUNCE_MS) {
      return; // Debounce: ignore rapid retries
    }

    lastRefreshRef.current = now;
    await checkIdentity();
  };

  /**
   * P1-04 — Explicit return type
   */
  const invokeAction = async (action: string, payload?: unknown): Promise<IdentityActionResult> => {
    const { data, error } = await supabase.functions.invoke("resolve-identity-wizard", {
      body: { action, payload },
    });

    if (error) {
      return {
        success: false,
        error: {
          code: "UNKNOWN",
          message: error.message,
        },
      };
    }

    const unwrapped = unwrapInvoke<IdentityResult>(data);

    // P2-FIX: Validate action response shape before processing
    const parseResult = IdentityRpcSchema.safeParse(unwrapped);
    if (!parseResult.success) {
      logger.error("[IdentityContext] Action RPC schema validation failed:", parseResult.error.issues);
      return { success: false, error: { code: "UNKNOWN" as const, message: "Resposta inesperada do servidor." } };
    }

    const validated = parseResult.data;

    if (validated?.status === "RESOLVED") {
      applyResult(validated);
      return {
        success: true,
        tenant: validated.tenant,
        role: validated.role,
        redirectPath: validated.redirectPath ?? undefined,
      };
    }

    return {
      success: false,
      error: validated?.error as IdentityError | undefined,
    };
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
          setIdentityState("ERROR");
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
