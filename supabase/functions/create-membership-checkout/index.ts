import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-MEMBERSHIP-CHECKOUT] ${step}${detailsStr}`);
};

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
}

async function checkRateLimit(
  identifier: string,
  prefix: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!redisUrl || !redisToken) {
    logStep("Rate limiting not configured, allowing request");
    return { success: true, remaining: limit, reset: Date.now() + windowSeconds * 1000, count: 0 };
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
      logStep("Redis error, allowing request");
      return { success: true, remaining: limit, reset: now + windowSeconds * 1000, count: 0 };
    }

    const results = await response.json();
    const count = results[2]?.result ?? 0;
    const remaining = Math.max(0, limit - count);
    const success = count <= limit;

    logStep(`Rate limit check: ${prefix}:${identifier}`, { count, limit, success });
    return { success, remaining, reset: now + windowSeconds * 1000, count };
  } catch (error) {
    logStep("Rate limit error, allowing request", { error: String(error) });
    return { success: true, remaining: limit, reset: now + windowSeconds * 1000, count: 0 };
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
async function validateCaptcha(token: string | null | undefined, clientIP: string): Promise<{ success: boolean; error?: string }> {
  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");

  // If Turnstile is not configured, allow request
  if (!secretKey) {
    logStep("Turnstile not configured, skipping CAPTCHA validation");
    return { success: true };
  }

  if (!token) {
    logStep("No CAPTCHA token provided");
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
      logStep("Turnstile API error");
      return { success: true }; // Fail-open
    }

    const result = await response.json();
    if (!result.success) {
      logStep("CAPTCHA validation failed", { errors: result["error-codes"] });
      return { success: false, error: "Verificação de segurança falhou. Tente novamente." };
    }

    logStep("CAPTCHA validation successful");
    return { success: true };
  } catch (error) {
    logStep("CAPTCHA error", { error: String(error) });
    return { success: true }; // Fail-open
  }
}

interface MembershipCheckoutRequest {
  membershipId: string;
  tenantSlug: string;
  successUrl: string;
  cancelUrl: string;
  captchaToken?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = getClientIP(req);
    
    // Rate limit by IP (10 checkout attempts per hour)
    const ipRateLimit = await checkRateLimit(clientIP, "checkout-ip", 10, 3600);
    if (!ipRateLimit.success) {
      logStep("Rate limited by IP", { ip: clientIP });
      return new Response(
        JSON.stringify({ 
          error: "Muitas tentativas de pagamento. Aguarde alguns minutos.",
          retryAfter: Math.ceil((ipRateLimit.reset - Date.now()) / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((ipRateLimit.reset - Date.now()) / 1000).toString()
          } 
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
    const captchaResult = await validateCaptcha(captchaToken, clientIP);
    if (!captchaResult.success) {
      return new Response(
        JSON.stringify({ error: captchaResult.error, captchaRequired: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit by membership (3 attempts per 10 minutes)
    const membershipRateLimit = await checkRateLimit(membershipId, "checkout-membership", 3, 600);
    if (!membershipRateLimit.success) {
      logStep("Rate limited by membership", { membershipId });
      return new Response(
        JSON.stringify({ 
          error: "Muitas tentativas para esta filiação. Aguarde alguns minutos." 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch membership (pode ter ou não athlete)
    const { data: membership, error: membershipError } = await supabase
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

    logStep("Creating checkout session", { membershipId, customerEmail });

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
      metadata: {
        membership_id: membershipId,
        tenant_id: tenant.id,
        athlete_id: membership.athlete?.id || null,
      },
    });

    // Update membership with checkout session id and status
    const { error: updateError } = await supabase
      .from("memberships")
      .update({
        stripe_checkout_session_id: session.id,
        status: "PENDING_PAYMENT",
      })
      .eq("id", membershipId);

    if (updateError) {
      logStep("Failed to update membership", { error: updateError.message });
    }

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error creating checkout session", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
