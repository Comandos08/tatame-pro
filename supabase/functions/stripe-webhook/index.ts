// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

type SupabaseClientAny = SupabaseClient<any, any, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
};

// Helper function for retrying async operations with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config = RETRY_CONFIG
): Promise<{ success: boolean; result?: T; error?: string; attempts: number }> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      logStep(`${operationName} succeeded`, { attempt });
      return { success: true, result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logStep(`${operationName} failed (attempt ${attempt}/${config.maxAttempts})`, { 
        error: lastError.message,
        attempt 
      });
      
      if (attempt < config.maxAttempts) {
        // Exponential backoff with jitter
        const delay = Math.min(
          config.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
          config.maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  logStep(`${operationName} exhausted all retries`, { 
    error: lastError?.message,
    maxAttempts: config.maxAttempts 
  });
  
  return { 
    success: false, 
    error: lastError?.message || "Unknown error", 
    attempts: config.maxAttempts 
  };
}

// Helper to call edge function with retry
async function callEdgeFunctionWithRetry(
  supabaseUrl: string,
  supabaseServiceKey: string,
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  
  const result = await withRetry(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return response.json();
    },
    `Edge function ${functionName}`
  );
  
  return { success: result.success, error: result.error };
}

async function sendBillingEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  eventType: string,
  tenantId: string,
  data?: Record<string, unknown>
) {
  const result = await callEdgeFunctionWithRetry(
    supabaseUrl,
    supabaseServiceKey,
    "send-billing-email",
    { event_type: eventType, tenant_id: tenantId, data }
  );
  
  if (!result.success) {
    logStep("Failed to send billing email after retries", { eventType, tenantId, error: result.error });
  }
}

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
          await handleSubscriptionChange(supabase, supabaseUrl, supabaseServiceKey, subscription);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(supabase, supabaseUrl, supabaseServiceKey, subscription);
          break;
        }
        // Invoice events
        case "invoice.created":
        case "invoice.finalized":
        case "invoice.updated": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoiceUpdate(supabase, invoice);
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentSucceeded(supabase, supabaseUrl, supabaseServiceKey, invoice);
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentFailed(supabase, supabaseUrl, supabaseServiceKey, invoice);
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

  // Get tenant_id and athlete_id for audit log
  const { data: membershipDetails } = await supabase
    .from("memberships")
    .select("tenant_id, athlete_id, applicant_profile_id")
    .eq("id", membershipId)
    .single();

  // Log payment success to audit (SEMPRE, independente de athlete_id)
  if (membershipDetails) {
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.MEMBERSHIP_PAID,
      tenant_id: membershipDetails.tenant_id,
      metadata: {
        membership_id: membershipId,
        athlete_id: membershipDetails.athlete_id,
        applicant_profile_id: membershipDetails.applicant_profile_id,
        amount_cents: session.amount_total,
        currency: session.currency?.toUpperCase() || 'BRL',
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent as string,
        automatic: false,
        source: 'stripe_webhook',
      }
    });
  }

  // SÓ gerar card e enviar email se athlete existir
  if (membershipDetails?.athlete_id) {
    // Trigger digital card generation with retry
    const cardResult = await callEdgeFunctionWithRetry(
      supabaseUrl,
      supabaseServiceKey,
      "generate-digital-card",
      { membershipId }
    );
    
    if (!cardResult.success) {
      logStep("Digital card generation failed after retries", { 
        membershipId,
        error: cardResult.error 
      });
      
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.MEMBERSHIP_UPDATED,
        tenant_id: membershipDetails?.tenant_id,
        metadata: {
          membership_id: membershipId,
          action: 'card_generation_failed',
          error: cardResult.error,
          will_retry_on_approval: true,
          source: 'stripe_webhook',
        }
      });
    }

    // Send notification email
    const emailResult = await callEdgeFunctionWithRetry(
      supabaseUrl,
      supabaseServiceKey,
      "send-athlete-email",
      { 
        email_type: "NEW_MEMBERSHIP_PENDING",
        membership_id: membershipId,
      }
    );
    
    if (!emailResult.success) {
      logStep("Failed to send pending membership email after retries", { 
        membershipId,
        error: emailResult.error 
      });
    }
  } else {
    logStep("Skipping card generation and email - no athlete yet (pending approval)", { membershipId });
  }
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
  supabaseUrl: string,
  supabaseServiceKey: string,
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

  // Check previous status for email triggers
  const { data: existingBilling } = await supabase
    .from("tenant_billing")
    .select("id, status")
    .eq("tenant_id", actualTenantId)
    .maybeSingle();

  const previousStatus = existingBilling?.status;

  // Upsert billing record
  const planType = subscription.metadata?.plan_type || 'annual';
  const planName = planType === 'monthly' ? 'Plano Federação Mensal' : 'Plano Federação Anual';
  
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

  if (existingBilling) {
    await supabase
      .from("tenant_billing")
      .update(billingData as Record<string, unknown>)
      .eq("id", existingBilling.id);
  } else {
    // Get price ID from subscription items
    const priceId = subscription.items.data[0]?.price?.id || '';
    await supabase.from("tenant_billing").insert({
      ...billingData,
      plan_name: planName,
      plan_price_id: priceId,
    } as Record<string, unknown>);
  }

  // Update tenant isActive
  const isActive = billingStatus === "ACTIVE" || billingStatus === "TRIALING";
  await supabase
    .from("tenants")
    .update({ is_active: isActive } as Record<string, unknown>)
    .eq("id", actualTenantId);

  logStep("Subscription updated", { tenantId: actualTenantId, status: billingStatus, isActive });

  // Send emails based on status transitions
  if (previousStatus && previousStatus !== billingStatus) {
    if (billingStatus === "PAST_DUE" && previousStatus === "ACTIVE") {
      // Payment issue - warn about potential blocking
      sendBillingEmail(supabaseUrl, supabaseServiceKey, "TENANT_WILL_BE_BLOCKED", actualTenantId);
    } else if (!isActive && (previousStatus === "ACTIVE" || previousStatus === "TRIALING")) {
      // Tenant is being blocked
      sendBillingEmail(supabaseUrl, supabaseServiceKey, "TENANT_BLOCKED", actualTenantId);
    }
  }
}

