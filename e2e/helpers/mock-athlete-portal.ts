/**
 * 🏋️ Athlete Portal Mock Factory — PI A1.0
 *
 * Deterministic mock helpers for Athlete Portal E2E tests.
 * Intercepts Supabase REST endpoints with SAFE GOLD data.
 */

import { Page } from '@playwright/test';

export interface MockProfile {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  email: string | null;
}

export interface MockAthlete {
  id: string;
  tenant_id: string;
  full_name: string;
  profile_id: string;
}

export interface MockMembership {
  id: string;
  tenant_id: string;
  athlete_id: string;
  status: 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING_REVIEW';
  payment_status: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  created_at: string;
}

export interface MockDigitalCard {
  id: string;
  tenant_id: string;
  membership_id: string;
  qr_code_image_url: string | null;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
}

/**
 * Core mock function - intercepts Supabase REST endpoints
 */
export async function mockPortalBase(
  page: Page,
  mocks: {
    profiles?: MockProfile[];
    athletes?: MockAthlete[];
    memberships?: MockMembership[];
    digital_cards?: MockDigitalCard[];
  }
): Promise<void> {
  const map: Record<string, unknown[]> = {
    profiles: mocks.profiles || [],
    athletes: mocks.athletes || [],
    memberships: mocks.memberships || [],
    digital_cards: mocks.digital_cards || [],
  };

  await page.route('**/rest/v1/**', (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: portal contract tests are READ-ONLY
    if (method !== 'GET') {
      route.continue();
      return;
    }

    for (const table of Object.keys(map)) {
      if (url.includes(`/rest/v1/${table}`)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(map[table]),
        });
        return;
      }
    }

    route.continue();
  });
}

/* ======================================================
   Factory Functions
   ====================================================== */

export function makeProfile(
  id: string,
  tenantId: string | null,
  overrides: Partial<MockProfile> = {}
): MockProfile {
  return {
    id,
    tenant_id: tenantId,
    full_name: 'Test User',
    email: 'test@example.com',
    ...overrides,
  };
}

export function makeAthlete(
  id: string,
  tenantId: string,
  profileId: string,
  overrides: Partial<MockAthlete> = {}
): MockAthlete {
  return {
    id,
    tenant_id: tenantId,
    full_name: 'Test Athlete',
    profile_id: profileId,
    ...overrides,
  };
}

export function makeMembership(
  id: string,
  tenantId: string,
  athleteId: string,
  status: MockMembership['status'],
  endDate: string | null,
  overrides: Partial<MockMembership> = {}
): MockMembership {
  return {
    id,
    tenant_id: tenantId,
    athlete_id: athleteId,
    status,
    payment_status: 'PAID',
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: endDate,
    type: 'FIRST_MEMBERSHIP',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeDigitalCard(
  id: string,
  tenantId: string,
  membershipId: string,
  validUntil: string | null,
  overrides: Partial<MockDigitalCard> = {}
): MockDigitalCard {
  return {
    id,
    tenant_id: tenantId,
    membership_id: membershipId,
    qr_code_image_url: 'https://example.com/qr.png',
    pdf_url: 'https://example.com/card.pdf',
    valid_until: validUntil,
    content_hash_sha256: 'abc123hash',
    ...overrides,
  };
}

/* ======================================================
   Test Data Sets
   ====================================================== */

export function createActivePortalData(tenantId: string, profileId: string) {
  const athleteId = 'athlete-test-01';
  const membershipId = 'membership-test-01';

  return {
    profiles: [makeProfile(profileId, tenantId)],
    athletes: [makeAthlete(athleteId, tenantId, profileId)],
    memberships: [makeMembership(membershipId, tenantId, athleteId, 'ACTIVE', '2026-12-31T00:00:00.000Z')],
    digital_cards: [makeDigitalCard('card-test-01', tenantId, membershipId, '2026-12-31T00:00:00.000Z')],
  };
}

export function createExpiredPortalData(tenantId: string, profileId: string) {
  const athleteId = 'athlete-test-02';
  const membershipId = 'membership-test-02';

  return {
    profiles: [makeProfile(profileId, tenantId)],
    athletes: [makeAthlete(athleteId, tenantId, profileId)],
    memberships: [makeMembership(membershipId, tenantId, athleteId, 'EXPIRED', '2025-12-31T00:00:00.000Z')],
    digital_cards: [],
  };
}

export function createEmptyPortalData(tenantId: string, profileId: string) {
  return {
    profiles: [makeProfile(profileId, tenantId)],
    athletes: [],
    memberships: [],
    digital_cards: [],
  };
}
