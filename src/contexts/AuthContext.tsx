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

type AuthState = "initializing" | "authenticated" | "unauthenticated";

export interface AuthContextType {
  currentUser: CurrentUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSessionReady: boolean;
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

  useEffect(() => {
    mountedRef.current = true;

    // Set up auth listener FIRST (as recommended by Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mountedRef.current) return;

        // Update session immediately
        setSession(newSession);
        
        if (newSession) {
          setAuthState("authenticated");
          
          // Load profile in parallel (non-blocking)
          // Use setTimeout to avoid potential deadlock with Supabase client
          setTimeout(async () => {
            if (!mountedRef.current) return;
            const profile = await fetchProfile(newSession.user);
            if (mountedRef.current) {
              setCurrentUser(profile);
            }
          }, 0);
        } else {
          setAuthState("unauthenticated");
          setCurrentUser(null);
        }
        
        // Bootstrap complete
        setIsLoading(false);
      }
    );

    // Then check initial session
    const initSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        
        if (!mountedRef.current) return;

        if (data.session) {
          setSession(data.session);
          setAuthState("authenticated");
          
          // Load profile in parallel
          const profile = await fetchProfile(data.session.user);
          if (mountedRef.current) {
            setCurrentUser(profile);
          }
        } else {
          setSession(null);
          setAuthState("unauthenticated");
        }
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

  const signIn = async (email: string, password: string) => {
    // Don't set isLoading here - onAuthStateChange handles state transitions
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
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

  // ✅ isSessionReady: indica que a sessão está sincronizada e pronta para uso
  const isSessionReady = authState === "authenticated" && !!session;

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
        isSessionReady,
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
