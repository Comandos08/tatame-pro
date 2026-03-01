import { Session } from "@supabase/supabase-js";

export type AppRole =
  | "SUPERADMIN_GLOBAL"
  | "ADMIN_TENANT"
  | "ATLETA"
  | "COACH_ASSISTENTE"
  | "COACH_PRINCIPAL"
  | "INSTRUTOR"
  | "STAFF_ORGANIZACAO"
  | "RECEPCAO";

export interface UserRole {
  id: string;
  userId: string;
  role: AppRole;
  tenantId: string | null;
  createdAt: string;
}

export interface Profile {
  id: string;

  /**
   * @deprecated LEGACY FIELD — NÃO usar para decisões de acesso ou routing.
   * A fonte de verdade para tenant do usuário é a tabela user_roles.
   *
   * Este campo é mantido por compatibilidade histórica.
   * Pode ser null para atletas.
   * Admins criados via wizard TÊM este campo setado.
   * Atletas via JOIN_EXISTING_TENANT NÃO necessariamente.
   *
   * Referência: resolve-identity-wizard → handleIdentityCheck resolve via user_roles.
   */
  tenantId: string | null;

  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUser extends Profile {
  roles: UserRole[];
}

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
