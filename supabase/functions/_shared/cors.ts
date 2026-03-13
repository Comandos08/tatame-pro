/**
 * Centralized CORS configuration for all Edge Functions.
 *
 * Supports multiple allowed origins:
 * 1. ALLOWED_ORIGIN env var (for custom overrides)
 * 2. Production custom domain: https://tatame.pro
 * 3. Lovable Cloud URL: https://tatame-pro.lovable.app
 * 4. "*" only when explicitly set via env (local dev)
 *
 * Headers include the superset of all headers used across Edge Functions:
 * - x-impersonation-id: impersonation flows
 * - x-cron-secret: scheduled jobs
 * - x-supabase-client-*: Supabase SDK metadata
 */

const PRODUCTION_ORIGINS = [
  "https://tatame.pro",
  "https://www.tatame.pro",
  "https://tatame-pro.lovable.app",
];

const envOrigin = Deno.env.get("ALLOWED_ORIGIN");

/**
 * Builds CORS headers dynamically based on the request origin.
 * Returns the matching allowed origin or falls back to the production domain.
 */
export function buildCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  // If env explicitly sets "*", use wildcard (local dev)
  if (envOrigin === "*") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-impersonation-id, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
  }

  // Custom env origin takes priority
  const allowedOrigins = envOrigin
    ? [envOrigin, ...PRODUCTION_ORIGINS]
    : PRODUCTION_ORIGINS;

  const matchedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0]; // default to tatame.pro

  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-impersonation-id, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

/** Static fallback for contexts where the request is not available */
export const corsHeaders: Record<string, string> = buildCorsHeaders(null);

/**
 * Standard preflight response for OPTIONS requests.
 * Use at the top of every Edge Function:
 *
 * ```ts
 * if (req.method === "OPTIONS") return corsPreflightResponse(req);
 * ```
 */
export function corsPreflightResponse(req?: Request): Response {
  const origin = req?.headers.get("Origin") ?? null;
  return new Response("ok", { headers: buildCorsHeaders(origin) });
}
