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

// ============================================
// RATE LIMITING CONFIGURATION
// - 10 reset attempts per hour per IP
// - 5 reset attempts per hour per token
// ============================================
interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  count: number;
}

async function checkRateLimit(
  identifier: string,
  prefix: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!redisUrl || !redisToken) {
    logStep("Rate limiting not configured, allowing request");
    return { success: true, remaining: limit, reset: Date.now() + windowSeconds * 1000, count: 0 };
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
      logStep("Redis error, allowing request");
      return { success: true, remaining: limit, reset: now + windowSeconds * 1000, count: 0 };
    }

    const results = await response.json();
    const count = results[2]?.result ?? 0;
    const remaining = Math.max(0, limit - count);
    const success = count <= limit;

    logStep(`Rate limit check: ${prefix}:${identifier}`, { count, limit, success });
    return { success, remaining, reset: now + windowSeconds * 1000, count };
  } catch (error) {
    logStep("Rate limit error, allowing request", { error: String(error) });
    return { success: true, remaining: limit, reset: now + windowSeconds * 1000, count: 0 };
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = getClientIP(req);
    
    // Rate limit by IP (10 attempts per hour)
    const ipRateLimit = await checkRateLimit(clientIP, "reset-password-ip", 10, 3600);
    if (!ipRateLimit.success) {
      logStep("Rate limited by IP", { ip: clientIP });
      return new Response(
        JSON.stringify({ 
          error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
          retryAfter: Math.ceil((ipRateLimit.reset - Date.now()) / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((ipRateLimit.reset - Date.now()) / 1000).toString()
          } 
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, password, action } = await req.json();

    if (!token || typeof token !== "string" || token.length !== 64) {
      throw new Error("Token inválido");
    }

    // Rate limit by token (5 attempts per hour) - prevents brute force on specific token
    const tokenRateLimit = await checkRateLimit(token.substring(0, 16), "reset-password-token", 5, 3600);
    if (!tokenRateLimit.success) {
      logStep("Rate limited by token");
      return new Response(
        JSON.stringify({ valid: false, message: "Muitas tentativas para este token." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
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
    if (!password || typeof password !== "string") {
      throw new Error("Senha é obrigatória");
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    }

    if (password.length > 72) {
      throw new Error("A senha deve ter no máximo 72 caracteres.");
    }

    // Check for common weak patterns
    const weakPatterns = ["12345678", "password", "qwerty", "abcdefgh"];
    if (weakPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
      throw new Error("Senha muito fraca. Escolha uma senha mais segura.");
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
