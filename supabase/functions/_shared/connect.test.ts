/**
 * Contract tests for _shared/connect.ts — Stripe Connect fee math + gating.
 * SAFE GOLD: deterministic, no network, no DB.
 */
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeApplicationFeeCents,
  isTenantReadyForCharges,
  buildDestinationChargeParams,
  type TenantConnectInfo,
} from "./connect.ts";

const ready: TenantConnectInfo = {
  tenantId: "t1",
  stripeConnectAccountId: "acct_123",
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  platformFeeBps: 500,
};

// ── computeApplicationFeeCents ──────────────────────────────────────────────

Deno.test("fee: 5% of R$100,00 (10000c) = 500c", () => {
  assertEquals(computeApplicationFeeCents(10000, 500), 500);
});

Deno.test("fee: round half-up (333c @ 5% = 16.65 → 17)", () => {
  assertEquals(computeApplicationFeeCents(333, 500), 17);
});

Deno.test("fee: 0 bps yields 0", () => {
  assertEquals(computeApplicationFeeCents(10000, 0), 0);
});

Deno.test("fee: never >= amount (cap at amount-1)", () => {
  // 100% of 100c would be 100c — must cap at 99c so Stripe accepts it.
  assertEquals(computeApplicationFeeCents(100, 10000), 99);
});

Deno.test("fee: non-positive amount yields 0", () => {
  assertEquals(computeApplicationFeeCents(0, 500), 0);
  assertEquals(computeApplicationFeeCents(-50, 500), 0);
});

Deno.test("fee: NaN/garbage bps treated as 0", () => {
  assertEquals(computeApplicationFeeCents(10000, NaN), 0);
});

// ── isTenantReadyForCharges ─────────────────────────────────────────────────

Deno.test("ready: full account is ready", () => {
  assert(isTenantReadyForCharges(ready));
});

Deno.test("ready: null info is not ready", () => {
  assertEquals(isTenantReadyForCharges(null), false);
});

Deno.test("ready: no account id is not ready", () => {
  assertEquals(
    isTenantReadyForCharges({ ...ready, stripeConnectAccountId: null }),
    false,
  );
});

Deno.test("ready: charges disabled is not ready", () => {
  assertEquals(
    isTenantReadyForCharges({ ...ready, chargesEnabled: false }),
    false,
  );
});

Deno.test("ready: payouts disabled still ready (funds accrue)", () => {
  assert(isTenantReadyForCharges({ ...ready, payoutsEnabled: false }));
});

// ── buildDestinationChargeParams ────────────────────────────────────────────

Deno.test("destination params: ready tenant produces fee + destination", () => {
  const params = buildDestinationChargeParams(ready, 10000);
  assertEquals(params, {
    application_fee_amount: 500,
    transfer_data: { destination: "acct_123" },
  });
});

Deno.test("destination params: not-ready tenant returns undefined", () => {
  assertEquals(buildDestinationChargeParams(null, 10000), undefined);
  assertEquals(
    buildDestinationChargeParams({ ...ready, chargesEnabled: false }, 10000),
    undefined,
  );
});
