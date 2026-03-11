/**
 * Centralized CORS configuration for all Edge Functions.
 *
 * Uses ALLOWED_ORIGIN env var to restrict origins in production.
 * Falls back to "*" only when the env var is not set (local dev).
 */

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-impersonation-id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/**
 * Standard preflight response for OPTIONS requests.
 * Use at the top of every Edge Function:
 *
 * ```ts
 * if (req.method === "OPTIONS") return corsPreflightResponse();
 * ```
 */
export function corsPreflightResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}
