/**
 * stripe-connect-webhook — Connect (Express) account & payout events.
 *
 * SECOND, SEPARATE webhook endpoint from stripe-webhook. Stripe delivers
 * "Connected accounts" events here with `event.account` set to the connected
 * account id (acct_...). This endpoint owns the marketplace side:
 *
 *   - account.updated                  → sync charges/payouts/details_submitted
 *   - account.application.deauthorized → tenant disconnected; flag not-ready
 *   - payout.paid                      → payout reached the tenant bank (audit)
 *   - payout.failed                    → CRITICAL: money did NOT reach the bank
 *   - charge.refunded                  → refund trail on a connected account
 *
 * Contract:
 *   - 400 only for missing config / missing-or-bad signature
 *   - 200 for everything else (incl. our own processing errors) so Stripe
 *     does not retry forever on a bug our side — failures are surfaced via
 *     structured logs + institutional_events instead.
 *   - Idempotent via the shared webhook_events table (event_id is globally
 *     unique across platform + connect events).
 *
 * Signing secret: STRIPE_CONNECT_WEBHOOK_SECRET (distinct from the platform
 * endpoint's STRIPE_WEBHOOK_SECRET).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = any;

async function resolveTenantByAccount(
  supabase: SupabaseClientAny,
  accountId: string | null,
): Promise<{ id: string; slug: string } | null> {
  if (!accountId) return null;
  const { data } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("stripe_connect_account_id", accountId)
    .maybeSingle();
  return data ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);
  const preCorrelationId = extractCorrelationId(req);
  let log = createBackendLogger("stripe-connect-webhook", preCorrelationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const connectWebhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey || !connectWebhookSecret) {
      log.error("Missing configuration for connect webhook");
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, ["connect webhook not configured"], preCorrelationId),
        dynamicCors,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      log.warn("Missing Stripe signature header");
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.missing_signature", false, ["missing stripe-signature header"], preCorrelationId),
        dynamicCors,
      );
    }

    let event: Stripe.Event;
    try {
      // Matches the proven sync pattern in stripe-webhook (Supabase Edge
      // Runtime). Keep both endpoints on the same verification call.
      event = stripe.webhooks.constructEvent(body, signature, connectWebhookSecret);
    } catch (err) {
      log.error("Connect webhook signature verification failed", err);
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_signature", false, ["webhook signature verification failed"], preCorrelationId),
        dynamicCors,
      );
    }

    const correlationId = event.id;
    log = createBackendLogger("stripe-connect-webhook", correlationId);
    const connectedAccountId = (event.account as string | undefined) ?? null;
    log.info("Connect event received", {
      type: event.type,
      eventId: event.id,
      account: connectedAccountId,
    });

    // Idempotency — shared webhook_events table (event_id globally unique).
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();
    if (existing) {
      log.info("Connect event already processed, skipping", { eventId: event.id });
      return okResponse({ received: true, duplicate: true }, dynamicCors, correlationId);
    }

    let status = "processed";
    let errorMessage: string | null = null;

    try {
      const tenant = await resolveTenantByAccount(supabase, connectedAccountId);

      switch (event.type) {
        case "account.updated": {
          const account = event.data.object as Stripe.Account;
          if (!tenant) {
            log.warn("account.updated for unknown connected account", { account: connectedAccountId });
            break;
          }
          const chargesEnabled = account.charges_enabled === true;
          const payoutsEnabled = account.payouts_enabled === true;
          const detailsSubmitted = account.details_submitted === true;

          const { error: updErr } = await supabase
            .from("tenants")
            .update({
              stripe_connect_charges_enabled: chargesEnabled,
              stripe_connect_payouts_enabled: payoutsEnabled,
              stripe_connect_details_submitted: detailsSubmitted,
              stripe_connect_updated_at: new Date().toISOString(),
            })
            .eq("id", tenant.id);
          if (updErr) throw new Error(`tenants update failed: ${updErr.message}`);

          await createAuditLog(supabase, {
            event_type: "STRIPE_CONNECT_ACCOUNT_UPDATED",
            tenant_id: tenant.id,
            metadata: {
              stripe_account_id: connectedAccountId,
              charges_enabled: chargesEnabled,
              payouts_enabled: payoutsEnabled,
              details_submitted: detailsSubmitted,
              source: "stripe-connect-webhook",
            },
          });
          log.info("Synced account.updated", {
            tenantId: tenant.id,
            chargesEnabled,
            payoutsEnabled,
            detailsSubmitted,
          });
          break;
        }

        case "account.application.deauthorized": {
          // Tenant disconnected the platform. They can no longer receive
          // destination charges — flag not-ready so checkouts fall back and
          // ops/the tenant are alerted to reconnect.
          if (!tenant) {
            log.warn("deauthorized for unknown connected account", { account: connectedAccountId });
            break;
          }
          await supabase
            .from("tenants")
            .update({
              stripe_connect_charges_enabled: false,
              stripe_connect_payouts_enabled: false,
              stripe_connect_updated_at: new Date().toISOString(),
            })
            .eq("id", tenant.id);

          await supabase.from("institutional_events").insert({
            event_type: "BILLING_CONNECT_DEAUTHORIZED",
            severity: "CRITICAL",
            source: "stripe-connect-webhook",
            tenant_id: tenant.id,
            metadata: { stripe_account_id: connectedAccountId },
          }).then(undefined, () => {});

          await createAuditLog(supabase, {
            event_type: "STRIPE_CONNECT_DEAUTHORIZED",
            tenant_id: tenant.id,
            metadata: { stripe_account_id: connectedAccountId, source: "stripe-connect-webhook" },
          });
          log.warn("Connect account deauthorized", { tenantId: tenant.id });
          break;
        }

        case "payout.paid": {
          const payout = event.data.object as Stripe.Payout;
          await createAuditLog(supabase, {
            event_type: "STRIPE_CONNECT_PAYOUT_PAID",
            tenant_id: tenant?.id ?? null,
            metadata: {
              stripe_account_id: connectedAccountId,
              payout_id: payout.id,
              amount: payout.amount,
              currency: payout.currency,
              arrival_date: payout.arrival_date,
              source: "stripe-connect-webhook",
            },
          });
          log.info("Payout paid", { tenantId: tenant?.id, payoutId: payout.id, amount: payout.amount });
          break;
        }

        case "payout.failed": {
          const payout = event.data.object as Stripe.Payout;
          // Money did NOT reach the tenant's bank — on-call + tenant must know.
          await supabase.from("institutional_events").insert({
            event_type: "BILLING_CONNECT_PAYOUT_FAILED",
            severity: "CRITICAL",
            source: "stripe-connect-webhook",
            tenant_id: tenant?.id ?? null,
            metadata: {
              stripe_account_id: connectedAccountId,
              payout_id: payout.id,
              amount: payout.amount,
              currency: payout.currency,
              failure_code: payout.failure_code,
              failure_message: payout.failure_message,
            },
          }).then(undefined, () => {});

          await createAuditLog(supabase, {
            event_type: "STRIPE_CONNECT_PAYOUT_FAILED",
            tenant_id: tenant?.id ?? null,
            metadata: {
              stripe_account_id: connectedAccountId,
              payout_id: payout.id,
              amount: payout.amount,
              failure_code: payout.failure_code,
              source: "stripe-connect-webhook",
            },
          });
          log.error("Payout FAILED", undefined, {
            tenantId: tenant?.id,
            payoutId: payout.id,
            failureCode: payout.failure_code,
          });
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          const md = (charge.metadata ?? {}) as Record<string, string>;
          await createAuditLog(supabase, {
            event_type: "STRIPE_CONNECT_CHARGE_REFUNDED",
            tenant_id: tenant?.id ?? md.tenant_id ?? null,
            metadata: {
              stripe_account_id: connectedAccountId,
              charge_id: charge.id,
              amount_refunded: charge.amount_refunded,
              currency: charge.currency,
              membership_id: md.membership_id ?? null,
              registration_id: md.registration_id ?? null,
              source: "stripe-connect-webhook",
            },
          });
          log.info("Charge refunded on connected account", {
            tenantId: tenant?.id,
            chargeId: charge.id,
            amountRefunded: charge.amount_refunded,
          });
          break;
        }

        default:
          log.info("Unhandled connect event type", { type: event.type });
          status = "ignored";
      }
    } catch (procErr) {
      status = "error";
      errorMessage = procErr instanceof Error ? procErr.message : String(procErr);
      log.error("Connect event processing failed", procErr);
      // Fire-and-forget alert; never block the 200 to Stripe.
      await supabase.from("institutional_events").insert({
        event_type: "BILLING_CONNECT_WEBHOOK_PROCESSING_ERROR",
        severity: "CRITICAL",
        source: "stripe-connect-webhook",
        metadata: { event_id: event.id, event_type: event.type, error_message: errorMessage },
      }).then(undefined, () => {});
    }

    await supabase.from("webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event.data.object as Record<string, unknown>,
      status,
      error_message: errorMessage,
    }).then(undefined, () => { /* best-effort audit row */ });

    return okResponse({ received: true }, dynamicCors, correlationId);
  } catch (error) {
    // Outer catch: still 200 so Stripe doesn't infinite-retry on our bug.
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled connect webhook exception", error);
    return okResponse({ received: true, error: message }, dynamicCors, preCorrelationId);
  }
});
