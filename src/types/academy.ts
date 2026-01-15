export type AcademyCoachRole = 'HEAD_COACH' | 'ASSISTANT_COACH' | 'INSTRUCTOR';

export interface Academy {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  sportType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Coach {
  id: string;
  tenantId: string;
  profileId: string | null;
  fullName: string;
  mainSport: string | null;
  rank: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcademyCoach {
  id: string;
  tenantId: string;
  academyId: string;
  coachId: string;
  role: AcademyCoachRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ACADEMY_COACH_ROLE_LABELS: Record<AcademyCoachRole, string> = {
  HEAD_COACH: 'Professor Principal',
  ASSISTANT_COACH: 'Professor Assistente',
  INSTRUCTOR: 'Instrutor',
};
