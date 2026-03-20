/**
 * ============================================================================
 * 🏢 tenant-customer-portal — Stripe Billing Portal Access
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * -------------------
 * This function creates a Stripe Customer Portal session for authorized
 * tenant administrators to manage their billing and subscription.
 * 
 * THIS IS A SELF-SERVICE TOOL, NOT A BILLING DECISION MAKER.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller has appropriate role for the tenant
 * - Fetches tenant's stripe_customer_id from tenant_billing
 * - Creates a Stripe Billing Portal session
 * - Returns the portal URL for redirect
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT modify subscription directly
 * - Does NOT process payments
 * - Does NOT update billing records in our database
 * - Does NOT handle webhook events
 * - Does NOT decide billing status
 * - Does NOT cancel or upgrade plans
 * 
 * SECURITY BOUNDARY:
 * - Only ADMIN_TENANT, STAFF_ORGANIZACAO, or SUPERADMIN_GLOBAL can access
 * - Stripe customer must exist for tenant
 * - Portal actions are handled by Stripe, not by us
 * 
 * A02: Institutional envelope + structured logger + correlationId
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import {
  SecureRateLimitPresets,
  buildRateLimitContext,
} from "../_shared/secure-rate-limiter.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  okResponse,
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
  unauthorizedResponse,
  forbiddenResponse,
} from "../_shared/errors/envelope.ts";

// ============================================================================
// CORS HEADERS
// ============================================================================


// ============================================================================
// ENTRYPOINT
// ============================================================================

serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("tenant-customer-portal", correlationId);

  try {
    log.setStep("init");

    // ========================================================================
    // STEP 1: Environment Validation
    // SECURITY BOUNDARY: Function cannot operate without Stripe key
    // ========================================================================
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log.error("STRIPE_SECRET_KEY is not set");
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.config_missing", false, ["STRIPE_SECRET_KEY"], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // STEP 2: Supabase Client Initialization
    // ========================================================================
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.config_missing", false, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"], correlationId),
        dynamicCors,
      );
    }
    // PI-AUTH-CLIENT-SPLIT-001: supabaseClient for DB ops, supabaseAuth for JWT validation
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // ========================================================================
    // STEP 3: Authorization Validation
    // ========================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log.warn("Missing authorization header");
      return unauthorizedResponse(dynamicCors, "auth.missing_header", undefined, correlationId);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError) {
      log.warn("Authentication error", { error: userError.message });
      return unauthorizedResponse(dynamicCors, "auth.invalid_token", undefined, correlationId);
    }
    const user = userData.user;
    if (!user?.id) {
      log.warn("User not authenticated");
      return unauthorizedResponse(dynamicCors, "auth.invalid_token", undefined, correlationId);
    }

    log.setUser(user.id);
    log.setStep("auth_ok");

    // ========================================================================
    // STEP 4: Rate Limiting
    // ========================================================================
    const rateLimiter = SecureRateLimitPresets.tenantCustomerPortal();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseClient);

    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded");
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, dynamicCors, correlationId);
    }

    // ========================================================================
    // STEP 5: Request Body Validation
    // ========================================================================
    const { tenant_id: tenantId } = await req.json();
    if (!tenantId) {
      log.warn("Missing tenant_id");
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.tenant_id_required", false, undefined, correlationId),
        dynamicCors,
      );
    }

    log.setTenant(tenantId);
    log.setStep("role_check");

    // ========================================================================
    // STEP 6: Role Authorization Check
    // SECURITY BOUNDARY: Only specific roles can access billing portal
    // BY DESIGN: ADMIN_TENANT, STAFF_ORGANIZACAO, or SUPERADMIN_GLOBAL
    // ========================================================================
    const { data: tenantRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .in('role', ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']);

    // Also check for global superadmin (tenant_id IS NULL)
    const { data: globalRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .is('tenant_id', null);

    const isAuthorized = (tenantRoles && tenantRoles.length > 0) || (globalRoles && globalRoles.length > 0);
    if (!isAuthorized) {
      log.warn("User not authorized for billing portal");
      return forbiddenResponse(dynamicCors, "auth.billing_access_denied", undefined, correlationId);
    }

    log.setStep("fetch_stripe");

    // ========================================================================
    // STEP 7: Fetch Stripe Customer ID
    // DOES NOT modify billing records
    // ========================================================================
    const { data: billingData, error: billingError } = await supabaseClient
      .from('tenant_billing')
      .select('stripe_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (billingError) {
      log.error("Failed to fetch billing data", billingError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "billing.fetch_failed", true, undefined, correlationId),
        dynamicCors,
      );
    }
    
    if (!billingData?.stripe_customer_id) {
      log.warn("No Stripe customer for tenant", { tenantId });
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "billing.no_stripe_customer", false, undefined, correlationId),
        dynamicCors,
      );
    }

    log.setStep("create_portal");

    // ========================================================================
    // STEP 8: Create Stripe Portal Session
    // INTENTIONAL: We only create the session, Stripe handles the rest
    // DOES NOT modify subscription or billing in our database
    // ========================================================================
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://tatame-pro.lovable.app";
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billingData.stripe_customer_id,
      return_url: `${origin}/`,
    });

    log.info("Customer portal session created", { sessionId: portalSession.id });

    // ========================================================================
    // STEP 9: Success Response
    // Returns URL only; customer interacts with Stripe, not us
    // ========================================================================
    return okResponse({ url: portalSession.url }, dynamicCors, correlationId);
  } catch (err) {
    log.error("Unhandled exception", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});
