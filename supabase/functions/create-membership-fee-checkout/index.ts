/**
 * ============================================================================
 * 💳 create-membership-fee-checkout — Membership Fee Stripe Checkout
 * ============================================================================
 *
 * SAFE GOLD / GOV COMPLIANCE:
 * ---------------------------
 * 1. NO direct mutation of memberships.payment_status (gatekeeper only)
 * 2. Idempotency: reuses existing unpaid membership_fees record
 * 3. Tenant boundary: validates membership.tenant_id against auth context
 * 4. CorrelationId via extractCorrelationId(req)
 * 5. A07 envelope: okResponse / errorResponse only
 * 6. URL allowlist: success_url / cancel_url validated against origin
 * 7. No hardcoded fallback: fee_amount_cents must be set on membership
 *
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { requireBillingStatus, billingRestrictedResponse } from "../_shared/requireBillingStatus.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import {
  okResponse,
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";

// ============================================================================
// CORS
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

// ============================================================================
// URL ALLOWLIST
// ============================================================================

const ALLOWED_URL_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app\//,
  /^https:\/\/tatame-pro\.lovable\.app\//,
  /^https:\/\/[a-z0-9-]+-preview--[a-z0-9-]+\.lovable\.app\//,
  /^http:\/\/localhost(:\d+)?\//,
];

function isAllowedUrl(url: string): boolean {
  return ALLOWED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

// ============================================================================
// TYPES
// ============================================================================

interface CreateFeeCheckoutRequest {
  membership_id: string;
  tenant_id: string;
  success_url: string;
  cancel_url: string;
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("create-membership-fee-checkout", correlationId);

  try {
    // ========================================================================
    // STEP 1: Environment
    // ========================================================================
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.config_missing", false, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"], correlationId),
        corsHeaders,
      );
    }
    if (!stripeSecretKey) {
      log.error("Stripe secret key not configured");
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.config_missing", false, ["STRIPE_SECRET_KEY"], correlationId),
        corsHeaders,
      );
    }

    // PI-AUTH-CLIENT-SPLIT-001: supabase for DB ops, supabaseAuth for JWT validation
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // ========================================================================
    // STEP 2: Parse & validate payload
    // ========================================================================
    const payload: CreateFeeCheckoutRequest = await req.json();

    if (!payload.membership_id || !payload.tenant_id || !payload.success_url || !payload.cancel_url) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.missing_fields", false, ["membership_id, tenant_id, success_url, cancel_url required"], correlationId),
        corsHeaders,
      );
    }

    // (6) URL allowlist
    if (!isAllowedUrl(payload.success_url) || !isAllowedUrl(payload.cancel_url)) {
      log.warn("URL not in allowlist", { success_url: payload.success_url, cancel_url: payload.cancel_url });
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.url_not_allowed", false, ["success_url or cancel_url not in allowlist"], correlationId),
        corsHeaders,
      );
    }

    // ========================================================================
    // STEP 3: Auth — explicit user resolution + tenant boundary + role check
    // ========================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.missing_header", false, ["Missing authorization header"], correlationId),
        corsHeaders,
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.invalid_token", false, ["Invalid authentication"], correlationId),
        corsHeaders,
      );
    }

    // A04 — Tenant Boundary Check (Zero-Trust)
    try {
      await assertTenantAccess(supabase, user.id, payload.tenant_id);
      log.info("Tenant boundary check passed");
    } catch (boundaryError) {
      if (boundaryError instanceof TenantBoundaryError) {
        log.warn("Tenant boundary violation", { code: boundaryError.code });
        return errorResponse(
          403,
          buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.tenant_boundary_violation", false, [boundaryError.code], correlationId),
          corsHeaders,
        );
      }
      throw boundaryError;
    }

    const authResult = await requireTenantRole(
      supabase,
      authHeader,
      payload.tenant_id,
      ["ADMIN_TENANT", "ATLETA"],
    );

    if (!authResult.allowed) {
      log.warn("Auth denied", { error: authResult.error });
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, [authResult.error || "Access denied"], correlationId),
        corsHeaders,
      );
    }

    log.setUser(authResult.userId);
    log.setTenant(payload.tenant_id);

    // P1-01 — Billing status check
    const billingCheck = await requireBillingStatus(supabase, payload.tenant_id);
    if (!billingCheck.allowed) {
      log.warn("Billing status blocked operation", { status: billingCheck.status });
      return billingRestrictedResponse(billingCheck.status);
    }

    // ========================================================================
    // STEP 4: Fetch membership & validate tenant boundary
    // ========================================================================
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("id, tenant_id, fee_amount_cents, payment_status, athlete_id, applicant_data")
      .eq("id", payload.membership_id)
      .maybeSingle();

    if (membershipError || !membership) {
      log.error("Membership not found", membershipError, { membership_id: payload.membership_id });
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "membership.not_found", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // (3) Tenant boundary enforcement
    if (membership.tenant_id !== payload.tenant_id) {
      log.warn("Tenant boundary violation", {
        membership_tenant: membership.tenant_id,
        payload_tenant: payload.tenant_id,
      });
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.tenant_boundary_violation", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // (1) Validate payment_status — already paid = reject
    if (membership.payment_status === "PAID") {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "membership.fee_already_paid", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // (7) No hardcoded fallback: fee_amount_cents MUST be set
    if (!membership.fee_amount_cents || membership.fee_amount_cents <= 0) {
      log.error("fee_amount_cents not set on membership", undefined, { membership_id: membership.id });
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "membership.fee_amount_missing", false, ["fee_amount_cents must be a positive integer"], correlationId),
        corsHeaders,
      );
    }

    // ========================================================================
    // STEP 5: Idempotency — check for existing unpaid fee record
    // ========================================================================
    const { data: existingFee } = await supabase
      .from("membership_fees")
      .select("id, stripe_checkout_session_id, paid_at")
      .eq("membership_id", membership.id)
      .maybeSingle();

    // If there's an existing UNPAID fee with a checkout session, reuse it
    if (existingFee && !existingFee.paid_at && existingFee.stripe_checkout_session_id) {
      log.info("Reusing existing checkout session (idempotent)", {
        fee_id: existingFee.id,
        session_id: existingFee.stripe_checkout_session_id,
      });

      // Retrieve existing session to get current URL
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(existingFee.stripe_checkout_session_id);
        if (existingSession.status === "open" && existingSession.url) {
          return okResponse(
            {
              checkout_url: existingSession.url,
              session_id: existingFee.stripe_checkout_session_id,
              idempotent: true,
            },
            corsHeaders,
            correlationId,
          );
        }
        // Session expired/completed — fall through to create new one
        log.info("Existing session no longer open, creating new", { status: existingSession.status });
      } catch {
        log.warn("Could not retrieve existing Stripe session, creating new");
      }
    }

    // If existing fee is already paid, reject
    if (existingFee?.paid_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "membership.fee_already_paid", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // ========================================================================
    // STEP 6: Resolve athlete info from applicant_data
    // ========================================================================
    // deno-lint-ignore no-explicit-any
    const applicantData = membership.applicant_data as any;
    const athleteEmail: string = applicantData?.email || "";
    const athleteName: string = applicantData?.full_name || "Atleta";

    // ========================================================================
    // STEP 7: Create Stripe Checkout Session
    // ========================================================================
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: "Taxa de Filiação",
              description: `Filiação de ${athleteName}`,
            },
            unit_amount: membership.fee_amount_cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        membership_id: membership.id,
        tenant_id: membership.tenant_id,
        type: "membership_fee",
        correlation_id: correlationId,
      },
      ...(athleteEmail ? { customer_email: athleteEmail } : {}),
      success_url: payload.success_url,
      cancel_url: payload.cancel_url,
    });

    // ========================================================================
    // STEP 8: Upsert membership_fees (idempotent)
    // ========================================================================
    const { error: upsertError } = await supabase
      .from("membership_fees")
      .upsert(
        {
          membership_id: membership.id,
          tenant_id: membership.tenant_id,
          amount_cents: membership.fee_amount_cents,
          stripe_checkout_session_id: session.id,
        },
        { onConflict: "membership_id", ignoreDuplicates: false },
      );

    if (upsertError) {
      log.error("Failed to upsert membership_fees", upsertError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.db_write_failed", true, undefined, correlationId),
        corsHeaders,
      );
    }

    // (1) NO direct update to memberships.payment_status — delegated to webhook
    // Only store the checkout session reference on the membership (non-lifecycle column)
    const { error: updateError } = await supabase
      .from("memberships")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", membership.id);

    if (updateError) {
      log.warn("Failed to update stripe_checkout_session_id on membership", updateError);
      // Non-blocking: session was already created
    }

    // ========================================================================
    // STEP 9: Success
    // ========================================================================
    log.info("Checkout session created", {
      membership_id: membership.id,
      session_id: session.id,
    });

    return okResponse(
      {
        checkout_url: session.url,
        session_id: session.id,
      },
      corsHeaders,
      correlationId,
    );
  } catch (err) {
    log.error("Unhandled error", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      corsHeaders,
    );
  }
});
