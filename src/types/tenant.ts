export type SportType = 'BJJ' | 'Judo' | 'MuayThai' | 'Wrestling' | 'Boxing' | 'Karate' | 'Taekwondo' | 'MMA';

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
}

export interface TenantContext {
  tenant: Tenant | null;
  isLoading: boolean;
  error: Error | null;
}
