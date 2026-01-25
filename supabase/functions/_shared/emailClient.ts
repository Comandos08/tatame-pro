import { Resend } from "https://esm.sh/resend@2.0.0";

/**
 * SAFE GOLD
 * Client centralizado para envio de e-mails via Resend
 * - Sem mudança funcional
 * - Sem mudança de payload
 */

let resendClient: Resend | null = null;

export function getEmailClient(): Resend {
  if (resendClient) return resendClient;

  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!apiKey) {
    console.error("[EMAIL] RESEND_API_KEY not configured");
    throw new Error("Email service not configured");
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Verifica se o client de e-mail está disponível
 * Útil para early return sem throw
 */
export function isEmailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY");
}

export const DEFAULT_EMAIL_FROM = "TATAME <noreply@tatame.pro>";
