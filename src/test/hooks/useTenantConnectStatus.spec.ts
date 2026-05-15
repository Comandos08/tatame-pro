/**
 * isConnectReady — Connect readiness predicate (frontend mirror of the
 * backend isTenantReadyForCharges). A tenant can receive money only when
 * connected AND charges are enabled.
 */
import { describe, it, expect, vi } from 'vitest';

// The hook module transitively imports the supabase client, which throws at
// load time without VITE_SUPABASE_* env. We only test the pure predicate, so
// stub the client (same pattern as edgeInvoke.spec).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { isConnectReady, type TenantConnectStatus } from '@/hooks/useTenantConnectStatus';

const base: TenantConnectStatus = {
  connected: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  platformFeeBps: 500,
};

describe('isConnectReady', () => {
  it('true when connected and charges enabled', () => {
    expect(isConnectReady(base)).toBe(true);
  });

  it('false when undefined', () => {
    expect(isConnectReady(undefined)).toBe(false);
  });

  it('false when not connected', () => {
    expect(isConnectReady({ ...base, connected: false })).toBe(false);
  });

  it('false when charges disabled (Stripe still reviewing)', () => {
    expect(isConnectReady({ ...base, chargesEnabled: false })).toBe(false);
  });

  it('true even if payouts not yet enabled (funds accrue)', () => {
    expect(isConnectReady({ ...base, payoutsEnabled: false })).toBe(true);
  });
});
