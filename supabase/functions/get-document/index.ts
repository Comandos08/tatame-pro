import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


interface RequestBody {
  documentId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("get-document", correlationId);

  try {
    // Only accept POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing or invalid authorization header" }),
        { status: 401, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's token for auth validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate JWT and get user claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - No user ID in token" }),
        { status: 401, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "Missing documentId" }),
        { status: 400, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for privileged operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the document record
    const { data: document, error: docError } = await serviceClient
      .from("documents")
      .select(`
        id,
        tenant_id,
        athlete_id,
        type,
        file_url,
        file_type
      `)
      .eq("id", documentId)
      .maybeSingle();

    if (docError) {
      log.error("Error fetching document", docError);
      return new Response(
        JSON.stringify({ error: "Error fetching document" }),
        { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    if (!document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Authorization check: Determine if user can access this document
    let isAuthorized = false;
    let authReason = "";

    // 1. Check if user is the athlete who owns the document
    const { data: athleteOwner } = await serviceClient
      .from("athletes")
      .select("id, profile_id")
      .eq("id", document.athlete_id)
      .eq("profile_id", userId)
      .maybeSingle();

    if (athleteOwner) {
      isAuthorized = true;
      authReason = "athlete_owner";
    }

    // 2. Check if user is a guardian linked to this athlete
    if (!isAuthorized) {
      const { data: guardianLinks } = await serviceClient
        .from("guardian_links")
        .select(`
          id,
          guardians!inner(id, profile_id)
        `)
        .eq("athlete_id", document.athlete_id);

      if (guardianLinks && guardianLinks.length > 0) {
        for (const link of guardianLinks) {
          const guardians = link.guardians as unknown as { id: string; profile_id: string | null }[];
          if (Array.isArray(guardians)) {
            for (const guardian of guardians) {
              if (guardian.profile_id === userId) {
                isAuthorized = true;
                authReason = "guardian";
                break;
              }
            }
          }
          if (isAuthorized) break;
        }
      }
    }

    // 3. Check if user is SUPERADMIN_GLOBAL
    if (!isAuthorized) {
      const { data: superadminRole } = await serviceClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "SUPERADMIN_GLOBAL")
        .is("tenant_id", null)
        .maybeSingle();

      if (superadminRole) {
        isAuthorized = true;
        authReason = "superadmin";
      }
    }

    // 4. Check if user has ADMIN_TENANT, STAFF_ORGANIZACAO, or COACH_PRINCIPAL role for the document's tenant
    if (!isAuthorized && document.tenant_id) {
      const { data: tenantRoles } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("tenant_id", document.tenant_id)
        .in("role", ["ADMIN_TENANT", "STAFF_ORGANIZACAO", "COACH_PRINCIPAL"]);

      if (tenantRoles && tenantRoles.length > 0) {
        isAuthorized = true;
        authReason = `tenant_role:${tenantRoles[0].role}`;
      }
    }

    // If not authorized, return 403
    if (!isAuthorized) {
      // Log the failed access attempt
      await serviceClient.from("audit_logs").insert({
        tenant_id: document.tenant_id,
        profile_id: userId,
        event_type: "DOCUMENT_ACCESS_DENIED",
        metadata: {
          document_id: documentId,
          athlete_id: document.athlete_id,
        },
      });

      return new Response(
        JSON.stringify({ error: "Forbidden - You do not have permission to access this document" }),
        { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Extract the file path from the stored URL
    const fileUrl = document.file_url;
    let filePath: string;

    if (fileUrl.includes("/storage/v1/object/public/documents/")) {
      filePath = fileUrl.split("/storage/v1/object/public/documents/")[1];
    } else if (fileUrl.includes("/storage/v1/object/documents/")) {
      filePath = fileUrl.split("/storage/v1/object/documents/")[1];
    } else {
      // Assume it's already just the path
      filePath = fileUrl.replace(/^\//, "");
    }

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "Invalid file path in document record" }),
        { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Generate a signed URL (valid for 5 minutes)
    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from("documents")
      .createSignedUrl(filePath, 300); // 5 minutes expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      log.error("Error creating signed URL", signedUrlError);
      return new Response(
        JSON.stringify({ error: "Error generating download URL" }),
        { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
      );
    }

    // Log successful access
    await serviceClient.from("audit_logs").insert({
      tenant_id: document.tenant_id,
      profile_id: userId,
      event_type: "DOCUMENT_DOWNLOAD",
      metadata: {
        document_id: documentId,
        athlete_id: document.athlete_id,
        document_type: document.type,
        auth_reason: authReason,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        signedUrl: signedUrlData.signedUrl,
        expiresIn: 300,
        documentType: document.type,
        fileType: document.file_type,
      }),
      { status: 200, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Unexpected error in get-document", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }
});
