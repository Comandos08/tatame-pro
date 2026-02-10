/**
 * 🔐 AUTH CONTEXT — Session-First Architecture
 * 
 * Key principle: isAuthenticated is based on SESSION, not profile.
 * Profile loading happens in parallel and doesn't block navigation.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { CurrentUser, UserRole, AppRole } from "@/types/auth";
import { emitInstitutionalEvent } from "@/lib/institutional";

type AuthState = "initializing" | "authenticated" | "unauthenticated";

export interface AuthContextType {
  currentUser: CurrentUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGlobalSuperadmin: boolean;
  currentRolesByTenant: Map<string, AppRole[]>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole, tenantId?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Session state (source of truth for authentication)
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>("initializing");
  
  // Profile state (loaded in parallel, doesn't block auth)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  
  // Loading only for initial bootstrap
  const [isLoading, setIsLoading] = useState(true);

  const mountedRef = useRef(true);

  const fetchProfile = async (user: User): Promise<CurrentUser | null> => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !profile) return null;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id);

      const userRoles: UserRole[] = (roles || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role as AppRole,
        tenantId: r.tenant_id,
        createdAt: r.created_at,
      }));

      return {
        id: profile.id,
        tenantId: profile.tenant_id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        roles: userRoles,
      };
    } catch {
      return null;
    }
  };

  // ── Auth listener + init (SYNCHRONOUS — PI FIX) ──
  useEffect(() => {
    mountedRef.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mountedRef.current) return;

        setSession(newSession);

        if (newSession) {
          setAuthState("authenticated");
        } else {
          setAuthState("unauthenticated");
          setCurrentUser(null);
        }

        setIsLoading(false);
      }
    );

    const initSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mountedRef.current) return;

        setSession(data.session);
        setAuthState(data.session ? "authenticated" : "unauthenticated");
      } catch {
        if (mountedRef.current) {
          setSession(null);
          setAuthState("unauthenticated");
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initSession();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Profile fetch (deterministic, StrictMode-safe — PI FIX) ──
  useEffect(() => {
    if (!session?.user) return;

    let cancelled = false;

    fetchProfile(session.user).then((profile) => {
      if (!cancelled && mountedRef.current) {
        setCurrentUser(profile);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const signIn = async (email: string, password: string) => {
    // Don't set isLoading here - onAuthStateChange handles state transitions
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      emitInstitutionalEvent({
        domain: 'AUTH',
        type: 'LOGIN_FAILED',
        metadata: { email, errorCode: error.message },
      });
      throw error;
    }
    // LOGIN_SUCCESS emitted after identity resolves (IdentityContext)
    emitInstitutionalEvent({
      domain: 'AUTH',
      type: 'LOGIN_SUCCESS',
      metadata: { email },
    });
    // Session update happens via onAuthStateChange
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    // Session update happens via onAuthStateChange
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // State cleanup happens via onAuthStateChange
  };

  // ✅ isAuthenticated is based on SESSION, not profile
  const isAuthenticated = authState === "authenticated" && !!session;


  // Derived from currentUser (may be null initially after login)
  const isGlobalSuperadmin =
    currentUser?.roles?.some(
      (r) => r.role === "SUPERADMIN_GLOBAL" && (r.tenantId === null || r.tenantId === undefined)
    ) ?? false;

  const currentRolesByTenant = new Map<string, AppRole[]>();
  currentUser?.roles?.forEach((r) => {
    const key = r.tenantId ?? "global";
    const existing = currentRolesByTenant.get(key) || [];
    currentRolesByTenant.set(key, [...existing, r.role]);
  });

  const hasRole = (role: AppRole, tenantId?: string) =>
    currentUser?.roles?.some((r) => r.role === role && (!tenantId || r.tenantId === tenantId)) ?? false;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        isLoading,
        isAuthenticated,
        isGlobalSuperadmin,
        currentRolesByTenant,
        signIn,
        signUp,
        signOut,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 🔁 LEGACY / COMPATIBILITY HOOK
 */
export function useCurrentUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within AuthProvider");
  }
  return ctx;
}
