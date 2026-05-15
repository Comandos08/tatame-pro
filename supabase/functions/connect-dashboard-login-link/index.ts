/**
 * connect-dashboard-login-link — One-time Stripe Express dashboard link.
 *
 * Lets a Tenant admin open their Stripe Express dashboard to view payouts,
 * balances and transaction history. The link is single-use and short-lived
 * (Stripe-enforced); we never store it.
 *
 * SECURITY: tenant-scoped (ADMIN_TENANT / SUPERADMIN_GLOBAL). Requires the
 * tenant to have completed onboarding (details_submitted) — Stripe rejects
 * login links for accounts that haven't finished onboarding.
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

interface LoginLinkRequest {
  tenantId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);
  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("connect-dashboard-login-link", correlationId);

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
    const body: LoginLinkRequest = await req.json().catch(() => ({} as LoginLinkRequest));
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
      .select("id, stripe_connect_account_id, stripe_connect_details_submitted")
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
    if (!accountId || tenant.stripe_connect_details_submitted !== true) {
      return errorResponse(
        409,
        buildErrorEnvelope(
          ERROR_CODES.CONFLICT,
          "connect.onboarding_incomplete",
          false,
          ["tenant must finish Stripe onboarding before opening the dashboard"],
          correlationId,
        ),
        dynamicCors,
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const loginLink = await stripe.accounts.createLoginLink(accountId);

    log.info("Dashboard login link created", { tenantId, accountId });

    return okResponse({ url: loginLink.url }, dynamicCors, correlationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("connect-dashboard-login-link failed", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [message], correlationId),
      dynamicCors,
    );
  }
});
