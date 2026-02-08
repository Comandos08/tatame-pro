/**
 * 🎭 Events Mocking — PI E1.0
 *
 * Provides deterministic mock responses for Events endpoints.
 * All mocks use page.route() - no real database access.
 *
 * SAFE GOLD: Only returns states from the SAFE GOLD subset.
 */

import { Page } from '@playwright/test';

// SAFE GOLD states only
type EventState = 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'FINISHED' | 'CANCELED';
type RegistrationState = 'PENDING' | 'CONFIRMED' | 'CANCELED';

export interface MockEvent {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  status: EventState;
  is_public: boolean;
  sport_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MockRegistration {
  id: string;
  event_id: string;
  category_id: string;
  athlete_id: string;
  tenant_id: string;
  status: RegistrationState;
  payment_status: 'NOT_PAID' | 'PAID' | 'FAILED';
  created_at: string;
  updated_at: string;
}

export interface MockCategory {
  id: string;
  event_id: string;
  tenant_id: string;
  name: string;
  is_active: boolean;
  price_cents: number;
  currency: string;
  max_participants: number | null;
  created_at: string;
}

/**
 * Maps extended states to SAFE GOLD subset
 */
function normalizeEventState(status: string): EventState {
  const mapping: Record<string, EventState> = {
    'DRAFT': 'DRAFT',
    'PUBLISHED': 'PUBLISHED',
    'REGISTRATION_OPEN': 'PUBLISHED',
    'REGISTRATION_CLOSED': 'PUBLISHED',
    'ONGOING': 'ONGOING',
    'FINISHED': 'FINISHED',
    'ARCHIVED': 'FINISHED',
    'CANCELLED': 'CANCELED',
    'CANCELED': 'CANCELED',
  };
  return mapping[status] || 'DRAFT';
}

/**
 * Mock event factory
 */
export function createMockEvent(
  id: string,
  tenantId: string,
  status: EventState = 'PUBLISHED',
  overrides: Partial<MockEvent> = {}
): MockEvent {
  return {
    id,
    tenant_id: tenantId,
    name: `Test Event ${id.slice(0, 8)}`,
    description: 'Test event description',
    banner_url: null,
    start_date: '2026-02-15T09:00:00.000Z',
    end_date: '2026-02-15T18:00:00.000Z',
    location: 'Test Venue',
    status: normalizeEventState(status),
    is_public: status !== 'DRAFT',
    sport_type: 'BJJ',
    created_by: 'test-user-id',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

/**
 * Creates a set of mock events with various SAFE GOLD states
 */
export function createTestEventSet(tenantId: string): MockEvent[] {
  return [
    createMockEvent('ev-001-draft', tenantId, 'DRAFT', { is_public: false }),
    createMockEvent('ev-002-published', tenantId, 'PUBLISHED'),
    createMockEvent('ev-003-ongoing', tenantId, 'ONGOING'),
    createMockEvent('ev-004-finished', tenantId, 'FINISHED'),
  ];
}

/**
 * Mocks events list endpoint to return provided events
 */
export async function mockEventsList(
  page: Page,
  tenantId: string,
  events: MockEvent[] = []
): Promise<void> {
  await page.route('**/rest/v1/events*', (route, request) => {
    const method = request.method();
    if (method !== 'GET') {
      route.continue();
      return;
    }

    const url = new URL(request.url());
    const queryTenantId = url.searchParams.get('tenant_id');

    // Filter by tenant_id if specified in query (RLS simulation)
    let filteredEvents = events;
    if (queryTenantId) {
      const tenantFilter = queryTenantId.replace('eq.', '');
      filteredEvents = events.filter(e => e.tenant_id === tenantFilter);
    } else {
      filteredEvents = events.filter(e => e.tenant_id === tenantId);
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filteredEvents),
    });
  });
}

/**
 * Mocks single event detail endpoint
 */
export async function mockEventDetail(
  page: Page,
  eventId: string,
  event?: MockEvent
): Promise<void> {
  await page.route(`**/rest/v1/events*id=eq.${eventId}*`, (route, request) => {
    if (request.method() !== 'GET') {
      route.continue();
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(event ? [event] : []),
    });
  });
}

/**
 * Mocks registrations endpoint
 */
export async function mockRegistrations(
  page: Page,
  registrations: MockRegistration[] = []
): Promise<void> {
  await page.route('**/rest/v1/event_registrations*', (route, request) => {
    if (request.method() !== 'GET') {
      route.continue();
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(registrations),
    });
  });
}

/**
 * Mocks event categories endpoint
 */
export async function mockCategories(
  page: Page,
  categories: MockCategory[] = []
): Promise<void> {
  await page.route('**/rest/v1/event_categories*', (route, request) => {
    if (request.method() !== 'GET') {
      route.continue();
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(categories),
    });
  });
}

/**
 * Creates a mock registration
 */
export function createMockRegistration(
  id: string,
  eventId: string,
  categoryId: string,
  athleteId: string,
  tenantId: string,
  status: RegistrationState = 'PENDING'
): MockRegistration {
  return {
    id,
    event_id: eventId,
    category_id: categoryId,
    athlete_id: athleteId,
    tenant_id: tenantId,
    status,
    payment_status: 'NOT_PAID',
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
  };
}

/**
 * Creates a mock category
 */
export function createMockCategory(
  id: string,
  eventId: string,
  tenantId: string,
  name: string = 'Test Category'
): MockCategory {
  return {
    id,
    event_id: eventId,
    tenant_id: tenantId,
    name,
    is_active: true,
    price_cents: 0,
    currency: 'BRL',
    max_participants: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}
