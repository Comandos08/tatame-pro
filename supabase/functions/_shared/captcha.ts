/**
 * CAPTCHA Validation Utility
 * 
 * Supports Cloudflare Turnstile for spam protection.
 * Falls back to allowing requests if not configured (for development).
 * 
 * Configuration:
 * - TURNSTILE_SECRET_KEY: Cloudflare Turnstile secret key
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 * 
 * Usage:
 * ```typescript
 * import { validateCaptcha } from "../_shared/captcha.ts";
 * 
 * const { success, error } = await validateCaptcha(token, clientIP);
 * if (!success) {
 *   return new Response(JSON.stringify({ error }), { status: 400 });
 * }
 * ```
 */

import { createBackendLogger } from "./backend-logger.ts";

export interface CaptchaResult {
  success: boolean;
  error?: string;
  /** Challenge timestamp */
  challengeTs?: string;
  /** Hostname where challenge was solved */
  hostname?: string;
}

/**
 * Validate Cloudflare Turnstile token
 */
export async function validateCaptcha(
  token: string | null | undefined,
  clientIP: string
): Promise<CaptchaResult> {
  const log = createBackendLogger("captcha", crypto.randomUUID());
  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");

  // If Turnstile is not configured, allow request (for development)
  if (!secretKey) {
    log.warn("Turnstile not configured, skipping validation");
    return { success: true };
  }

  // Token is required when Turnstile is configured
  if (!token) {
    log.info("No token provided");
    return { 
      success: false, 
      error: "Verificação de segurança necessária. Por favor, complete o CAPTCHA." 
    };
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
          remoteip: clientIP,
        }),
      }
    );

    if (!response.ok) {
      log.error("Turnstile API error", undefined, { status: response.status });
      // Fail-open on API errors
      return { success: true };
    }

    const result = await response.json();

    if (!result.success) {
      log.info("Validation failed", { error_codes: result["error-codes"] });
      return {
        success: false,
        error: "Verificação de segurança falhou. Tente novamente.",
      };
    }

    log.info("Validation successful");
    return {
      success: true,
      challengeTs: result.challenge_ts,
      hostname: result.hostname,
    };
  } catch (error) {
    log.error("Error", error);
    // Fail-open on errors
    return { success: true };
  }
}

/**
 * Create error response for CAPTCHA failures
 */
export function captchaErrorResponse(
  result: CaptchaResult,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: result.error || "Verificação de segurança falhou.",
      captchaRequired: true,
    }),
    {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}