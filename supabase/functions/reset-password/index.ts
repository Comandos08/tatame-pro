import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[RESET-PASSWORD] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, password, action } = await req.json();

    if (!token) {
      throw new Error("Token is required");
    }

    // Validate action type
    if (action === "validate") {
      // Just validate the token
      const { data: resetRecord } = await supabase
        .from("password_resets")
        .select("id, email, expires_at, used_at, profile_id")
        .eq("token", token)
        .maybeSingle();

      if (!resetRecord) {
        return new Response(
          JSON.stringify({ valid: false, message: "Token inválido ou expirado." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      if (resetRecord.used_at) {
        return new Response(
          JSON.stringify({ valid: false, message: "Este link já foi utilizado." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const expiresAt = new Date(resetRecord.expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, message: "Este link expirou. Solicite um novo." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      logStep("Token validated successfully");

      return new Response(
        JSON.stringify({ 
          valid: true, 
          email: resetRecord.email.replace(/(.{2}).*(@.*)/, "$1***$2")
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Reset password action
    if (!password) {
      throw new Error("Password is required");
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    }

    // Find the reset record
    const { data: resetRecord } = await supabase
      .from("password_resets")
      .select("id, email, expires_at, used_at, profile_id")
      .eq("token", token)
      .maybeSingle();

    if (!resetRecord) {
      throw new Error("Token inválido ou expirado.");
    }

    if (resetRecord.used_at) {
      throw new Error("Este link já foi utilizado.");
    }

    const expiresAt = new Date(resetRecord.expires_at);
    if (expiresAt < new Date()) {
      throw new Error("Este link expirou. Solicite um novo.");
    }

    logStep("Token valid, proceeding with password reset", { profileId: resetRecord.profile_id });

    // Find the auth user by email
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      throw new Error("Failed to lookup user");
    }

    const authUser = authUsers.users.find(u => u.email?.toLowerCase() === resetRecord.email.toLowerCase());
    
    if (!authUser) {
      throw new Error("User not found");
    }

    // Update the password
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
    });

    if (updateError) {
      logStep("Failed to update password", { error: updateError.message });
      throw new Error("Falha ao atualizar a senha. Tente novamente.");
    }

    // Mark token as used
    await supabase
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetRecord.id);

    logStep("Password reset successful");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Senha alterada com sucesso! Você já pode fazer login." 
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
