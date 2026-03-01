/**
 * 🔐 Request Password Reset Edge Function
 * 
 * Public endpoint for password reset requests with:
 * - Rate limiting (5/hour per email, 20/hour per IP)
 * - Mandatory decision logging for all rate limit blocks
 * - Fail-closed behavior (if logging fails, operation fails)
 * - Anti-enumeration (generic responses)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEmailClient, DEFAULT_EMAIL_FROM } from "../_shared/emailClient.ts";
import { logDecision, DECISION_TYPES } from "../_shared/decision-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { validateCaptcha, captchaErrorResponse } from "../_shared/captcha.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPERATION_NAME = "request-password-reset";

// ============================================
// RATE LIMITING CONFIGURATION
// - 5 requests per hour per email
// - 20 requests per hour per IP
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

// Generate a secure random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Generic error response for fail-closed scenarios
 */
function genericErrorResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Operation not permitted" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Rate limit response (after successful logging)
 */
function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Too many requests" }),
    { 
      status: 429, 
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
      } 
    }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("request-password-reset", correlationId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const clientIP = getClientIP(req);
    
    // Rate limit by IP (20 requests per hour)
    const ipRateLimit = await checkRateLimit(clientIP, "password-reset-ip", 20, 3600, log);
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
        return genericErrorResponse();
      }

      return rateLimitResponse();
    }

    const resend = getEmailClient();

    const body = await req.json();
    const { email } = body;

    // CAPTCHA validation (Cloudflare Turnstile)
    const captchaToken = body.captchaToken;
    if (captchaToken) {
      const captchaResult = await validateCaptcha(captchaToken, clientIP);
      if (!captchaResult.success) {
        return captchaErrorResponse(captchaResult, corsHeaders);
      }
    }

    if (!email || typeof email !== "string") {
      throw new Error("Email is required");
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 255) {
      throw new Error("Formato de e-mail inválido");
    }

    // Rate limit by email (5 requests per hour)
    const emailRateLimit = await checkRateLimit(normalizedEmail, "password-reset-email", 5, 3600, log);
    if (!emailRateLimit.success) {
      log.info("Rate limited by email", { email: normalizedEmail });
      
      // MANDATORY: Log decision BEFORE returning (anti-enumeration: return 200)
      const logId = await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.RATE_LIMIT_BLOCK,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: null,
        tenant_id: null,
        reason_code: "RATE_LIMIT_EXCEEDED",
        metadata: {
          ip_address: clientIP,
          identifier: normalizedEmail,
          identifier_type: "email",
          count: emailRateLimit.count,
          limit: emailRateLimit.limit,
          window_seconds: emailRateLimit.windowSeconds,
        },
      });

      // FAIL-CLOSED: If logging fails, return generic error
      if (!logId) {
        log.info("Failed to log rate limit decision - BLOCKING (fail-closed)");
        return genericErrorResponse();
      }

      // Return success to prevent email enumeration, but don't actually process
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Se este e-mail estiver cadastrado, você receberá um link de recuperação." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    log.info("Password reset requested", { email: normalizedEmail });

    // Find profile by email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    // Always return success to prevent email enumeration
    if (!profile) {
      log.info("No profile found, returning generic success");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Se este e-mail estiver cadastrado, você receberá um link de recuperação." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Invalidate any existing unused tokens for this user
    await supabaseAdmin
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("profile_id", profile.id)
      .is("used_at", null);

    // Generate new token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save token
    const { error: insertError } = await supabaseAdmin
      .from("password_resets")
      .insert({
        profile_id: profile.id,
        email: normalizedEmail,
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      throw new Error(`Failed to create reset token: ${insertError.message}`);
    }

    log.info("Token created successfully");

    // Get origin from request or use default
    const origin = req.headers.get("origin") || "https://ippon.tatame.pro";
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: DEFAULT_EMAIL_FROM,
      to: [normalizedEmail],
      subject: "Recuperação de Senha - TATAME",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Recuperação de Senha</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🥋 TATAME</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Sistema de Gestão Esportiva</p>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #111; margin-top: 0;">Olá${profile.name ? `, ${profile.name}` : ""}!</h2>
            
            <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Redefinir Senha
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Este link expira em <strong>1 hora</strong>. Se você não solicitou esta recuperação, ignore este e-mail.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            
            <p style="color: #888; font-size: 12px; margin-bottom: 0;">
              Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <span style="color: #dc2626; word-break: break-all;">${resetUrl}</span>
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (emailError) {
      log.info("Email send error", { error: emailError });
      throw new Error("Failed to send recovery email");
    }

    log.info("Recovery email sent successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Se este e-mail estiver cadastrado, você receberá um link de recuperação." 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
