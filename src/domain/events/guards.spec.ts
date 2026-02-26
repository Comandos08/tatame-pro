import { describe, it, expect } from 'vitest';

import {
  isEventEditable,
  isEventPubliclyVisible,
  canModifyCategories,
  canGenerateBrackets,
  canRegenerateBracket,
  canPublishBracket,
  isBracketLocked,
  areRegistrationsOpen,
  deriveEventPermissions,
  validateEventTransition,
  validateBracketTransition,
  canAcceptRegistrations,
  deriveEventViewState,
} from './guards';
import type { SafeEventStatus, SafeBracketStatus } from './safeEnums';

const ALL_EVENT_STATUSES: SafeEventStatus[] = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'];
const ALL_BRACKET_STATUSES: SafeBracketStatus[] = ['DRAFT', 'GENERATED', 'PUBLISHED', 'LOCKED'];

// ============================================================================
// EVENT STATUS GUARDS
// ============================================================================
describe('Event status guards', () => {
  it('isEventEditable returns true ONLY for DRAFT', () => {
    ALL_EVENT_STATUSES.forEach(s => {
      expect(isEventEditable(s)).toBe(s === 'DRAFT');
    });
  });

  it('canModifyCategories returns true ONLY for DRAFT', () => {
    ALL_EVENT_STATUSES.forEach(s => {
      expect(canModifyCategories(s)).toBe(s === 'DRAFT');
    });
  });

  it('canGenerateBrackets returns true for DRAFT and PUBLISHED', () => {
    ALL_EVENT_STATUSES.forEach(s => {
      expect(canGenerateBrackets(s)).toBe(s === 'DRAFT' || s === 'PUBLISHED');
    });
  });

  it('isEventPubliclyVisible requires PUBLISHED and isPublic=true', () => {
    expect(isEventPubliclyVisible('PUBLISHED', true)).toBe(true);
    expect(isEventPubliclyVisible('PUBLISHED', false)).toBe(false);
    expect(isEventPubliclyVisible('DRAFT', true)).toBe(false);
  });
});

// ============================================================================
// BRACKET STATUS GUARDS
// ============================================================================
describe('Bracket status guards', () => {
  it('canRegenerateBracket returns true for DRAFT and GENERATED', () => {
    ALL_BRACKET_STATUSES.forEach(s => {
      expect(canRegenerateBracket(s)).toBe(s === 'DRAFT' || s === 'GENERATED');
    });
  });

  it('canPublishBracket returns true ONLY for GENERATED', () => {
    ALL_BRACKET_STATUSES.forEach(s => {
      expect(canPublishBracket(s)).toBe(s === 'GENERATED');
    });
  });

  it('isBracketLocked returns true for PUBLISHED and LOCKED', () => {
    ALL_BRACKET_STATUSES.forEach(s => {
      expect(isBracketLocked(s)).toBe(s === 'PUBLISHED' || s === 'LOCKED');
    });
  });
});

// ============================================================================
// REGISTRATIONS
// ============================================================================
describe('areRegistrationsOpen', () => {
  const baseEvent = {
    status: 'PUBLISHED' as SafeEventStatus,
    registrationOpensAt: '2026-01-01T00:00:00Z',
    registrationClosesAt: '2026-12-31T23:59:59Z',
  };

  it('returns true when within registration window and PUBLISHED', () => {
    expect(areRegistrationsOpen(baseEvent, '2026-06-15T12:00:00Z')).toBe(true);
  });

  it('returns false when before registration opens', () => {
    expect(areRegistrationsOpen(baseEvent, '2025-12-31T23:59:59Z')).toBe(false);
  });

  it('returns false when after registration closes', () => {
    expect(areRegistrationsOpen(baseEvent, '2027-01-01T00:00:01Z')).toBe(false);
  });

  it('returns false when event is not PUBLISHED', () => {
    expect(areRegistrationsOpen({ ...baseEvent, status: 'DRAFT' }, '2026-06-15T12:00:00Z')).toBe(false);
  });
});

// ============================================================================
// PERMISSIONS
// ============================================================================
describe('deriveEventPermissions', () => {
  it('returns all false for non-admin', () => {
    const perms = deriveEventPermissions('PUBLISHED', false);
    expect(perms.canEdit).toBe(false);
    expect(perms.canPublish).toBe(false);
    expect(perms.canCancel).toBe(false);
    expect(perms.canManageCategories).toBe(false);
    expect(perms.canManageBrackets).toBe(false);
    expect(perms.canManageRegistrations).toBe(false);
  });

  it('returns full permissions for admin on DRAFT event', () => {
    const perms = deriveEventPermissions('DRAFT', true);
    expect(perms.canEdit).toBe(true);
    expect(perms.canPublish).toBe(true);
    expect(perms.canManageCategories).toBe(true);
    expect(perms.canManageBrackets).toBe(true);
  });

  it('returns cancel permission for admin on PUBLISHED event', () => {
    const perms = deriveEventPermissions('PUBLISHED', true);
    expect(perms.canCancel).toBe(true);
    expect(perms.canEdit).toBe(false);
    expect(perms.canManageRegistrations).toBe(true);
  });
});

// ============================================================================
// CAPACITY
// ============================================================================
describe('canAcceptRegistrations', () => {
  const event = {
    status: 'PUBLISHED' as SafeEventStatus,
    registrationOpensAt: '2026-01-01T00:00:00Z',
    registrationClosesAt: '2026-12-31T23:59:59Z',
    maxParticipants: 50,
  };

  it('allows when under capacity', () => {
    const result = canAcceptRegistrations(event, 30, '2026-06-15T12:00:00Z');
    expect(result.allowed).toBe(true);
  });

  it('rejects at capacity', () => {
    const result = canAcceptRegistrations(event, 50, '2026-06-15T12:00:00Z');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('capacity');
  });

  it('rejects when not published', () => {
    const result = canAcceptRegistrations(
      { ...event, status: 'DRAFT' }, 0, '2026-06-15T12:00:00Z'
    );
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// TRANSITIONS
// ============================================================================
describe('validateEventTransition', () => {
  it('returns null for valid transition DRAFT → PUBLISHED', () => {
    expect(validateEventTransition('DRAFT', 'PUBLISHED')).toBeNull();
  });

  it('returns error for invalid transition ARCHIVED → DRAFT', () => {
    expect(validateEventTransition('ARCHIVED', 'DRAFT')).toContain('Cannot transition');
  });
});

describe('validateBracketTransition', () => {
  it('returns null for valid transition GENERATED → PUBLISHED', () => {
    expect(validateBracketTransition('GENERATED', 'PUBLISHED')).toBeNull();
  });

  it('returns error for invalid transition LOCKED → DRAFT', () => {
    expect(validateBracketTransition('LOCKED', 'DRAFT')).toContain('Cannot transition');
  });
});

// ============================================================================
// VIEW STATE
// ============================================================================
describe('deriveEventViewState', () => {
  it('returns LOADING when loading', () => {
    expect(deriveEventViewState(true, false, null)).toBe('LOADING');
  });

  it('returns ERROR when has error', () => {
    expect(deriveEventViewState(false, true, null)).toBe('ERROR');
  });

  it('returns NOT_FOUND when no event', () => {
    expect(deriveEventViewState(false, false, null)).toBe('NOT_FOUND');
  });

  it('returns READY when event exists', () => {
    const event = { id: '1', status: 'DRAFT' } as any;
    expect(deriveEventViewState(false, false, event)).toBe('READY');
  });
});
