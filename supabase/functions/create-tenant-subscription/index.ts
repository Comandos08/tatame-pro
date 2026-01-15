import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-TENANT-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    logStep("Superadmin verified", { userId: userData.user.id });

    // Get request body
    const body = await req.json();
    const { tenantId, planPriceId } = body;

    if (!tenantId) {
      throw new Error("Missing tenantId");
    }

    // Default price ID for annual federation plan
    const priceId = planPriceId || "price_1Spz03HH533PC5DdDUbCe7fS";
    logStep("Creating subscription", { tenantId, priceId });

    // Get tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, stripe_customer_id")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    logStep("Tenant found", { name: tenant.name, slug: tenant.slug });

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Check/create Stripe customer
    let stripeCustomerId = tenant.stripe_customer_id;

    if (!stripeCustomerId) {
      logStep("Creating Stripe customer for tenant");
      
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

      logStep("Stripe customer created", { customerId: stripeCustomerId });
    } else {
      logStep("Using existing Stripe customer", { customerId: stripeCustomerId });
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
        logStep("Active subscription already exists", { 
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

    // Create new subscription
    logStep("Creating Stripe subscription");
    
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        tenant_id: tenantId,
        tenant_slug: tenant.slug,
      },
    });

    logStep("Subscription created", { 
      subscriptionId: subscription.id, 
      status: subscription.status 
    });

    // Map Stripe status to our enum
    const statusMap: Record<string, string> = {
      active: "ACTIVE",
      past_due: "PAST_DUE",
      canceled: "CANCELED",
      incomplete: "INCOMPLETE",
      trialing: "TRIALING",
      unpaid: "UNPAID",
      incomplete_expired: "CANCELED",
      paused: "PAST_DUE",
    };

    const billingStatus = statusMap[subscription.status] || "INCOMPLETE";

    // Upsert tenant_billing record
    const billingData = {
      tenant_id: tenantId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      plan_name: "Plano Federação Anual",
      plan_price_id: priceId,
      status: billingStatus,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    };

    if (existingBilling) {
      await supabase
        .from("tenant_billing")
        .update(billingData)
        .eq("id", existingBilling.id);
    } else {
      await supabase.from("tenant_billing").insert(billingData);
    }

    logStep("Billing record saved", { status: billingStatus });

    // Update tenant isActive based on billing status
    const isActive = billingStatus === "ACTIVE" || billingStatus === "TRIALING";
    await supabase
      .from("tenants")
      .update({ is_active: isActive })
      .eq("id", tenantId);

    logStep("Tenant isActive updated", { isActive });

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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
