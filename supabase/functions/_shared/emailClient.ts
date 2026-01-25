import { Resend } from "https://esm.sh/resend@2.0.0";

/**
 * SAFE GOLD
 * Client centralizado para envio de e-mails via Resend
 * - Log explícito para diagnóstico de runtime
 * - Sem mudança de payload ou regras de negócio
 */

let resendClient: Resend | null = null;

export function getEmailClient(): Resend {
  if (resendClient) return resendClient;

  const apiKey = Deno.env.get("RESEND_API_KEY");

  // Log explícito para diagnóstico (TEMPORÁRIO)
  console.log("[EMAIL] RESEND_API_KEY exists:", !!apiKey);
  console.log("[EMAIL] RESEND_API_KEY length:", apiKey?.length || 0);

  if (!apiKey) {
    console.error("[EMAIL] RESEND_API_KEY not found in Edge Function runtime");
    throw new Error("RESEND_API_KEY missing");
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Retorna a API key diretamente para uso com fetch
 * Útil para envio via API REST sem SDK
 */
export function getResendApiKey(): string | null {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  console.log("[EMAIL] getResendApiKey - exists:", !!apiKey);
  return apiKey || null;
}

/**
 * Verifica se o client de e-mail está disponível
 * Útil para early return sem throw
 */
export function isEmailConfigured(): boolean {
  const configured = !!Deno.env.get("RESEND_API_KEY");
  console.log("[EMAIL] isEmailConfigured:", configured);
  return configured;
}

export const DEFAULT_EMAIL_FROM = "TATAME <noreply@tatame.pro>";
