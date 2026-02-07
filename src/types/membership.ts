export type GenderType = 'MALE' | 'FEMALE' | 'OTHER';
export type GuardianRelationship = 'PARENT' | 'GUARDIAN' | 'OTHER';
export type MembershipStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PENDING_REVIEW' | 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
export type MembershipType = 'FIRST_MEMBERSHIP' | 'RENEWAL';
export type PaymentStatus = 'NOT_PAID' | 'PAID' | 'FAILED';
export type DocumentType = 'ID_DOCUMENT' | 'MEDICAL_CERTIFICATE' | 'ADDRESS_PROOF' | 'OTHER';

export interface AthleteFormData {
  fullName: string;
  birthDate: string;
  nationalId: string;
  gender: GenderType;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface GuardianFormData {
  fullName: string;
  nationalId: string;
  email: string;
  phone: string;
  relationship: GuardianRelationship;
}

export interface MembershipFormState {
  step: number;
  athleteData: AthleteFormData | null;
  guardianData: GuardianFormData | null;
  documents: {
    idDocument?: File;
    medicalCertificate?: File;
  };
  membershipId?: string;
}

export const MEMBERSHIP_PRICE_CENTS = 15000;
export const MEMBERSHIP_CURRENCY = 'BRL';

export const GENDER_LABELS: Record<GenderType, string> = {
  MALE: 'Masculino',
  FEMALE: 'Feminino',
  OTHER: 'Outro',
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_PAYMENT: 'Aguardando Pagamento',
  PENDING_REVIEW: 'Aguardando Aprovação',
  APPROVED: 'Aprovada',
  ACTIVE: 'Ativa',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  NOT_PAID: 'Não Pago',
  PAID: 'Pago',
  FAILED: 'Falhou',
};

export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  PARENT: 'Pai/Mãe',
  GUARDIAN: 'Responsável Legal',
  OTHER: 'Outro',
};

// Re-export insert types for convenience
export type {
  AdultApplicantData,
  YouthApplicantData,
  DocumentUploaded,
  AdultMembershipInsert,
  YouthMembershipInsert,
} from './membership-insert';
