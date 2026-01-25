import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

/**
 * FUNÇÃO DE DIAGNÓSTICO TEMPORÁRIA
 * Objetivo: validar leitura do RESEND_API_KEY e envio de e-mail via Resend
 * 
 * SAFE GOLD: Nenhuma alteração em Auth, Stripe, Billing, RLS
 * REMOVER APÓS VALIDAÇÃO
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[RESEND-DIAGNOSTIC] ${msg}`);
    logs.push(msg);
  };

  try {
    // 1️⃣ Validar leitura do secret
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    log(`RESEND_API_KEY exists: ${!!resendApiKey}`);
    log(`RESEND_API_KEY length: ${resendApiKey?.length || 0}`);
    log(`RESEND_API_KEY prefix: ${resendApiKey?.substring(0, 6) || "N/A"}...`);

    if (!resendApiKey) {
      log("❌ RESEND_API_KEY not found in Edge Function runtime");
      return new Response(
        JSON.stringify({
          success: false,
          resendKeyLoaded: false,
          error: "RESEND_API_KEY missing",
          logs,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if test email was requested
    const body = await req.json().catch(() => ({}));
    const testEmail = body.test_email;

    if (!testEmail) {
      // Just return diagnostic info without sending
      log("✅ RESEND_API_KEY loaded successfully (no test email requested)");
      return new Response(
        JSON.stringify({
          success: true,
          resendKeyLoaded: true,
          keyPrefix: resendApiKey.substring(0, 6),
          keyLength: resendApiKey.length,
          message: "API key loaded. Provide 'test_email' in body to send test.",
          logs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2️⃣ Enviar e-mail de teste via fetch direto
    log(`Sending test email to: ${testEmail}`);

    const emailPayload = {
      from: "TATAME <noreply@tatame.pro>",
      to: [testEmail],
      subject: "🧪 Teste Resend - Edge Function Lovable",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: #dc2626;">🥋 TATAME - Teste de Email</h1>
          <p>Este é um e-mail de teste enviado via Edge Function no Lovable.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>Runtime:</strong> Deno Edge Function</p>
          <hr>
          <p style="color: #888; font-size: 12px;">Se você recebeu este e-mail, a integração Resend está funcionando corretamente.</p>
        </div>
      `,
    };

    log(`Email payload prepared: ${JSON.stringify({ to: emailPayload.to, subject: emailPayload.subject })}`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await response.text();
    log(`Resend API response status: ${response.status}`);
    log(`Resend API response: ${responseText}`);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      log(`❌ Resend API error: ${response.status}`);
      return new Response(
        JSON.stringify({
          success: false,
          resendKeyLoaded: true,
          emailSent: false,
          error: responseData,
          logs,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("✅ Email sent successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        resendKeyLoaded: true,
        emailSent: true,
        resendResponse: responseData,
        testEmail,
        logs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Exception: ${errorMessage}`);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        logs,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
