export type SportType = 'Jiu-Jitsu' | 'Judo' | 'Muay Thai' | 'Wrestling' | 'Boxing' | 'Karate' | 'Taekwondo' | 'MMA' | 'Sambo' | 'Krav Maga';

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
}

export interface TenantContext {
  tenant: Tenant | null;
  isLoading: boolean;
  error: Error | null;
}
