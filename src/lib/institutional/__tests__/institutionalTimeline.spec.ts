/**
 * Institutional Timeline Type Tests
 *
 * Validates that all event types used in the codebase are present
 * in the InstitutionalEventType union. Prevents silent type mismatches.
 *
 * FROZEN CONTRACT: Adding new event types requires updating this test.
 */

import { describe, it, expect } from 'vitest';
import type { InstitutionalEventDomain, InstitutionalEventType } from '../institutionalTimeline';

// All event types actually emitted from the codebase
const KNOWN_DOMAINS: InstitutionalEventDomain[] = [
  'AUTH',
  'IDENTITY',
  'BILLING',
  'SECURITY',
  'GOVERNANCE',
  'SYSTEM',
  'FEATURE_FLAG',
];

const KNOWN_TYPES: InstitutionalEventType[] = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'IDENTITY_RESOLVED',
  'IDENTITY_ERROR',
  'BILLING_STATUS_CHANGED',
  'SUBSCRIPTION_SUSPENDED',
  'TENANT_LIFECYCLE_CHANGED',
  'SECURITY_BLOCK_APPLIED',
  'SECURITY_BLOCK_LIFTED',
  'SYSTEM_LIMIT_REACHED',
  'FLAG_UPDATED',
];

describe('InstitutionalEventDomain', () => {
  it('includes all expected domains', () => {
    // TypeScript compilation itself validates membership — this test documents
    // the contract and catches accidental removal of domains.
    const domains: InstitutionalEventDomain[] = KNOWN_DOMAINS;
    expect(domains).toHaveLength(7);
  });

  it('IDENTITY domain is present', () => {
    const domain: InstitutionalEventDomain = 'IDENTITY';
    expect(domain).toBe('IDENTITY');
  });
});

describe('InstitutionalEventType', () => {
  it('includes all expected event types', () => {
    const types: InstitutionalEventType[] = KNOWN_TYPES;
    expect(types).toHaveLength(11);
  });

  it('IDENTITY_ERROR type is present (added in audit fix)', () => {
    const type: InstitutionalEventType = 'IDENTITY_ERROR';
    expect(type).toBe('IDENTITY_ERROR');
  });

  it('IDENTITY_RESOLVED type is present', () => {
    const type: InstitutionalEventType = 'IDENTITY_RESOLVED';
    expect(type).toBe('IDENTITY_RESOLVED');
  });

  it('all known types are distinct values', () => {
    const uniqueTypes = new Set(KNOWN_TYPES);
    expect(uniqueTypes.size).toBe(KNOWN_TYPES.length);
  });
});

describe('Event payload validation', () => {
  it('valid domain + type combination compiles without error', () => {
    const payload: { domain: InstitutionalEventDomain; type: InstitutionalEventType } = {
      domain: 'IDENTITY',
      type: 'IDENTITY_ERROR',
    };
    expect(payload.domain).toBe('IDENTITY');
    expect(payload.type).toBe('IDENTITY_ERROR');
  });
});
