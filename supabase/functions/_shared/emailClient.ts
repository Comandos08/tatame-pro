import { Resend } from "https://esm.sh/resend@2.0.0";
import { createBackendLogger } from "./backend-logger.ts";

/**
 * SAFE GOLD
 * Client centralizado para envio de e-mails via Resend
 * - Sem mudança funcional
 * - Sem mudança de payload
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 */

let resendClient: Resend | null = null;

export function getEmailClient(): Resend {
  if (resendClient) return resendClient;

  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!apiKey) {
    const log = createBackendLogger("emailClient", crypto.randomUUID());
    log.error("RESEND_API_KEY not configured");
    throw new Error("Email service not configured");
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Retorna a API key diretamente para uso com fetch
 * Útil para envio via API REST sem SDK
 */
export function getResendApiKey(): string | null {
  return Deno.env.get("RESEND_API_KEY") || null;
}

/**
 * Verifica se o client de e-mail está disponível
 * Útil para early return sem throw
 */
export function isEmailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY");
}

export const DEFAULT_EMAIL_FROM = "TATAME <noreply@tatame.pro>";