import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthContextType, CurrentUser, UserRole, AppRole } from '@/types/auth';
import { User } from '@supabase/supabase-js';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async (user: User) => {
    try {
      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return null;
      }

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      }

      const userRoles: UserRole[] = (roles || []).map((r) => ({
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
      } as CurrentUser;
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // Use setTimeout to avoid blocking the auth flow
          setTimeout(async () => {
            const userProfile = await fetchUserProfile(session.user);
            setCurrentUser(userProfile);
            setIsLoading(false);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          setIsLoading(false);
        }
      }
    );

    // Check initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const userProfile = await fetchUserProfile(session.user);
        setCurrentUser(userProfile);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const isAuthenticated = !!currentUser;

  const isGlobalSuperadmin = currentUser?.roles.some(
    (r) => r.role === 'SUPERADMIN_GLOBAL' && r.tenantId === null
  ) ?? false;

  const currentRolesByTenant = new Map<string, AppRole[]>();
  currentUser?.roles.forEach((role) => {
    const key = role.tenantId || 'global';
    const existing = currentRolesByTenant.get(key) || [];
    currentRolesByTenant.set(key, [...existing, role.role]);
  });

  const hasRole = useCallback((role: AppRole, tenantId?: string): boolean => {
    if (!currentUser) return false;
    return currentUser.roles.some(
      (r) => r.role === role && (tenantId ? r.tenantId === tenantId : true)
    );
  }, [currentUser]);

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
    throw new Error('useCurrentUser must be used within an AuthProvider');
  }
  return context;
}
