import type {
  PortalViewState,
  MembershipState,
  CardState,
} from '@/types/athlete-portal-state';

const VIEW: PortalViewState[] = ['LOADING', 'READY', 'EMPTY', 'ERROR'];
const MEM: MembershipState[] = ['ACTIVE', 'EXPIRING', 'EXPIRED', 'NONE'];
const CARD: CardState[] = ['VALID', 'INVALID', 'NONE'];

export function assertPortalViewState(v: string): PortalViewState {
  return VIEW.includes(v as PortalViewState) ? (v as PortalViewState) : 'ERROR';
}

export function assertMembershipState(v: string): MembershipState {
  return MEM.includes(v as MembershipState) ? (v as MembershipState) : 'NONE';
}

export function assertCardState(v: string): CardState {
  return CARD.includes(v as CardState) ? (v as CardState) : 'NONE';
}

/**
 * Derive membership state from data (pure, no Date.now())
 */
export function deriveMembershipState(input: {
  hasMembership: boolean;
  isActive?: boolean;
  isExpiringSoon?: boolean;
  isExpired?: boolean;
}): MembershipState {
  if (!input.hasMembership) return 'NONE';
  if (input.isExpired) return 'EXPIRED';
  if (input.isExpiringSoon) return 'EXPIRING';
  if (input.isActive) return 'ACTIVE';
  return 'NONE';
}

export function deriveCardState(input: {
  hasCard: boolean;
  isValid?: boolean;
}): CardState {
  if (!input.hasCard) return 'NONE';
  return input.isValid ? 'VALID' : 'INVALID';
}
