/**
 * Stripe Connect (Express) — shared helpers.
 *
 * Tatame Pro is a marketplace: athletes pay fees that belong to the Tenant.
 * We use **destination charges**: the charge is created on the platform
 * account, an `application_fee_amount` is retained by the platform, and the
 * remainder is transferred to the Tenant's connected account.
 *
 * SAFE GOLD:
 * - Pure helpers, no side effects beyond the explicit Stripe/DB calls.
 * - Deterministic fee math (integer cents, banker-free round half-up).
 */

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = any;

export interface TenantConnectInfo {
  tenantId: string;
  stripeConnectAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  platformFeeBps: number;
}

/**
 * Loads the Connect linkage + fee config for a tenant. Service-role client
 * required (these columns are not exposed to anon/auth roles by RLS for
 * write, only read by the owning tenant admin).
 */
export async function getTenantConnectInfo(
  supabaseAdmin: SupabaseClientAny,
  tenantId: string,
): Promise<TenantConnectInfo | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select(
      "id, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_details_submitted, platform_fee_bps",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    tenantId: data.id,
    stripeConnectAccountId: data.stripe_connect_account_id ?? null,
    chargesEnabled: data.stripe_connect_charges_enabled === true,
    payoutsEnabled: data.stripe_connect_payouts_enabled === true,
    detailsSubmitted: data.stripe_connect_details_submitted === true,
    // Default mirrors the migration default (5%). Never trust a null/NaN here.
    platformFeeBps:
      typeof data.platform_fee_bps === "number" && data.platform_fee_bps >= 0
        ? data.platform_fee_bps
        : 500,
  };
}

/**
 * Computes the platform application fee (in cents) for a charge amount.
 * Round half-up to the nearest cent; never exceeds the charge amount.
 */
export function computeApplicationFeeCents(
  amountCents: number,
  platformFeeBps: number,
): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const bps = Number.isFinite(platformFeeBps) && platformFeeBps > 0 ? platformFeeBps : 0;
  const fee = Math.round((amountCents * bps) / 10000);
  // Defensive: never let the fee swallow the whole charge (Stripe rejects
  // application_fee_amount >= amount). Cap at amount - 1 cent.
  return Math.min(fee, Math.max(0, amountCents - 1));
}

/**
 * True when the tenant is ready to RECEIVE money via Connect.
 * A destination charge requires an account that exists AND has charges
 * enabled (KYC cleared). `payouts_enabled` can still be false transiently
 * while Stripe verifies the bank account — funds accrue and pay out later,
 * so it is not a hard blocker for accepting a charge.
 */
export function isTenantReadyForCharges(info: TenantConnectInfo | null): boolean {
  return !!info && !!info.stripeConnectAccountId && info.chargesEnabled === true;
}

/**
 * Builds the Stripe Checkout `payment_intent_data` Connect block for a
 * destination charge. Returns undefined when the tenant is NOT Connect-ready
 * — callers decide whether to fall back to the legacy platform-only charge
 * (Phase 1+2 soft fallback) or hard-block.
 */
export function buildDestinationChargeParams(
  info: TenantConnectInfo | null,
  amountCents: number,
):
  | {
      application_fee_amount: number;
      transfer_data: { destination: string };
    }
  | undefined {
  if (!isTenantReadyForCharges(info) || !info) return undefined;
  return {
    application_fee_amount: computeApplicationFeeCents(amountCents, info.platformFeeBps),
    transfer_data: { destination: info.stripeConnectAccountId as string },
  };
}
