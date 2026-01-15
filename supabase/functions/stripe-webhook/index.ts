// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

type SupabaseClientAny = SupabaseClient<any, any, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

    if (!stripeSecretKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      throw new Error("Missing Stripe signature");
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      logStep("Webhook signature verification failed", { error: err instanceof Error ? err.message : "Unknown" });
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Received event", { type: event.type, id: event.id });

    // Check if event was already processed (idempotency)
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      logStep("Event already processed, skipping", { eventId: event.id });
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Process based on event type
    let status = "processed";
    let errorMessage: string | null = null;

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(supabase, supabaseUrl, supabaseServiceKey, session);
          break;
        }
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentSucceeded(supabase, paymentIntent);
          break;
        }
        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentFailed(supabase, paymentIntent);
          break;
        }
        // Subscription events for tenant billing
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(supabase, subscription);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(supabase, subscription);
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentSucceeded(supabase, invoice);
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentFailed(supabase, invoice);
          break;
        }
        default:
          logStep("Unhandled event type", { type: event.type });
      }
    } catch (processingError) {
      status = "error";
      errorMessage = processingError instanceof Error ? processingError.message : "Unknown error";
      logStep("Error processing event", { error: errorMessage });
    }

    // Record the webhook event for audit
    await supabase.from("webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event.data.object as Record<string, unknown>,
      status,
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Webhook error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function handleCheckoutCompleted(
  supabase: SupabaseClientAny,
  supabaseUrl: string,
  supabaseServiceKey: string,
  session: Stripe.Checkout.Session
) {
  logStep("Processing checkout.session.completed", { sessionId: session.id });

  const membershipId = session.metadata?.membership_id;
  if (!membershipId) {
    logStep("No membership_id in metadata, skipping");
    return;
  }

  // Check if already processed via webhook
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, payment_status, webhook_processed_at")
    .eq("id", membershipId)
    .maybeSingle();

  if (!membership) {
    throw new Error(`Membership not found: ${membershipId}`);
  }

  if ((membership as Record<string, unknown>).webhook_processed_at) {
    logStep("Membership already processed via webhook", { membershipId });
    return;
  }

  if (session.payment_status !== "paid") {
    logStep("Payment not complete", { status: session.payment_status });
    return;
  }

  // Calculate membership dates
  const startDate = new Date();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  // Update membership
  const { error: updateError } = await supabase
    .from("memberships")
    .update({
      payment_status: "PAID",
      status: "PENDING_REVIEW",
      stripe_payment_intent_id: session.payment_intent as string,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      webhook_processed_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", membershipId);

  if (updateError) {
    throw new Error(`Failed to update membership: ${updateError.message}`);
  }

  logStep("Membership updated successfully", { membershipId });

  // Trigger digital card generation
  const generateCardUrl = `${supabaseUrl}/functions/v1/generate-digital-card`;
  fetch(generateCardUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ membershipId }),
  }).catch((err) => logStep("Failed to trigger card generation", { error: err.message }));
}

async function handlePaymentSucceeded(
  supabase: SupabaseClientAny,
  paymentIntent: Stripe.PaymentIntent
) {
  logStep("Processing payment_intent.succeeded", { id: paymentIntent.id });

  // Find membership by payment intent
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, payment_status")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (!membership) {
    logStep("No membership found for payment intent, may have been handled by checkout.session.completed");
    return;
  }

  const m = membership as Record<string, unknown>;
  if (m.payment_status === "PAID") {
    logStep("Payment already marked as paid");
    return;
  }

  await supabase
    .from("memberships")
    .update({ payment_status: "PAID" } as Record<string, unknown>)
    .eq("id", m.id as string);

  logStep("Updated membership payment status to PAID", { membershipId: m.id });
}

async function handlePaymentFailed(
  supabase: SupabaseClientAny,
  paymentIntent: Stripe.PaymentIntent
) {
  logStep("Processing payment_intent.payment_failed", { id: paymentIntent.id });

  const membershipId = paymentIntent.metadata?.membership_id;
  if (!membershipId) {
    logStep("No membership_id in metadata");
    return;
  }

  await supabase
    .from("memberships")
    .update({ payment_status: "FAILED" } as Record<string, unknown>)
    .eq("id", membershipId);

  logStep("Updated membership payment status to FAILED", { membershipId });
}

