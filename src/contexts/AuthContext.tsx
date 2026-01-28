/**
 * 🔐 AUTH CONTEXT — Compatibility + Stability Layer
 * This file EXISTS to keep the app alive during refactor.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { CurrentUser, UserRole, AppRole } from "@/types/auth";

type AuthState = "authenticating" | "authenticated" | "unauthenticated" | "error";

export interface AuthContextType {
  currentUser: CurrentUser | null;
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>("authenticating");

  const mountedRef = useRef(true);

  const fetchProfile = async (user: User): Promise<CurrentUser | null> => {
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    if (error || !profile) return null;

    const { data: roles } = await supabase.from("user_roles").select("*").eq("user_id", user.id);

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
  };

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (!mountedRef.current) return;

      if (data.session?.user) {
        const user = await fetchProfile(data.session.user);
        setCurrentUser(user);
        setAuthState(user ? "authenticated" : "unauthenticated");
      } else {
        setCurrentUser(null);
        setAuthState("unauthenticated");
      }

      setIsLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (!mountedRef.current) return;

      if (session?.user) {
        setIsLoading(true);
        const user = await fetchProfile(session.user);
        setCurrentUser(user);
        setAuthState(user ? "authenticated" : "error");
        setIsLoading(false);
      } else {
        setCurrentUser(null);
        setAuthState("unauthenticated");
      }
    });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthState("unauthenticated");
    setIsLoading(false);
  };

  const isAuthenticated = authState === "authenticated" && !!currentUser;

  const isGlobalSuperadmin =
    currentUser?.roles?.some(
      (r) => r.role === "SUPERADMIN_GLOBAL" && (r.tenantId === null || r.tenantId === undefined),
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
 * DO NOT REMOVE until all imports are migrated
 */
export function useCurrentUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within AuthProvider");
  }
  return ctx;
}
