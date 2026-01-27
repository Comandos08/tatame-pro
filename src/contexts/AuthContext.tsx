/**
 * 🔐 AUTH CONTEXT — Enterprise Security Baseline
 * 
 * This is the SINGLE SOURCE OF TRUTH for authentication state.
 * 
 * SECURITY PRINCIPLES:
 * 1. Uses formal AuthState machine (no implicit states)
 * 2. All async operations have AbortController
 * 3. No setState after unmount
 * 4. Proper cleanup on session end
 * 5. Deterministic state transitions
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContextType, CurrentUser, UserRole, AppRole } from "@/types/auth";
import { User, AuthChangeEvent } from "@supabase/supabase-js";
import { 
  AuthState, 
  transitionAuthState, 
  mapSupabaseEventToAuthState,
  isSessionExpiredError 
} from "@/lib/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('authenticating');
  
  // 🔐 Mounted ref to prevent setState after unmount
  const isMountedRef = useRef(true);
  
  // 🔐 Abort controller for async operations
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Safe state setter that checks mount status
   */
  const safeSetCurrentUser = useCallback((user: CurrentUser | null) => {
    if (isMountedRef.current) {
      setCurrentUser(user);
    }
  }, []);

  const safeSetIsLoading = useCallback((loading: boolean) => {
    if (isMountedRef.current) {
      setIsLoading(loading);
    }
  }, []);

  const safeSetAuthState = useCallback((newState: AuthState) => {
    if (isMountedRef.current) {
      setAuthState((currentState) => {
        const result = transitionAuthState(currentState, newState, 'AuthContext');
        return result.success ? newState : currentState;
      });
    }
  }, []);

  /**
   * Fetches user profile with abort signal support
   */
  const fetchUserProfile = useCallback(async (user: User, signal?: AbortSignal): Promise<CurrentUser | null> => {
    try {
      // Check if aborted before making request
      if (signal?.aborted) return null;

      // Profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // Check abort after each async operation
      if (signal?.aborted) return null;

      if (profileError) {
        console.error("[AuthContext] Error fetching profile:", profileError);
        
        // Check if session expired during fetch
        if (isSessionExpiredError(profileError)) {
          safeSetAuthState('expired');
          return null;
        }
        return null;
      }

      // Roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id);

      if (signal?.aborted) return null;

      if (rolesError) {
        console.error("[AuthContext] Error fetching roles:", rolesError);
      }

      const userRoles: UserRole[] = (roles || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role as AppRole,
        tenantId: r.tenant_id,
        createdAt: r.created_at,
      }));

      const built: CurrentUser = {
        id: profile.id,
        tenantId: profile.tenant_id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        roles: userRoles,
      };

      return built;
    } catch (error) {
      if (signal?.aborted) return null;
      
      console.error("[AuthContext] Error in fetchUserProfile:", error);
      
      if (isSessionExpiredError(error)) {
        safeSetAuthState('expired');
      }
      
      return null;
    }
  }, [safeSetAuthState]);

  /**
   * Handles auth state changes from Supabase
   */
  const handleAuthStateChange = useCallback(async (
    event: AuthChangeEvent, 
    session: { user: User } | null,
    signal?: AbortSignal
  ) => {
    if (signal?.aborted) return;

    const newAuthState = mapSupabaseEventToAuthState(
      event,
      !!session,
      !!session?.user
    );

    try {
      if (event === "SIGNED_OUT") {
        safeSetCurrentUser(null);
        safeSetAuthState('unauthenticated');
        safeSetIsLoading(false);
        return;
      }

      // For auth events that require user data
      if (session?.user) {
        safeSetAuthState('authenticating');
        safeSetIsLoading(true);
        
        const userProfile = await fetchUserProfile(session.user, signal);
        
        if (signal?.aborted) return;
        
        if (userProfile) {
          safeSetCurrentUser(userProfile);
          safeSetAuthState('authenticated');
        } else {
          safeSetCurrentUser(null);
          safeSetAuthState('error');
        }
        
        safeSetIsLoading(false);
        return;
      }

      // No session
      safeSetCurrentUser(null);
      safeSetAuthState(newAuthState);
      safeSetIsLoading(false);
    } catch (e) {
      if (signal?.aborted) return;
      
      console.error("[AuthContext] handleAuthStateChange error:", e);
      safeSetAuthState('error');
      safeSetIsLoading(false);
    }
  }, [fetchUserProfile, safeSetCurrentUser, safeSetAuthState, safeSetIsLoading]);

  /**
   * Main effect: Subscribe to auth changes
   */
  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      await handleAuthStateChange(event, session, signal);
    });

    // Initial session check
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        
        if (signal.aborted) return;
        
        if (session?.user) {
          safeSetAuthState('authenticating');
          const userProfile = await fetchUserProfile(session.user, signal);
          
          if (signal.aborted) return;
          
          if (userProfile) {
            safeSetCurrentUser(userProfile);
            safeSetAuthState('authenticated');
          } else {
            safeSetAuthState('unauthenticated');
          }
        } else {
          safeSetAuthState('unauthenticated');
        }
      } catch (e) {
        if (signal.aborted) return;
        console.error("[AuthContext] getSession error:", e);
        safeSetAuthState('error');
      } finally {
        if (!signal.aborted) {
          safeSetIsLoading(false);
        }
      }
    })();

    // Cleanup
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      subscription.unsubscribe();
    };
  }, [handleAuthStateChange, fetchUserProfile, safeSetCurrentUser, safeSetAuthState, safeSetIsLoading]);

  // Derived state
  const isAuthenticated = authState === 'authenticated' && !!currentUser;

  // 🔐 FIX H1: Check for null OR undefined tenantId (DB may return either)
  const isGlobalSuperadmin =
    currentUser?.roles?.some((r) => r.role === "SUPERADMIN_GLOBAL" && (r.tenantId === null || r.tenantId === undefined)) ?? false;

  const currentRolesByTenant = new Map<string, AppRole[]>();
  currentUser?.roles?.forEach((role) => {
    const key = role.tenantId || "global";
    const existing = currentRolesByTenant.get(key) || [];
    currentRolesByTenant.set(key, [...existing, role.role]);
  });

  const hasRole = useCallback(
    (role: AppRole, tenantId?: string): boolean => {
      if (!currentUser) return false;
      return currentUser.roles.some((r) => r.role === role && (tenantId ? r.tenantId === tenantId : true));
    },
    [currentUser],
  );

  const signIn = async (email: string, password: string) => {
    safeSetAuthState('authenticating');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      safeSetAuthState('error');
      throw error;
    }
    // Auth state will be updated by onAuthStateChange
  };

  const signUp = async (email: string, password: string, name?: string) => {
    safeSetAuthState('authenticating');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    if (error) {
      safeSetAuthState('error');
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear state immediately for better UX
    safeSetCurrentUser(null);
    safeSetAuthState('unauthenticated');
  };

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

export function useCurrentUser() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useCurrentUser must be used within an AuthProvider");
  }
  return context;
}
