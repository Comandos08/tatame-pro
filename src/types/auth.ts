import { Session } from "@supabase/supabase-js";

export type AppRole = 
  | 'SUPERADMIN_GLOBAL'
  | 'ADMIN_TENANT'
  | 'ATLETA';

export interface UserRole {
  id: string;
  userId: string;
  role: AppRole;
  tenantId: string | null;
  createdAt: string;
}

export interface Profile {
  id: string;
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
