import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REQUEST-PASSWORD-RESET] ${step}${detailsStr}`);
};

// Generate a secure random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      throw new Error("Email is required");
    }

    const normalizedEmail = email.toLowerCase().trim();
    logStep("Password reset requested", { email: normalizedEmail });

    // Find profile by email
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    // Always return success to prevent email enumeration
    if (!profile) {
      logStep("No profile found, returning generic success");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Se este e-mail estiver cadastrado, você receberá um link de recuperação." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Invalidate any existing unused tokens for this user
    await supabase
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("profile_id", profile.id)
      .is("used_at", null);

    // Generate new token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save token
    const { error: insertError } = await supabase
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

    logStep("Token created successfully");

    // Get origin from request or use default
    const origin = req.headers.get("origin") || "https://ippon.tatame.pro";
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: "TATAME <noreply@tatame.pro>",
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
      logStep("Email send error", { error: emailError });
      throw new Error("Failed to send recovery email");
    }

    logStep("Recovery email sent successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Se este e-mail estiver cadastrado, você receberá um link de recuperação." 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
