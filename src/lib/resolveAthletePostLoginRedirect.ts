/**
 * SAFE GOLD — ETAPA 1
 * Função única de redirect pós-login de atleta
 * Esta é a ÚNICA fonte de verdade para determinar destino após login
 */

export type MembershipStatus =
  | 'ACTIVE'
  | 'APPROVED'
  | 'PENDING_REVIEW'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED'
  | null;

interface ResolveRedirectParams {
  tenantSlug: string;
  membershipStatus: MembershipStatus;
}

export function resolveAthletePostLoginRedirect({
  tenantSlug,
  membershipStatus,
}: ResolveRedirectParams): string {
  switch (membershipStatus) {
    case 'ACTIVE':
    case 'APPROVED':
      return `/${tenantSlug}/portal`;

    case 'PENDING_REVIEW':
      return `/${tenantSlug}/membership/status`;

    case 'EXPIRED':
      return `/${tenantSlug}/membership/renew`;

    case 'CANCELLED':
    case 'REJECTED':
    case null:
    default:
      return `/${tenantSlug}/membership/new`;
  }
}
