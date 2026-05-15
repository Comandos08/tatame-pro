/**
 * connect-account-refresh — Sync a Tenant's Stripe Connect status.
 *
 * Called by the frontend after the admin returns from Stripe-hosted
 * onboarding (and on-demand from the settings page). Pulls the live account
 * state from Stripe and mirrors charges/payouts/details into the tenants row
 * so the rest of the system (checkout gating, UI) can rely on the DB.
 *
 * The same sync happens asynchronously via the `account.updated` Connect
 * webhook; this endpoint is the synchronous path for immediate UI feedback.
 *
 * SECURITY: tenant-scoped (ADMIN_TENANT / SUPERADMIN_GLOBAL).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";

interface RefreshRequest {
  tenantId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);
  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("connect-account-refresh", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    const body: RefreshRequest = await req.json().catch(() => ({} as RefreshRequest));
    const { tenantId } = body;

    if (!tenantId) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["tenantId is required"], correlationId),
        dynamicCors,
      );
    }

    const roleCheck = await requireTenantRole(supabase, authHeader, tenantId, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) {
      return errorResponse(
        roleCheck.userId ? 403 : 401,
        buildErrorEnvelope(
          roleCheck.userId ? ERROR_CODES.FORBIDDEN : ERROR_CODES.UNAUTHORIZED,
          roleCheck.userId ? "auth.forbidden" : "auth.invalid_token",
          false,
          roleCheck.error ? [roleCheck.error] : undefined,
          correlationId,
        ),
        dynamicCors,
      );
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, stripe_connect_account_id, platform_fee_bps")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["tenant"], correlationId),
        dynamicCors,
      );
    }

    const accountId = tenant.stripe_connect_account_id as string | null;
    if (!accountId) {
      // Not onboarded yet — return a deterministic "not connected" snapshot
      // instead of an error so the UI can render the connect CTA.
      return okResponse(
        {
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          platformFeeBps: tenant.platform_fee_bps ?? 500,
        },
        dynamicCors,
        correlationId,
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const account = await stripe.accounts.retrieve(accountId);

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
      .eq("id", tenantId);

    if (updErr) {
      log.error("Failed to persist connect status", updErr);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", true, ["failed to persist connect status"], correlationId),
        dynamicCors,
      );
    }

    log.info("Connect status synced", { tenantId, chargesEnabled, payoutsEnabled, detailsSubmitted });

    return okResponse(
      {
        connected: true,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        platformFeeBps: tenant.platform_fee_bps ?? 500,
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("connect-account-refresh failed", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [message], correlationId),
      dynamicCors,
    );
  }
});
