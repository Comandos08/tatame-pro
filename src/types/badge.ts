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

/**
 * D2 — Superfícies autorizadas de exibição de badge.
 * Badge só pode ser renderizado nestas superfícies.
 * Qualquer outro ponto é implicitamente proibido.
 *
 * @see docs/BADGE-CONTRACT.md §5
 */
export type BadgeSurface =
  | 'ATHLETE_PROFILE'
  | 'ATHLETE_CARD'
  | 'BADGE_TIMELINE'
  | 'BADGE_MODAL'
  | 'BADGE_CHIP';

export const ALLOWED_BADGE_SURFACES: readonly BadgeSurface[] = [
  'ATHLETE_PROFILE',
  'ATHLETE_CARD',
  'BADGE_TIMELINE',
  'BADGE_MODAL',
  'BADGE_CHIP',
] as const;