// Subscription event handlers for tenant billing
async function handleSubscriptionChange(
  supabase: SupabaseClientAny,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription change", { 
    subscriptionId: subscription.id, 
    status: subscription.status 
  });

  const tenantId = subscription.metadata?.tenant_id;
  const customerId = subscription.customer as string;

  if (!tenantId && !customerId) {
    logStep("No tenant_id in metadata and no customer, skipping");
    return;
  }

  // Find tenant by stripe_customer_id if not in metadata
  let actualTenantId = tenantId;
  if (!actualTenantId) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    
    if (tenant) {
      actualTenantId = tenant.id;
    } else {
      logStep("No tenant found for customer", { customerId });
      return;
    }
  }

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

  // Upsert billing record
  const billingData = {
    tenant_id: actualTenantId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: billingStatus,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
  };

  const { data: existing } = await supabase
    .from("tenant_billing")
    .select("id")
    .eq("tenant_id", actualTenantId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("tenant_billing")
      .update(billingData as Record<string, unknown>)
      .eq("id", existing.id);
  } else {
    await supabase.from("tenant_billing").insert({
      ...billingData,
      plan_name: "Plano Federação Anual",
      plan_price_id: "price_1Spz03HH533PC5DdDUbCe7fS",
    } as Record<string, unknown>);
  }

  // Update tenant isActive
  const isActive = billingStatus === "ACTIVE" || billingStatus === "TRIALING";
  await supabase
    .from("tenants")
    .update({ is_active: isActive } as Record<string, unknown>)
    .eq("id", actualTenantId);

  logStep("Subscription updated", { tenantId: actualTenantId, status: billingStatus, isActive });
}

async function handleSubscriptionDeleted(
  supabase: SupabaseClientAny,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription deleted", { subscriptionId: subscription.id });

  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("id, tenant_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (!billing) {
    logStep("No billing record found for subscription");
    return;
  }

  // Update billing to canceled
  await supabase
    .from("tenant_billing")
    .update({
      status: "CANCELED",
      canceled_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", billing.id);

  // Deactivate tenant
  await supabase
    .from("tenants")
    .update({ is_active: false } as Record<string, unknown>)
    .eq("id", billing.tenant_id);

  logStep("Subscription deleted, tenant deactivated", { tenantId: billing.tenant_id });
}

async function handleInvoicePaymentSucceeded(
  supabase: SupabaseClientAny,
  invoice: Stripe.Invoice
) {
  logStep("Processing invoice.payment_succeeded", { invoiceId: invoice.id });

  // Only handle subscription invoices
  if (!invoice.subscription) {
    logStep("Not a subscription invoice, skipping");
    return;
  }

  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("id, tenant_id")
    .eq("stripe_subscription_id", invoice.subscription as string)
    .maybeSingle();

  if (!billing) {
    logStep("No billing record found for subscription");
    return;
  }

  // Ensure tenant is active and billing is up to date
  await supabase
    .from("tenant_billing")
    .update({ status: "ACTIVE" } as Record<string, unknown>)
    .eq("id", billing.id);

  await supabase
    .from("tenants")
    .update({ is_active: true } as Record<string, unknown>)
    .eq("id", billing.tenant_id);

  logStep("Invoice paid, tenant activated", { tenantId: billing.tenant_id });
}

async function handleInvoicePaymentFailed(
  supabase: SupabaseClientAny,
  invoice: Stripe.Invoice
) {
  logStep("Processing invoice.payment_failed", { invoiceId: invoice.id });

  if (!invoice.subscription) {
    logStep("Not a subscription invoice, skipping");
    return;
  }

  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("id, tenant_id")
    .eq("stripe_subscription_id", invoice.subscription as string)
    .maybeSingle();

  if (!billing) {
    logStep("No billing record found for subscription");
    return;
  }

  // Mark as past due
  await supabase
    .from("tenant_billing")
    .update({ status: "PAST_DUE" } as Record<string, unknown>)
    .eq("id", billing.id);

  logStep("Invoice payment failed, marked as past due", { tenantId: billing.tenant_id });
}