async function handleSubscriptionDeleted(
  supabase: SupabaseClientAny,
  supabaseUrl: string,
  supabaseServiceKey: string,
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

  // Log to audit
  await createAuditLog(supabase, {
    event_type: AUDIT_EVENTS.TENANT_SUBSCRIPTION_CANCELLED,
    tenant_id: billing.tenant_id,
    metadata: {
      stripe_subscription_id: subscription.id,
      reason: 'subscription_deleted',
      automatic: true,
      source: 'stripe_webhook',
    }
  });

  // Send blocked email
  sendBillingEmail(supabaseUrl, supabaseServiceKey, "TENANT_BLOCKED", billing.tenant_id);
}

// Helper to find tenant ID from invoice
async function getTenantIdFromInvoice(
  supabase: SupabaseClientAny,
  invoice: Stripe.Invoice
): Promise<string | null> {
  if (!invoice.subscription) return null;

  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("tenant_id")
    .eq("stripe_subscription_id", invoice.subscription as string)
    .maybeSingle();

  return billing?.tenant_id || null;
}

// Handle invoice create/update for history
async function handleInvoiceUpdate(
  supabase: SupabaseClientAny,
  invoice: Stripe.Invoice
) {
  logStep("Processing invoice update", { invoiceId: invoice.id, status: invoice.status });

  // Only handle subscription invoices
  if (!invoice.subscription) {
    logStep("Not a subscription invoice, skipping");
    return;
  }

  const tenantId = await getTenantIdFromInvoice(supabase, invoice);
  if (!tenantId) {
    logStep("No tenant found for invoice");
    return;
  }

  const invoiceData = {
    tenant_id: tenantId,
    stripe_invoice_id: invoice.id,
    stripe_customer_id: invoice.customer as string,
    amount_cents: invoice.amount_due || 0,
    currency: invoice.currency || "brl",
    status: invoice.status || "draft",
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    paid_at: invoice.status === "paid" && invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : null,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    invoice_pdf: invoice.invoice_pdf || null,
    description: invoice.description || `Fatura ${invoice.number || invoice.id}`,
  };

  // Upsert invoice record
  const { data: existing } = await supabase
    .from("tenant_invoices")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("tenant_invoices")
      .update(invoiceData as Record<string, unknown>)
      .eq("id", existing.id);
  } else {
    await supabase.from("tenant_invoices").insert(invoiceData as Record<string, unknown>);
  }

  logStep("Invoice record saved", { invoiceId: invoice.id, tenantId });
}

async function handleInvoicePaymentSucceeded(
  supabase: SupabaseClientAny,
  supabaseUrl: string,
  supabaseServiceKey: string,
  invoice: Stripe.Invoice
) {
  logStep("Processing invoice.payment_succeeded", { invoiceId: invoice.id });

  // Update invoice record
  await handleInvoiceUpdate(supabase, invoice);

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

  // Send payment success email
  sendBillingEmail(supabaseUrl, supabaseServiceKey, "INVOICE_PAYMENT_SUCCEEDED", billing.tenant_id, {
    invoice_amount: invoice.amount_paid || 0,
    invoice_currency: invoice.currency || "brl",
    invoice_url: invoice.hosted_invoice_url || undefined,
    period_end: invoice.lines?.data?.[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : undefined,
  });
}

async function handleInvoicePaymentFailed(
  supabase: SupabaseClientAny,
  supabaseUrl: string,
  supabaseServiceKey: string,
  invoice: Stripe.Invoice
) {
  logStep("Processing invoice.payment_failed", { invoiceId: invoice.id });

  // Update invoice record
  await handleInvoiceUpdate(supabase, invoice);

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

  // Log payment failure to audit for tracking policy (2-3 failures in 7 days = PAST_DUE maintained)
  // This event is used by PlatformHealthCard to show billing errors count
  await createAuditLog(supabase, {
    event_type: AUDIT_EVENTS.TENANT_PAYMENT_FAILED,
    tenant_id: billing.tenant_id,
    metadata: {
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_due || 0,
      currency: invoice.currency || "brl",
      attempt_count: invoice.attempt_count || 1,
      next_attempt: invoice.next_payment_attempt 
        ? new Date(invoice.next_payment_attempt * 1000).toISOString() 
        : null,
      // Policy note: 2-3 failures in 7 days maintains PAST_DUE status
      // Stripe's dunning handles retry logic, we just track and block new memberships
      automatic: true,
      source: 'stripe_webhook',
    }
  });

  // Send payment failed email
  sendBillingEmail(supabaseUrl, supabaseServiceKey, "PAYMENT_FAILED", billing.tenant_id);
}
