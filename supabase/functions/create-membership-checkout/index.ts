/**
 * 🔐 Create Membership Checkout Edge Function
 * 
 * Public endpoint for Stripe checkout with:
 * - Rate limiting (10/hour per IP, 3/10min per membership)
 * - Mandatory decision logging for all rate limit blocks
 * - Fail-closed behavior (if logging fails, operation fails)
 * - CAPTCHA validation (Cloudflare Turnstile)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logDecision, DECISION_TYPES } from "../_shared/decision-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { getTenantConnectInfo, buildDestinationChargeParams } from "../_shared/connect.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


const OPERATION_NAME = "create-membership-checkout";

// ============================================
// RATE LIMITING CONFIGURATION
// - 10 checkout attempts per hour per IP
// - 3 checkout attempts per 10 minutes per membership
// ============================================
interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  count: number;
  limit: number;
  windowSeconds: number;
}

async function checkRateLimit(
  identifier: string,
  prefix: string,
  limit: number,
  windowSeconds: number,
  log: ReturnType<typeof createBackendLogger>
): Promise<RateLimitResult> {
  const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  // FAIL-CLOSED: If Redis is not configured, block request
  if (!redisUrl || !redisToken) {
    log.info("Rate limiting not configured - BLOCKING request (fail-closed)");
    return { 
      success: false, 
      remaining: 0, 
      reset: Date.now() + windowSeconds * 1000, 
      count: -1,
      limit,
      windowSeconds,
    };
  }

  const key = `ratelimit:${prefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    const pipeline = [
      ["ZREMRANGEBYSCORE", key, "0", windowStart.toString()],
      ["ZADD", key, now.toString(), `${now}-${Math.random()}`],
      ["ZCARD", key],
      ["PEXPIRE", key, (windowSeconds * 1000).toString()],
    ];

    const response = await fetch(`${redisUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!response.ok) {
      log.info("Redis error - BLOCKING request (fail-closed)");
      return { 
        success: false, 
        remaining: 0, 
        reset: now + windowSeconds * 1000, 
        count: -1,
        limit,
        windowSeconds,
      };
    }

    const results = await response.json();
    const count = results[2]?.result ?? 0;
    const remaining = Math.max(0, limit - count);
    const success = count <= limit;

    log.info(`Rate limit check: ${prefix}:${identifier}`, { count, limit, success });
    return { success, remaining, reset: now + windowSeconds * 1000, count, limit, windowSeconds };
  } catch (error) {
    log.info("Rate limit error - BLOCKING request (fail-closed)", { error: String(error) });
    return { 
      success: false, 
      remaining: 0, 
      reset: now + windowSeconds * 1000, 
      count: -1,
      limit,
      windowSeconds,
    };
  }
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// ============================================
// CAPTCHA VALIDATION (Cloudflare Turnstile)
// ============================================
async function validateCaptcha(token: string | null | undefined, clientIP: string, log: ReturnType<typeof createBackendLogger>): Promise<{ success: boolean; error?: string }> {
  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");

  // If Turnstile is not configured, allow request
  if (!secretKey) {
    log.info("Turnstile not configured, skipping CAPTCHA validation");
    return { success: true };
  }

  if (!token) {
    log.info("No CAPTCHA token provided");
    return { success: false, error: "Verificação de segurança necessária." };
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
          remoteip: clientIP,
        }),
      }
    );

    if (!response.ok) {
      log.error("Turnstile API error — fail-closed", undefined, { status: response.status });
      return { success: false, error: "Serviço de verificação temporariamente indisponível. Tente novamente em instantes." };
    }

    const result = await response.json();
    if (!result.success) {
      log.info("CAPTCHA validation failed", { errors: result["error-codes"] });
      return { success: false, error: "Verificação de segurança falhou. Tente novamente." };
    }

    log.info("CAPTCHA validation successful");
    return { success: true };
  } catch (error) {
    log.error("CAPTCHA validation error — fail-closed", error);
    return { success: false, error: "Serviço de verificação temporariamente indisponível. Tente novamente em instantes." };
  }
}

interface MembershipCheckoutRequest {
  membershipId: string;
  tenantSlug: string;
  successUrl: string;
  cancelUrl: string;
  captchaToken?: string;
}

/**
 * Generic error response for fail-closed scenarios
 */
