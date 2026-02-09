/**
 * Badge Types — Reconhecimento Simbólico
 *
 * CONTRATO: Badges são atributos simbólicos de reconhecimento.
 * NUNCA usados para autorização, RLS, guards ou permissões.
 * Separação formal: app_role = identidade, badge = reconhecimento.
 *
 * @see docs/BADGE-CONTRACT.md
 */

export interface Badge {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  scope: 'TENANT';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AthleteBadge {
  id: string;
  tenantId: string;
  athleteId: string;
  badgeId: string;
  grantedBy: string | null;
  grantedAt: string;
  revokedAt: string | null;
}

/** Badge code é string aberta — sem enum fechado para evitar cristalização prematura. */
export type BadgeCode = string;
