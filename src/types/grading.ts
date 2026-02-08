export type DiplomaStatus = 'DRAFT' | 'ISSUED' | 'REVOKED';

export interface GradingScheme {
  id: string;
  tenant_id: string;
  name: string;
  sport_type: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradingLevel {
  id: string;
  tenant_id: string;
  grading_scheme_id: string;
  code: string;
  display_name: string;
  order_index: number;
  min_time_months: number | null;
  min_age: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  grading_schemes?: GradingScheme;
}

export interface AthleteGrading {
  id: string;
  tenant_id: string;
  athlete_id: string;
  grading_level_id: string;
  academy_id: string | null;
  coach_id: string | null;
  promotion_date: string;
  notes: string | null;
  diploma_id: string | null;
  is_official: boolean;
  created_at: string;
  updated_at: string;
  grading_levels?: GradingLevel;
  academies?: { id: string; name: string };
  coaches?: { id: string; full_name: string };
  diplomas?: Diploma;
}

export interface Diploma {
  id: string;
  tenant_id: string;
  athlete_id: string;
  grading_level_id: string;
  academy_id: string | null;
  coach_id: string | null;
  promotion_date: string;
  serial_number: string;
  pdf_url: string | null;
  qr_code_data: string | null;
  qr_code_image_url: string | null;
  status: DiplomaStatus;
  revoked_reason: string | null;
  issued_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DIPLOMA_STATUS_LABELS: Record<DiplomaStatus, string> = {
  DRAFT: 'Rascunho',
  ISSUED: 'Emitido',
  REVOKED: 'Revogado',
};
