import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContextType, CurrentUser, UserRole, AppRole } from "@/types/auth";
import { User } from "@supabase/supabase-js";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async (user: User) => {
    try {
      // Profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("[AuthContext] Error fetching profile:", profileError);
        return null;
      }

      // Roles
      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("*").eq("user_id", user.id);

      if (rolesError) {
        console.error("[AuthContext] Error fetching roles:", rolesError);
      }

      const userRoles: UserRole[] = (roles || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role as AppRole,
        tenantId: r.tenant_id, // pode ser null (global)
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
      console.error("[AuthContext] Error in fetchUserProfile:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_OUT") {
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }

        // Para SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED: sempre re-hidratar o profile/roles
        if (session?.user) {
          setIsLoading(true);
          const userProfile = await fetchUserProfile(session.user);
          setCurrentUser(userProfile);
          setIsLoading(false);
          return;
        }

        setIsLoading(false);
      } catch (e) {
        console.error("[AuthContext] onAuthStateChange error:", e);
        setIsLoading(false);
      }
    });

    // Initial session
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setIsLoading(true);
          const userProfile = await fetchUserProfile(session.user);
          setCurrentUser(userProfile);
        }
      } catch (e) {
        console.error("[AuthContext] getSession error:", e);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const isAuthenticated = !!currentUser;

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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
