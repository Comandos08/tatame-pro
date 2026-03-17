import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logDecision, DECISION_TYPES } from "../_shared/decision-logger.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { validateCaptcha, captchaErrorResponse } from "../_shared/captcha.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


const OPERATION_NAME = "retry-membership-payment";

// ============================================
// RATE LIMITING CONFIGURATION
// - 10 retry attempts per hour per IP
// - 3 retry attempts per 10 minutes per membership
// ============================================
interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  count: number;
  limit: number;
  windowSeconds: number;
}

// Global logger reference for helper functions
let log: ReturnType<typeof createBackendLogger>;

async function checkRateLimit(
  identifier: string,
  prefix: string,
  limit: number,
  windowSeconds: number
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

    log.info(`Rate limit check: ${prefix}:${identifier}`, {
      count,
      limit,
      success,
    });
    return {
      success,
      remaining,
      reset: now + windowSeconds * 1000,
      count,
      limit,
      windowSeconds,
    };
  } catch (error) {
    log.info("Rate limit error - BLOCKING request (fail-closed)", {
      error: String(error),
    });
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

interface RetryPaymentRequest {
  membershipId: string;
  tenantSlug: string;
  successUrl: string;
  cancelUrl: string;
  captchaToken?: string;
}

function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Too many requests" }),
    {
      status: 429,
      headers: {
        ...dynamicCors,
        "Content-Type": "application/json",
      },
    }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  log = createBackendLogger("retry-membership-payment", correlationId);

  // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const clientIP = getClientIP(req);

    // Rate limit by IP (10 retry attempts per hour)
    const ipRateLimit = await checkRateLimit(clientIP, "retry-ip", 10, 3600);
    if (!ipRateLimit.success) {
      log.info("Rate limited by IP", { ip: clientIP });

      await logDecision(supabaseAdmin, {
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

      return rateLimitResponse();
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const {
      membershipId,
      tenantSlug,
      successUrl,
      cancelUrl,
      captchaToken,
    }: RetryPaymentRequest = await req.json();

    // Validate required fields
    if (!membershipId || !tenantSlug) {
      throw new Error("Missing required fields: membershipId and tenantSlug");
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(membershipId)) {
      throw new Error("Invalid membershipId format");
    }

    // Validate CAPTCHA
    const captchaResult = await validateCaptcha(captchaToken, clientIP);
    if (!captchaResult.success) {
      return captchaErrorResponse(captchaResult, dynamicCors);
    }

    // Get current user from auth header (optional - may not be logged in)
    let currentUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      currentUserId = user?.id ?? null;
    }

    // Fetch membership with tenant and athlete data
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select(
        `
        *,
        tenant:tenants(id, slug, name),
        athlete:athletes(id, email, profile_id)
      `
      )
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    // Rate limit by membership (3 attempts per 10 minutes)
    const membershipRateLimit = await checkRateLimit(
      membershipId,
      "retry-membership",
      3,
      600
    );
    if (!membershipRateLimit.success) {
      log.info("Rate limited by membership", { membershipId });

      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.RATE_LIMIT_BLOCK,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: currentUserId,
        tenant_id: membership.tenant_id,
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

      return rateLimitResponse();
    }

    // === AJUSTE #2: Tenant Boundary Validation ===
    const tenant = membership.tenant as {
      id: string;
      slug: string;
      name: string;
    } | null;
    if (!tenant || tenant.slug !== tenantSlug) {
      log.info("Tenant boundary violation", {
        expected: tenantSlug,
        actual: tenant?.slug,
      });
      return new Response(
        JSON.stringify({ error: "FORBIDDEN_CROSS_TENANT" }),
        {
          status: 403,
          headers: { ...dynamicCors, "Content-Type": "application/json" },
        }
      );
    }

    // === AJUSTE #2: Ownership Validation ===
    const athlete = membership.athlete as {
      id: string;
      email: string;
      profile_id: string | null;
    } | null;
    const isOwner =
      currentUserId &&
      (membership.applicant_profile_id === currentUserId ||
        athlete?.profile_id === currentUserId);

    // Allow unauthenticated retry for users who haven't logged in
    // But if logged in, must be the owner
    if (currentUserId && !isOwner) {
      log.info("Ownership violation", {
        currentUserId,
        applicant_profile_id: membership.applicant_profile_id,
        athlete_profile_id: athlete?.profile_id,
      });
      return new Response(JSON.stringify({ error: "FORBIDDEN_NOT_OWNER" }), {
        status: 403,
        headers: { ...dynamicCors, "Content-Type": "application/json" },
      });
    }

    // === Status Validation ===
    if (
      membership.status !== "CANCELLED" ||
      membership.payment_status !== "NOT_PAID"
    ) {
      log.info("Membership not eligible for retry", {
        status: membership.status,
        payment_status: membership.payment_status,
      });
      return new Response(
        JSON.stringify({
          error: "MEMBERSHIP_NOT_ELIGIBLE_FOR_RETRY",
          details: "Only CANCELLED memberships with NOT_PAID can retry",
        }),
        {
          status: 400,
          headers: { ...dynamicCors, "Content-Type": "application/json" },
        }
      );
    }

    // === AJUSTE #3/#4: Cancellation Reason Validation (DETERMINISTIC) ===
    const { data: cancelLog } = await supabaseAdmin
      .from("audit_logs")
      .select("metadata, event_type")  // Include event_type for deterministic check
      .eq("tenant_id", membership.tenant_id)
      .in("event_type", [
        "MEMBERSHIP_PENDING_PAYMENT_CLEANUP",
        "MEMBERSHIP_ABANDONED_CLEANUP",
        "MEMBERSHIP_MANUAL_CANCELLED",  // Block retry for manual cancellations
      ])
      .order("created_at", { ascending: false })
      .limit(20);  // Increase limit to find most recent

    // Find matching log for this membership (most recent first)
    const matchingLog = cancelLog?.find((log) => {
      const metadata = log.metadata as { membership_id?: string } | null;
      return metadata?.membership_id === membershipId;
    });

    // AJUSTE #4: Deterministic check for manual cancellation FIRST
    const isManualCancellation = matchingLog?.event_type === "MEMBERSHIP_MANUAL_CANCELLED";

    if (isManualCancellation) {
      log.info("Retry BLOCKED for manual cancellation", { 
        membershipId,
        event_type: matchingLog?.event_type,
      });
      return new Response(
        JSON.stringify({
          error: "RETRY_BLOCKED_MANUAL_CANCELLATION",
          details: "Manual cancellations cannot be retried. Contact administrator.",
        }),
        {
          status: 400,
          headers: { ...dynamicCors, "Content-Type": "application/json" },
        }
      );
    }

    // Continue with existing timeout check logic
    const cancellationReason = (matchingLog?.metadata as {
      reason?: string;
    } | null)?.reason;
    const isPaymentTimeout =
      cancellationReason === "payment_timeout" ||
      cancellationReason?.includes("DRAFT status") ||
      // Allow if no log found (edge case for older memberships)
      !matchingLog;

    if (!isPaymentTimeout && matchingLog) {
      log.info("Retry not allowed for unknown cancellation reason", {
        cancellationReason,
      });
      return new Response(
        JSON.stringify({
          error: "RETRY_NOT_ALLOWED_FOR_UNKNOWN_CANCELLATION",
          details: "Only payment timeout cancellations can be retried",
        }),
        {
          status: 400,
          headers: { ...dynamicCors, "Content-Type": "application/json" },
        }
      );
    }

    // === AJUSTE #4: Store Previous Session ID ===
    const previousStripeSessionId = membership.stripe_checkout_session_id;

    // GOV-001B: Transition status via gatekeeper RPC
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("change_membership_state", {
      p_membership_id: membershipId,
      p_new_status: "PENDING_PAYMENT",
      p_reason: "payment_retry",
      p_actor_profile_id: currentUserId,
      p_notes: null,
    });

    if (rpcError) {
      log.info("Gatekeeper RPC failed", { error: rpcError.message });
      return new Response(
        JSON.stringify({
          error: "STATUS_CHANGED_CONCURRENT_RETRY",
          details: rpcError.message?.includes("Invalid transition") 
            ? "Membership status changed during retry attempt"
            : rpcError.message,
        }),
        {
          status: 409,
          headers: { ...dynamicCors, "Content-Type": "application/json" },
        }
      );
    }

    log.info("Status updated to PENDING_PAYMENT", { membershipId });

    // Get customer email
    let customerEmail: string | null = null;
    if (athlete?.email) {
      customerEmail = athlete.email;
    } else if (
      membership.applicant_data &&
      typeof membership.applicant_data === "object" &&
      "email" in (membership.applicant_data as Record<string, unknown>)
    ) {
      customerEmail = (membership.applicant_data as Record<string, unknown>)
        .email as string;
    }

    if (!customerEmail) {
      // ROLLBACK: Revert status to CANCELLED via RPC
      await supabaseAdmin.rpc("change_membership_state", {
        p_membership_id: membershipId,
        p_new_status: "CANCELLED",
        p_reason: "rollback_no_email",
        p_actor_profile_id: null,
        p_notes: null,
      });

      throw new Error("Customer email not found");
    }

    // === AJUSTE #1: Stripe with Rollback ===
    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.create({
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
        metadata: {
          membership_id: membershipId,
          tenant_id: tenant.id,
          athlete_id: athlete?.id || null,
          retry: "true",
        },
      });

      log.info("Stripe session created", { sessionId: stripeSession.id });
    } catch (stripeError) {
      // ROLLBACK: Revert status to CANCELLED
      log.info("Stripe session creation failed - rolling back", {
        error: String(stripeError),
      });

      // ROLLBACK: Revert status to CANCELLED via RPC
      await supabaseAdmin.rpc("change_membership_state", {
        p_membership_id: membershipId,
        p_new_status: "CANCELLED",
        p_reason: "rollback_stripe_failed",
        p_actor_profile_id: null,
        p_notes: stripeError instanceof Error ? stripeError.message : String(stripeError),
      });

      // Log failure
      await createAuditLog(supabaseAdmin, {
        event_type: AUDIT_EVENTS.MEMBERSHIP_PAYMENT_RETRY_FAILED,
        tenant_id: membership.tenant_id,
        metadata: {
          membership_id: membershipId,
          reason: "stripe_session_creation_failed",
          stripe_error:
            stripeError instanceof Error
              ? stripeError.message
              : String(stripeError),
          rolled_back: true,
          previous_status: "CANCELLED",
          attempted_status: "PENDING_PAYMENT",
          rollback_status: "CANCELLED",
          ip_address: clientIP,
        },
      });

      return new Response(
        JSON.stringify({
          error: "STRIPE_SESSION_FAILED",
          details: "Failed to create payment session. Please try again.",
        }),
        {
          status: 500,
          headers: { ...dynamicCors, "Content-Type": "application/json" },
        }
      );
    }

    // Update session ID
    await supabaseAdmin
      .from("memberships")
      .update({ stripe_checkout_session_id: stripeSession.id })
      .eq("id", membershipId);

    // === AJUSTE #4: Audit with Session Versioning ===
    await createAuditLog(supabaseAdmin, {
      event_type: AUDIT_EVENTS.MEMBERSHIP_PAYMENT_RETRY,
      tenant_id: membership.tenant_id,
      profile_id: currentUserId,
      metadata: {
        membership_id: membershipId,
        previous_status: "CANCELLED",
        new_status: "PENDING_PAYMENT",
        payment_status: "NOT_PAID",
        previous_stripe_session_id: previousStripeSessionId,
        new_stripe_session_id: stripeSession.id,
        cancellation_reason: cancellationReason || "unknown",
        automatic: false,
        source: "user_retry",
        ip_address: clientIP,
      },
    });

    log.info("Retry successful", {
      membershipId,
      sessionId: stripeSession.id,
    });

    return new Response(
      JSON.stringify({ url: stripeSession.url, sessionId: stripeSession.id }),
      {
        headers: { ...dynamicCors, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.info("Error in retry-membership-payment", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...dynamicCors, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
