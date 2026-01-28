import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppRole, CurrentUser, UserRole } from "@/types/auth";

type AuthState = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextType {
  session: Session | null;
  user: CurrentUser | null;
  authState: AuthState;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>("idle");

  const abortRef = useRef<AbortController | null>(null);

  /**
   * Fetch profile + roles.
   * Se o profile NÃO existir, ele é criado automaticamente.
   */
  const fetchUserProfile = useCallback(async (authUser: User, signal?: AbortSignal): Promise<CurrentUser | null> => {
    try {
      if (signal?.aborted) return null;

      // 1) Tentativa inicial de buscar profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (signal?.aborted) return null;

      // 2) Detecta profile inexistente
      const isMissingProfile =
        !!profileError &&
        (profileError.code === "PGRST116" ||
          String(profileError.message || "")
            .toLowerCase()
            .includes("0 rows"));

      // 3) Auto-criação do profile (fix definitivo do loop)
      if (isMissingProfile) {
        const { error: insertError } = await supabase.from("profiles").insert({
          id: authUser.id,
          email: authUser.email ?? "",
          name: authUser.user_metadata?.name ?? authUser.user_metadata?.full_name ?? null,
          avatar_url: authUser.user_metadata?.avatar_url ?? null,
          tenant_id: null,
        });

        if (signal?.aborted) return null;

        if (insertError) {
          console.error("[AuthContext] Failed to auto-create profile:", insertError);
          return null;
        }

        // Re-fetch após criação
        const { data: profile2, error: profileError2 } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (signal?.aborted) return null;

        if (profileError2 || !profile2) {
          console.error("[AuthContext] Failed to fetch profile after auto-create:", profileError2);
          return null;
        }

        const { data: roles } = await supabase.from("user_roles").select("*").eq("user_id", authUser.id);

        const userRoles: UserRole[] = (roles || []).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          role: r.role as AppRole,
          tenantId: r.tenant_id,
          createdAt: r.created_at,
        }));

        return {
          id: profile2.id,
          tenantId: profile2.tenant_id,
          email: profile2.email,
          name: profile2.name,
          avatarUrl: profile2.avatar_url,
          createdAt: profile2.created_at,
          updatedAt: profile2.updated_at,
          roles: userRoles,
        };
      }

      // 4) Erro real de profile (não é "missing")
      if (profileError || !profile) {
        console.error("[AuthContext] Error fetching profile:", profileError);
        return null;
      }

      // 5) Busca roles normalmente
      const { data: roles } = await supabase.from("user_roles").select("*").eq("user_id", authUser.id);

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
    } catch (err) {
      if (!signal?.aborted) {
        console.error("[AuthContext] Unexpected error:", err);
      }
      return null;
    }
  }, []);

  /**
   * Resolve sessão e usuário
   */
  const resolveSession = useCallback(
    async (session: Session | null) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      if (!session?.user) {
        setSession(null);
        setUser(null);
        setAuthState("unauthenticated");
        return;
      }

      setAuthState("loading");

      const currentUser = await fetchUserProfile(session.user, abortRef.current.signal);

      if (abortRef.current.signal.aborted) return;

      if (!currentUser) {
        setSession(null);
        setUser(null);
        setAuthState("error");
        return;
      }

      setSession(session);
      setUser(currentUser);
      setAuthState("authenticated");
    },
    [fetchUserProfile],
  );

  /**
   * Inicialização + listener de auth
   */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      resolveSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      abortRef.current?.abort();
    };
  }, [resolveSession]);

  /**
   * Actions
   */
  const signIn = useCallback(async (email: string, password: string) => {
    setAuthState("loading");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthState("error");
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthState("loading");
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setAuthState("unauthenticated");
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      authState,
      isAuthenticated: authState === "authenticated",
      signIn,
      signOut,
    }),
    [session, user, authState, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
