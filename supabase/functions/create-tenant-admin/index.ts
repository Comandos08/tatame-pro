// ============= Full file contents =============

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


interface RequestBody {
  email: string;
  name?: string;
  password?: string;
  tenantId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("create-tenant-admin", correlationId);

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the calling user is a superadmin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    const callingUserId = claimsData.claims.sub as string;
    
    // Create service client for privileged operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is SUPERADMIN_GLOBAL
    const { data: superadminRole } = await serviceClient
      .from("user_roles")
      .select("id")
      .eq("user_id", callingUserId)
      .eq("role", "SUPERADMIN_GLOBAL")
      .is("tenant_id", null)
      .maybeSingle();

    if (!superadminRole) {
      return new Response(
        JSON.stringify({ error: "Forbidden - Only superadmins can create tenant admins" }),
        { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { email, name, password, tenantId } = body;

    if (!email || !tenantId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, tenantId" }),
        { status: 400, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Validate tenant exists
    const { data: tenant, error: tenantError } = await serviceClient
      .from("tenants")
      .select("id, name, slug")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists by email in profiles
    const { data: existingProfile } = await serviceClient
      .from("profiles")
      .select("id, email, name")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    let userId: string;
    let isNewUser = false;
    let generatedPassword: string | null = null;

    if (existingProfile) {
      // User exists - just add the role
      userId = existingProfile.id;
    } else {
      // Create new user
      isNewUser = true;
      generatedPassword = password || generateRandomPassword();

      // SAFE GOLD: Name normalization — prevent empty string in user_metadata
      const normalizedName = (name ?? '').trim() || email.split("@")[0];

      const { data: authUser, error: createError } = await serviceClient.auth.admin.createUser({
        email: email.toLowerCase(),
        password: generatedPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          name: normalizedName,
        },
      });

      if (createError) {
        // Check if user exists in auth but not in profiles
        if (createError.message?.includes("already been registered")) {
          // Try to find by auth email
          const { data: authUsers } = await serviceClient.auth.admin.listUsers();
          const existingAuthUser = authUsers?.users?.find(
            (u) => u.email?.toLowerCase() === email.toLowerCase()
          );
          
          if (existingAuthUser) {
            userId = existingAuthUser.id;
            isNewUser = false;
          } else {
            return new Response(
              JSON.stringify({ error: `Error creating user: ${createError.message}` }),
              { status: 400, headers: { ...dynamicCors, "Content-Type": "application/json" } }
            );
          }
        } else {
          return new Response(
            JSON.stringify({ error: `Error creating user: ${createError.message}` }),
            { status: 400, headers: { ...dynamicCors, "Content-Type": "application/json" } }
          );
        }
      } else {
        userId = authUser.user.id;
      }
    }

    // Check if user already has ADMIN_TENANT role for this tenant
    const { data: existingRole } = await serviceClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "ADMIN_TENANT")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingRole) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "User already has admin role for this tenant",
          userId,
          isNewUser: false,
          alreadyAdmin: true,
        }),
        { status: 200, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Add ADMIN_TENANT role
    const { error: roleError } = await serviceClient.rpc(
      'grant_admin_tenant_role',
      { p_user_id: userId, p_tenant_id: tenantId, p_bypass_membership_check: true }
    );

    if (roleError) {
      return new Response(
        JSON.stringify({ error: `Error assigning role: ${roleError.message}` }),
        { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Update profile tenant_id if not set
    await serviceClient
      .from("profiles")
      .update({ tenant_id: tenantId })
      .eq("id", userId)
      .is("tenant_id", null);

    // Log the action
    await serviceClient.from("audit_logs").insert({
      tenant_id: tenantId,
      profile_id: callingUserId,
      event_type: "ADMIN_CREATED",
      metadata: {
        target_user_id: userId,
        target_email: email,
        is_new_user: isNewUser,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: isNewUser
          ? "New admin user created successfully"
          : "Admin role assigned to existing user",
        userId,
        isNewUser,
        generatedPassword: isNewUser ? generatedPassword : null,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
      }),
      { status: 200, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Error in create-tenant-admin:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }
});

function generateRandomPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