function genericErrorResponse(corsHeaders: Record<string, string>, correlationId?: string): Response {
  return errorResponse(
    403,
    buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["operation not permitted"], correlationId),
    corsHeaders,
  );
}

/**
 * Rate limit response (after successful logging)
 */
function rateLimitResponse(corsHeaders: Record<string, string>, correlationId?: string): Response {
  return errorResponse(
    429,
    buildErrorEnvelope(ERROR_CODES.RATE_LIMITED, "rate_limit.exceeded", true, ["too many requests"], correlationId),
    corsHeaders,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("create-membership-checkout", correlationId);

  try {
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        dynamicCors,
      );
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const clientIP = getClientIP(req);
    
    // Rate limit by IP (10 checkout attempts per hour)
    const ipRateLimit = await checkRateLimit(clientIP, "checkout-ip", 10, 3600, log);
    if (!ipRateLimit.success) {
      log.info("Rate limited by IP", { ip: clientIP });
      
      // MANDATORY: Log decision BEFORE returning 429
      const logId = await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.RATE_LIMIT_BLOCK,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: null,
        tenant_id: null,
        reason_code: "RATE_LIMIT_EXCEEDED",
        metadata: {
          ip_address: clientIP,
          identifier: clientIP,
          identifier_type: "ip",
          count: ipRateLimit.count,
          limit: ipRateLimit.limit,
          window_seconds: ipRateLimit.windowSeconds,
        },
      });

      // FAIL-CLOSED: If logging fails, return generic error
      if (!logId) {
        log.info("Failed to log rate limit decision - BLOCKING (fail-closed)");
        return genericErrorResponse(dynamicCors, correlationId);
      }

      return rateLimitResponse(dynamicCors, correlationId);
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const { membershipId, tenantSlug, successUrl, cancelUrl, captchaToken }: MembershipCheckoutRequest = await req.json();

    // Validate required fields
    if (!membershipId || !tenantSlug) {
      throw new Error("Missing required fields: membershipId and tenantSlug");
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(membershipId)) {
      throw new Error("Invalid membershipId format");
    }

    // Validate CAPTCHA
    const captchaResult = await validateCaptcha(captchaToken, clientIP, log);
    if (!captchaResult.success) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "captcha.required", false, [captchaResult.error ?? "captcha failed"], correlationId),
        dynamicCors,
      );
    }

    // Fetch membership to get tenant_id for logging context
    const { data: membershipForContext } = await supabaseAdmin
      .from("memberships")
      .select("tenant_id")
      .eq("id", membershipId)
      .maybeSingle();

    const tenantIdForLogging = membershipForContext?.tenant_id || null;

    // Rate limit by membership (3 attempts per 10 minutes)
    const membershipRateLimit = await checkRateLimit(membershipId, "checkout-membership", 3, 600, log);
    if (!membershipRateLimit.success) {
      log.info("Rate limited by membership", { membershipId });
      
      // MANDATORY: Log decision BEFORE returning 429
      const logId = await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.RATE_LIMIT_BLOCK,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: null,
        tenant_id: tenantIdForLogging,
        reason_code: "RATE_LIMIT_EXCEEDED",
        metadata: {
          ip_address: clientIP,
          identifier: membershipId,
          identifier_type: "membership",
          count: membershipRateLimit.count,
          limit: membershipRateLimit.limit,
          window_seconds: membershipRateLimit.windowSeconds,
        },
      });

      // FAIL-CLOSED: If logging fails, return generic error
      if (!logId) {
        log.info("Failed to log rate limit decision - BLOCKING (fail-closed)");
        return genericErrorResponse(dynamicCors, correlationId);
      }

      return rateLimitResponse(dynamicCors, correlationId);
    }

    // Fetch membership (pode ter ou não athlete)
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select(`
        *,
        athlete:athletes(*),
        tenant:tenants(*)
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    if (membership.payment_status === "PAID") {
      throw new Error("This membership has already been paid");
    }

    const tenant = membership.tenant;

    if (!tenant) {
      throw new Error("Invalid membership data: tenant not found");
    }

    // Pegar email do athlete OU de applicant_data (parsing seguro)
    let customerEmail: string | null = null;

    if (membership.athlete && typeof membership.athlete === 'object' && 'email' in membership.athlete) {
      customerEmail = membership.athlete.email as string;
    } else if (
      membership.applicant_data && 
      typeof membership.applicant_data === 'object' && 
      'email' in (membership.applicant_data as Record<string, unknown>)
    ) {
      customerEmail = (membership.applicant_data as Record<string, unknown>).email as string;
    }

    if (!customerEmail) {
      throw new Error("Customer email not found");
    }

    // MARKETPLACE — destination charge. The membership fee belongs to the
    // Tenant, not the platform. When the Tenant has completed Stripe Connect
    // onboarding (charges_enabled), Stripe routes the funds to their account
    // and retains the platform application fee automatically.
    //
    // Soft fallback (Phase 1+2): if the Tenant has NOT onboarded yet, we keep
    // the legacy platform-only charge so existing tenants don't break on
    // deploy, but emit a CRITICAL institutional event so ops/the tenant are
    // told to onboard. A later phase flips this to a hard block.
    const connectInfo = await getTenantConnectInfo(supabaseAdmin, tenant.id);
    const destinationParams = buildDestinationChargeParams(
      connectInfo,
      membership.price_cents,
    );

    if (!destinationParams) {
      log.warn("Tenant not Connect-ready — falling back to platform charge", {
        tenantId: tenant.id,
        hasAccount: !!connectInfo?.stripeConnectAccountId,
        chargesEnabled: connectInfo?.chargesEnabled ?? false,
      });
      await supabaseAdmin.from("institutional_events").insert({
        event_type: "BILLING_CONNECT_FALLBACK_PLATFORM_CHARGE",
        severity: "CRITICAL",
        source: "create-membership-checkout",
        tenant_id: tenant.id,
        metadata: {
          membership_id: membershipId,
          reason: connectInfo?.stripeConnectAccountId
            ? "charges_not_enabled"
            : "no_connect_account",
          amount_cents: membership.price_cents,
        },
      }).then(undefined, () => { /* fail-silent: never block checkout on telemetry */ });
    }

    log.info("Creating checkout session", {
      membershipId,
      customerEmail,
      connectMode: destinationParams ? "destination" : "platform_fallback",
    });

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: membership.currency.toLowerCase(),
            product_data: {
              name: `Filiação - ${tenant.name}`,
              description: `Filiação de atleta para ${tenant.name}`,
            },
            unit_amount: membership.price_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${successUrl}?membership_id=${membershipId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      ...(destinationParams ? { payment_intent_data: destinationParams } : {}),
      metadata: {
        membership_id: membershipId,
        tenant_id: tenant.id,
        athlete_id: membership.athlete?.id || null,
        connect_mode: destinationParams ? "destination" : "platform_fallback",
      },
    });

    // GOV-001B: Update non-lifecycle column directly
    const { error: sessionUpdateError } = await supabaseAdmin
      .from("memberships")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", membershipId);

    if (sessionUpdateError) {
      log.info("Failed to update stripe_checkout_session_id", { error: sessionUpdateError.message });
    }

    // GOV-001B: Transition status via gatekeeper RPC
    const { error: rpcError } = await supabaseAdmin.rpc("change_membership_state", {
      p_membership_id: membershipId,
      p_new_status: "PENDING_PAYMENT",
      p_reason: "checkout_created",
      p_actor_profile_id: null,
      p_notes: null,
    });

    if (rpcError) {
      log.info("Gatekeeper RPC failed", { error: rpcError.message });
    }

    log.info("Checkout session created", { sessionId: session.id });

    return okResponse(
      { url: session.url, sessionId: session.id },
      dynamicCors,
      correlationId,
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.info("Error creating checkout session", { error: errorMessage });
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [errorMessage], correlationId),
      dynamicCors,
    );
  }
});
