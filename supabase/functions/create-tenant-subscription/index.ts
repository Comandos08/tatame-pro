
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { 
  validateStripeEnv, 
  resolvePriceId, 
  isPreflightEnabled 
} from "../_shared/stripeEnv.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { mapStripeStatusToBilling } from "../_shared/billing-state-machine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Trial period in days for new tenants (Growth Trial Strategy)
const TRIAL_PERIOD_DAYS = 7;

async function sendBillingEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  eventType: string,
  tenantId: string,
  // deno-lint-ignore no-explicit-any
  log: any,
  data?: Record<string, unknown>
) {
  try {
    const emailUrl = `${supabaseUrl}/functions/v1/send-billing-email`;
    await fetch(emailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ event_type: eventType, tenant_id: tenantId, data }),
    });
    log.info("Billing email triggered", { eventType, tenantId });
  } catch (err) {
    log.warn("Failed to trigger billing email", { error: err instanceof Error ? err.message : "Unknown" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("create-tenant-subscription", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!stripeSecretKey) {
      throw new Error("Missing Stripe configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verify caller is superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error("Invalid authentication");
    }

    // Check if user is superadmin
    const { data: superadminRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("role", "SUPERADMIN_GLOBAL")
      .is("tenant_id", null)
      .maybeSingle();

    if (!superadminRole) {
      throw new Error("Unauthorized: Only superadmins can create tenant subscriptions");
    }

    log.info("Superadmin verified", { userId: userData.user.id });

    // Get request body
    const body = await req.json();
    const { tenantId, planType } = body as { tenantId: string; planType?: 'monthly' | 'annual' };

    if (!tenantId) {
      throw new Error("Missing tenantId");
    }

    // ─────────────────────────────────────────────────────────────
    // PI-BILL-ENV-001 — STRIPE ENVIRONMENT VALIDATION (PRE-FLIGHT)
    // Contract: HTTP 200 always. Fail-closed on any env mismatch.
    // ─────────────────────────────────────────────────────────────

    const envValidation = await validateStripeEnv(supabase, stripeSecretKey);

    if (!envValidation.ok) {
      log.warn("Environment validation failed", { 
        error_code: envValidation.error_code,
        keyEnv: envValidation.keyEnv,
        configEnv: envValidation.configEnv
      });
      
      // Ajuste 1: Map error_code to specific audit event
      let auditEvent = AUDIT_EVENTS.BILLING_ENV_MISMATCH_BLOCKED;
      if (envValidation.error_code === 'BILLING_KEY_UNKNOWN') {
        auditEvent = AUDIT_EVENTS.BILLING_KEY_UNKNOWN_BLOCKED;
      } else if (envValidation.error_code === 'BILLING_CONFIG_MISSING') {
        auditEvent = AUDIT_EVENTS.BILLING_CONFIG_MISSING_BLOCKED;
      }
      
      await createAuditLog(supabase, {
        event_type: auditEvent,
        tenant_id: tenantId,
        metadata: {
          error_code: envValidation.error_code,
          key_env: envValidation.keyEnv,
          config_env: envValidation.configEnv,
          plan_type: planType || 'annual',
          decision: 'BLOCKED',
          source: 'create-tenant-subscription'
        }
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          error_code: envValidation.error_code,
          message: envValidation.message
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    log.info("Environment validation passed", { 
      keyEnv: envValidation.keyEnv, 
      configEnv: envValidation.configEnv 
    });

    // ─────────────────────────────────────────────────────────────
    // PI-BILL-ENV-001 — RESOLVE PRICE ID FROM DATABASE
    // ─────────────────────────────────────────────────────────────

    const priceResolution = await resolvePriceId(
      supabase, 
      planType || 'annual', 
      envValidation.configEnv
    );

    if (!priceResolution.ok) {
      log.warn("Price resolution failed", { 
        error_code: priceResolution.error_code,
        planType: planType || 'annual',
        stripeEnv: envValidation.configEnv
      });
      
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.BILLING_PRICE_NOT_CONFIGURED_BLOCKED,
        tenant_id: tenantId,
        metadata: {
          error_code: priceResolution.error_code,
          plan_type: planType || 'annual',
          stripe_env: envValidation.configEnv,
          decision: 'BLOCKED',
          source: 'create-tenant-subscription'
        }
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          error_code: priceResolution.error_code,
          message: priceResolution.message
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const priceId = priceResolution.priceId;
    const planName = priceResolution.planName;

    log.info("Price resolved from database", { 
      priceId, 
      planName, 
      planCode: priceResolution.planCode 
    });

    // Get tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, stripe_customer_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    log.info("Tenant found", { name: tenant.name, slug: tenant.slug });

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    // ─────────────────────────────────────────────────────────────
    // PI-BILL-ENV-001 — PREFLIGHT: VERIFY PRICE EXISTS IN STRIPE
    // Ajuste 2: Controlled by ENABLE_STRIPE_PREFLIGHT feature flag
    // ─────────────────────────────────────────────────────────────

    if (isPreflightEnabled()) {
      try {
        await stripe.prices.retrieve(priceId);
        log.info("Preflight price check passed", { priceId });
      } catch (priceError: unknown) {
        const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
        
        log.warn("Preflight price check failed", { priceId, error: errorMessage });
        
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.BILLING_STRIPE_PRICE_LOOKUP_FAILED,
          tenant_id: tenantId,
          metadata: {
            price_id: priceId,
            stripe_env: envValidation.configEnv,
            plan_type: planType || 'annual',
            error: errorMessage,
            decision: 'BLOCKED',
            source: 'create-tenant-subscription'
          }
        });
        
        return new Response(
          JSON.stringify({
            success: false,
            error_code: 'BILLING_STRIPE_PRICE_NOT_FOUND',
            message: 'Stripe price not found in current environment. Check billing configuration.'
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    } else {
      log.info("Preflight price check skipped (ENABLE_STRIPE_PREFLIGHT not set)");
    }

    // Check/create Stripe customer - handle mode mismatch (live vs test)
    let stripeCustomerId = tenant.stripe_customer_id;
    let needsNewCustomer = !stripeCustomerId;

    if (stripeCustomerId) {
      // Validate the existing customer exists in current Stripe mode
      try {
        await stripe.customers.retrieve(stripeCustomerId);
        log.info("Validated existing Stripe customer", { customerId: stripeCustomerId });
      } catch (customerError: unknown) {
        const errorMessage = customerError instanceof Error ? customerError.message : String(customerError);
        // Customer doesn't exist in current mode - need to create new one
        if (errorMessage.includes("No such customer") || errorMessage.includes("does not exist")) {
          log.warn("Customer not found in current Stripe mode, will create new", { 
            oldCustomerId: stripeCustomerId,
            error: errorMessage 
          });
          needsNewCustomer = true;
        } else {
          throw customerError;
        }
      }
    }

    if (needsNewCustomer) {
      log.info("Creating Stripe customer for tenant");
      
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          type: "federation",
        },
      });

      stripeCustomerId = customer.id;

      // Update tenant with stripe_customer_id
      await supabase
        .from("tenants")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", tenantId);

      log.info("Stripe customer created", { customerId: stripeCustomerId });
    }

    // Check if subscription already exists
    const { data: existingBilling } = await supabase
      .from("tenant_billing")
      .select("id, stripe_subscription_id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingBilling?.stripe_subscription_id) {
      // Check subscription status in Stripe
      const existingSub = await stripe.subscriptions.retrieve(existingBilling.stripe_subscription_id);
      
      if (existingSub.status === "active" || existingSub.status === "trialing") {
        log.info("Active subscription already exists", { 
          subscriptionId: existingBilling.stripe_subscription_id,
          status: existingSub.status
        });
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Subscription already active",
            subscriptionId: existingBilling.stripe_subscription_id,
            status: existingSub.status
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Determine if this is a new tenant (no existing billing) - apply trial
    const isNewTenant = !existingBilling;

    // Create new subscription
    log.info("Creating Stripe subscription", { isNewTenant, trialDays: isNewTenant ? TRIAL_PERIOD_DAYS : 0 });
    
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        tenant_id: tenantId,
        tenant_slug: tenant.slug,
        plan_type: planType || 'annual',
      },
    };

    // Add trial period for new tenants
    if (isNewTenant) {
      subscriptionParams.trial_period_days = TRIAL_PERIOD_DAYS;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    log.info("Subscription created", { 
      subscriptionId: subscription.id, 
      status: subscription.status 
    });

    // Map Stripe status to our enum (single source of truth: billing-state-machine.ts)
    const billingStatus = mapStripeStatusToBilling(subscription.status);

    // Upsert tenant_billing record with trial tracking
    const now = new Date();
    const trialExpiresAt = new Date(subscription.current_period_end * 1000);
    
    const billingData = {
      tenant_id: tenantId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      plan_name: planName,
      plan_price_id: priceId,
      status: billingStatus,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      // Trial tracking fields (Growth Trial)
      trial_started_at: isNewTenant ? now.toISOString() : undefined,
      trial_expires_at: isNewTenant && billingStatus === "TRIALING" ? trialExpiresAt.toISOString() : undefined,
    };

    if (existingBilling) {
      await supabase
        .from("tenant_billing")
        .update(billingData)
        .eq("id", existingBilling.id);
    } else {
      await supabase.from("tenant_billing").insert(billingData);
    }

    log.info("Billing record saved", { status: billingStatus });

    // Update tenant isActive based on billing status
    const isActive = billingStatus === "ACTIVE" || billingStatus === "TRIALING";
    await supabase
      .from("tenants")
      .update({ is_active: isActive })
      .eq("id", tenantId);

    log.info("Tenant isActive updated", { isActive });

    // Send trial started email for new tenants
    if (isNewTenant && billingStatus === "TRIALING" && subscription.current_period_end) {
      const trialEndDate = new Date(subscription.current_period_end * 1000);
      // Validate the date before using it
      if (!isNaN(trialEndDate.getTime())) {
        sendBillingEmail(supabaseUrl, supabaseServiceKey, "TRIAL_STARTED", tenantId, log, {
          trial_end_date: trialEndDate.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        });
      }
    }

    // Get payment intent for checkout
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: paymentIntent?.client_secret,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown billing error";

    log.error("Unexpected billing error", { error: errorMessage });

    // PI-BILL-HARD-001 — Normalize unexpected errors (SAFE GOLD)
    try {
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.BILLING_UNEXPECTED_ERROR,
        tenant_id: null, // tenant may be unknown at this stage
        metadata: {
          error: errorMessage,
          decision: "BLOCKED",
          source: "create-tenant-subscription",
          severity: "CRITICAL"
        }
      });
    } catch {
      // Fail-silent: audit failure must NOT cascade
      log.error("[BILLING] Failed to audit unexpected error");
    }

    return new Response(
      JSON.stringify({
        success: false,
        error_code: "BILLING_UNEXPECTED_ERROR",
        message: "Unexpected billing error. Please contact support."
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );
  }
});
