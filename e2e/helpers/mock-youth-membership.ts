/**
 * PI Y1.0 — YOUTH MEMBERSHIP SAFE GOLD v1.0 — E2E Mock Helpers
 *
 * Deterministic mocks for Youth Membership endpoints.
 * No Date.now() or new Date() for current time.
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

// Youth birth date: 10 years old at FIXED_TIMESTAMP_ISO
export const FIXED_YOUTH_BIRTH_DATE = '2016-03-15';

// Adult birth date: 25 years old at FIXED_TIMESTAMP_ISO
export const FIXED_ADULT_BIRTH_DATE = '2001-01-10';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_youth_01',
  MEMBERSHIP_ID: 'membership_youth_01',
  ATHLETE_ID: 'athlete_youth_01',
  GUARDIAN_ID: 'guardian_youth_01',
  USER_ID: 'user_youth_01',
  PROFILE_ID: 'profile_youth_01',
};

export type MockYouthConfig = {
  membershipType?: 'YOUTH' | 'ADULT';
  tenantSlug?: string;
  birthDate?: string;
  guardianName?: string;
  athleteName?: string;
};

/**
 * Mock youth membership data with deterministic values.
 */
export async function mockYouthMembershipUniversal(
  page: Page,
  config: MockYouthConfig = {}
) {
  const membershipType = config.membershipType ?? 'YOUTH';
  const tenantSlug = config.tenantSlug ?? 'test-tenant';
  const birthDate = config.birthDate ?? FIXED_YOUTH_BIRTH_DATE;
  const guardianName = config.guardianName ?? 'Guardian SAFE GOLD';
  const athleteName = config.athleteName ?? 'Athlete SAFE GOLD Youth';

  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') return route.continue();

    // Mock memberships endpoint
    if (url.includes('/rest/v1/memberships')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.MEMBERSHIP_ID,
          tenant_id: FIXED_IDS.TENANT_ID,
          athlete_id: FIXED_IDS.ATHLETE_ID,
          type: 'FIRST_MEMBERSHIP',
          status: 'DRAFT',
          applicant_data: {
            full_name: athleteName,
            birth_date: birthDate,
            is_minor: membershipType === 'YOUTH',
            guardian: membershipType === 'YOUTH' ? {
              full_name: guardianName,
              relationship: 'PARENT',
              email: 'guardian@test.com',
              phone: '11999999999',
            } : null,
          },
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    // Mock tenants
    if (url.includes('/rest/v1/tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.TENANT_ID,
          slug: tenantSlug,
          name: 'SAFE GOLD Youth Tenant',
          status: 'ACTIVE',
          is_active: true,
          onboarding_completed: true,
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    // Mock guardians
    if (url.includes('/rest/v1/guardians')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(membershipType === 'YOUTH' ? [{
          id: FIXED_IDS.GUARDIAN_ID,
          tenant_id: FIXED_IDS.TENANT_ID,
          full_name: guardianName,
          relationship: 'PARENT',
          email: 'guardian@test.com',
          phone: '11999999999',
          national_id: '12345678901',
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }] : []),
      });
    }

    // Mock athletes
    if (url.includes('/rest/v1/athletes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.ATHLETE_ID,
          tenant_id: FIXED_IDS.TENANT_ID,
          full_name: athleteName,
          birth_date: birthDate,
          gender: 'MALE',
          email: 'athlete@test.com',
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    return route.continue();
  });
}

type FailureType = '403' | '500' | 'timeout' | 'invalid-json';

/**
 * Mock youth membership failures for resilience testing.
 */
export async function mockYouthMembershipFailure(
  page: Page,
  type: FailureType
) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Only intercept GET requests to membership-related endpoints
    if (method !== 'GET') return route.continue();

    const isMembershipEndpoint =
      url.includes('/rest/v1/memberships') ||
      url.includes('/rest/v1/guardians') ||
      url.includes('/rest/v1/athletes') ||
      (url.includes('/functions/v1') && url.toLowerCase().includes('membership'));

    if (!isMembershipEndpoint) return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden', message: 'Access denied' }),
        });

      case '500':
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });

      case 'timeout':
        await new Promise((r) => setTimeout(r, 15000));
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' }),
        });

      case 'invalid-json':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{ invalid json syntax here [[',
        });

      default:
        return route.continue();
    }
  });
}
