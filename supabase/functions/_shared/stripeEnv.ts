/**
 * PI-BILL-ENV-001 — Stripe Environment Governance
 * 
 * Centralized helper for deterministic Stripe environment validation.
 * Ensures key env (sk_test/sk_live) matches billing config (test/live).
 * 
 * SAFE GOLD Contract:
 * - Never throw, always return structured results
 * - Fail-closed: any mismatch blocks operation
 * - All decisions are auditable
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type StripeEnv = 'test' | 'live';

export type EnvValidationResult = {
  ok: true;
  keyEnv: StripeEnv;
  configEnv: StripeEnv;
} | {
  ok: false;
  error_code: 'BILLING_ENV_MISMATCH' | 'BILLING_KEY_UNKNOWN' | 'BILLING_CONFIG_MISSING';
  keyEnv: StripeEnv | 'unknown';
  configEnv: StripeEnv | null;
  message: string;
};

export type PriceResolutionResult = {
  ok: true;
  priceId: string;
  planCode: string;
  planName: string;
} | {
  ok: false;
  error_code: 'BILLING_PRICE_NOT_CONFIGURED' | 'BILLING_PLAN_NOT_FOUND';
  message: string;
};

/**
 * Infer Stripe environment from secret key prefix.
 * Returns 'unknown' for empty, malformed, or unrecognized keys.
 */
export function inferKeyEnv(secretKey: string): StripeEnv | 'unknown' {
  if (!secretKey || typeof secretKey !== 'string') return 'unknown';
  
  const trimmed = secretKey.trim();
  
  // Standard secret keys
  if (trimmed.startsWith('sk_test_')) return 'test';
  if (trimmed.startsWith('sk_live_')) return 'live';
  
  // Restricted keys also follow same pattern
  if (trimmed.startsWith('rk_test_')) return 'test';
  if (trimmed.startsWith('rk_live_')) return 'live';
  
  return 'unknown';
}

/**
 * Load stripe_env from billing_environment_config table.
 * 
 * Ajuste 3: Logs WARN if multiple rows detected (singleton corruption).
 */
export async function getStripeEnvConfig(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<StripeEnv | null> {
  const { data, error } = await supabase
    .from('billing_environment_config')
    .select('stripe_env')
    .limit(2);  // Fetch 2 to detect corruption
  
  if (error) {
    console.error('[STRIPE-ENV] Failed to load billing_environment_config:', error.message);
    return null;
  }
  
  if (!data || data.length === 0) {
    console.warn('[STRIPE-ENV] ⚠️ billing_environment_config is empty. No config found.');
    return null;
  }
  
  // Ajuste 3: Log WARN if corrupted (multiple rows in singleton table)
  if (data.length > 1) {
    console.warn(
      '[STRIPE-ENV] ⚠️ SINGLETON CORRUPTION: billing_environment_config has multiple rows. ' +
      'Expected 1, found ' + data.length + '. Using first row.'
    );
  }
  
  return data[0].stripe_env as StripeEnv;
}

/**
 * Validate that key environment matches config environment.
 * FAIL-CLOSED: Any mismatch or unknown state blocks operation.
 * 
 * Ajuste 1: Returns specific error_code for each failure mode.
 */
export async function validateStripeEnv(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  secretKey: string
): Promise<EnvValidationResult> {
  const keyEnv = inferKeyEnv(secretKey);
  
  // Ajuste 1: Specific error for unknown key
  if (keyEnv === 'unknown') {
    return {
      ok: false,
      error_code: 'BILLING_KEY_UNKNOWN',
      keyEnv: 'unknown',
      configEnv: null,
      message: 'Stripe secret key format not recognized. Expected sk_test_* or sk_live_*.'
    };
  }
  
  const configEnv = await getStripeEnvConfig(supabase);
  
  // Ajuste 1: Specific error for missing config
  if (!configEnv) {
    return {
      ok: false,
      error_code: 'BILLING_CONFIG_MISSING',
      keyEnv,
      configEnv: null,
      message: 'Billing environment configuration not found in database.'
    };
  }
  
  // Check for mismatch
  if (keyEnv !== configEnv) {
    return {
      ok: false,
      error_code: 'BILLING_ENV_MISMATCH',
      keyEnv,
      configEnv,
      message: `Stripe key environment (${keyEnv}) does not match billing config (${configEnv}).`
    };
  }
  
  return {
    ok: true,
    keyEnv,
    configEnv
  };
}

/**
 * Resolve price_id from subscription_plans table based on environment.
 */
export async function resolvePriceId(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  planType: 'monthly' | 'annual',
  stripeEnv: StripeEnv
): Promise<PriceResolutionResult> {
  const planCode = planType === 'monthly' ? 'FEDERATION_MONTHLY' : 'FEDERATION_ANNUAL';
  
  const { data: plan, error } = await supabase
    .from('subscription_plans')
    .select('id, code, name, stripe_price_id_test, stripe_price_id_live')
    .eq('code', planCode)
    .eq('is_active', true)
    .maybeSingle();
  
  if (error) {
    console.error('[STRIPE-ENV] Failed to load subscription_plans:', error.message);
    return {
      ok: false,
      error_code: 'BILLING_PLAN_NOT_FOUND',
      message: `Error loading subscription plan: ${error.message}`
    };
  }
  
  if (!plan) {
    return {
      ok: false,
      error_code: 'BILLING_PLAN_NOT_FOUND',
      message: `Subscription plan not found: ${planCode}`
    };
  }
  
  const priceId = stripeEnv === 'test' 
    ? plan.stripe_price_id_test 
    : plan.stripe_price_id_live;
  
  if (!priceId) {
    return {
      ok: false,
      error_code: 'BILLING_PRICE_NOT_CONFIGURED',
      message: `No Stripe price configured for ${planCode} in ${stripeEnv} environment.`
    };
  }
  
  return {
    ok: true,
    priceId,
    planCode: plan.code,
    planName: plan.name
  };
}

/**
 * Ajuste 2: Feature flag for preflight price check.
 * Controlled by ENABLE_STRIPE_PREFLIGHT environment variable.
 */
export function isPreflightEnabled(): boolean {
  return Deno.env.get('ENABLE_STRIPE_PREFLIGHT') === 'true';
}
