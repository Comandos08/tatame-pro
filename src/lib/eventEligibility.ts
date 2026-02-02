/**
 * Event Eligibility Helpers - TATAME Platform
 * P2.3 — Categorias de Competição
 * 
 * Deterministic athlete eligibility validation for event categories.
 * AJUSTE C: Weight validation is conditional - only applied when athlete.weight is available.
 */

import { CategoryGender } from '@/types/event';

export interface AthleteForEligibility {
  tenant_id: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  birth_date: string;
  current_grading?: {
    grading_level_id: string;
    order_index: number;
  } | null;
  weight?: number | null; // Optional - AJUSTE C
}

export interface CategoryForEligibility {
  tenant_id: string;
  gender: CategoryGender | null;
  min_weight: number | null;
  max_weight: number | null;
  min_age: number | null;
  max_age: number | null;
  belt_min_order_index?: number | null;
  belt_max_order_index?: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Deterministic eligibility check
 * AJUSTE C: Weight is only validated if athlete.weight is defined and not null
 */
export function isAthleteEligibleForCategory(
  athlete: AthleteForEligibility,
  category: CategoryForEligibility,
  eventTenantId: string
): EligibilityResult {
  const reasons: string[] = [];
  
  // 1. Tenant match
  if (athlete.tenant_id !== eventTenantId) {
    reasons.push('Atleta não pertence à organização do evento');
  }
  
  // 2. Gender check
  if (category.gender !== null && category.gender !== 'MIXED') {
    if (athlete.gender === 'OTHER' || athlete.gender !== category.gender) {
      reasons.push('Gênero incompatível com a categoria');
    }
  }
  
  // 3. Age check
  if (category.min_age !== null || category.max_age !== null) {
    const age = calculateAge(athlete.birth_date);
    if (category.min_age !== null && age < category.min_age) {
      reasons.push(`Idade mínima: ${category.min_age} anos`);
    }
    if (category.max_age !== null && age > category.max_age) {
      reasons.push(`Idade máxima: ${category.max_age} anos`);
    }
  }
  
  // 4. Belt check
  if (athlete.current_grading && 
      (category.belt_min_order_index !== null || category.belt_max_order_index !== null)) {
    const athleteBeltOrder = athlete.current_grading.order_index;
    if (category.belt_min_order_index !== null && athleteBeltOrder < category.belt_min_order_index) {
      reasons.push('Faixa abaixo do mínimo');
    }
    if (category.belt_max_order_index !== null && athleteBeltOrder > category.belt_max_order_index) {
      reasons.push('Faixa acima do máximo');
    }
  }
  
  // 5. Weight check - AJUSTE C: ONLY if athlete.weight is available
  if (athlete.weight !== undefined && athlete.weight !== null) {
    if (category.min_weight !== null && athlete.weight < category.min_weight) {
      reasons.push(`Peso mínimo: ${category.min_weight}kg`);
    }
    if (category.max_weight !== null && athlete.weight > category.max_weight) {
      reasons.push(`Peso máximo: ${category.max_weight}kg`);
    }
  }
  // Se weight for undefined/null, validação de peso é IGNORADA (não falha)
  
  return { eligible: reasons.length === 0, reasons };
}
