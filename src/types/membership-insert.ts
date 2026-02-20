import type { GenderType, GuardianRelationship } from './membership';

/**
 * Structure for applicant_data in adult memberships
 */
export interface AdultApplicantData {
  full_name: string;
  birth_date: string;
  national_id: string;
  gender: GenderType;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

/**
 * Structure for applicant_data in youth memberships
 */
export interface YouthApplicantData extends Omit<AdultApplicantData, 'national_id'> {
  national_id: string | null;
  is_minor: true;
  guardian: {
    full_name: string;
    national_id: string;
    email: string;
    phone: string;
    relationship: GuardianRelationship;
  };
}

/**
 * Structure for uploaded document metadata
 */
export interface DocumentUploaded {
  type: 'ID_DOCUMENT' | 'MEDICAL_CERTIFICATE';
  storage_path: string;
  file_type: string;
}

/**
 * Insert payload for adult membership
 */
export interface AdultMembershipInsert {
  tenant_id: string;
  athlete_id: string | null;
  applicant_profile_id: string;
  applicant_data: AdultApplicantData;
  documents_uploaded: DocumentUploaded[];
  status: 'DRAFT';
  type: 'FIRST_MEMBERSHIP';
  price_cents: number;
  currency: string;
  payment_status: 'NOT_PAID';
}

/**
 * Insert payload for youth membership
 */
export interface YouthMembershipInsert {
  tenant_id: string;
  athlete_id: string | null;
  applicant_profile_id: string;
  applicant_data: YouthApplicantData;
  documents_uploaded: DocumentUploaded[];
  status: 'DRAFT';
  type: 'FIRST_MEMBERSHIP';
  price_cents: number;
  currency: string;
  payment_status: 'NOT_PAID';
}
