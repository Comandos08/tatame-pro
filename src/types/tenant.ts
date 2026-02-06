export type SportType = 'Jiu-Jitsu' | 'Judo' | 'Muay Thai' | 'Wrestling' | 'Boxing' | 'Karate' | 'Taekwondo' | 'MMA' | 'Sambo' | 'Krav Maga';

// ✅ P2.HOTFIX — Tenant status for lifecycle management
export type TenantStatus = 'SETUP' | 'ACTIVE' | 'SUSPENDED';

// ✅ P2.HOTFIX — Tenant creation source tracking
export type TenantCreationSource = 'admin' | 'wizard' | 'migration';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  sportTypes: SportType[];
  stripeCustomerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // ✅ P0.1 — Tenant onboarding contract
  onboardingCompleted?: boolean;

  // ✅ P2.HOTFIX — Tenant lifecycle fields
  status?: TenantStatus;
  creationSource?: TenantCreationSource;
}

export interface TenantContext {
  tenant: Tenant | null;
  isLoading: boolean;
  error: Error | null;
}
