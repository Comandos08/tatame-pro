// ============= Full file contents =============

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

// Constantes fixas (IMUTÁVEIS)
const TTL_DAYS = 7;
const BUCKET_NAME = "documents";
const TMP_PREFIX = "tmp";

// Status protegidos (NUNCA deletar arquivos associados)
const PROTECTED_STATUSES = ["PENDING_REVIEW", "APPROVED", "ACTIVE"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ... logStep replaced by logger

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("cleanup-tmp-documents", correlationId);

  try {
    // 1. Validar CRON_SECRET
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const requestSecret = req.headers.get("x-cron-secret") ?? "";

    if (!cronSecret) {
      log.error("Error: CRON_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (requestSecret !== cronSecret) {
      log.error("Forbidden: Invalid or missing x-cron-secret header");
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log.info("Starting cleanup job", { ttlDays: TTL_DAYS, bucket: BUCKET_NAME });

    // Calcular data de corte
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);

    let deletedCount = 0;
    let skippedCount = 0;
    const results: Array<{ path: string; action: string; reason: string; daysOld?: number }> = [];

    // 2. Listar pastas de usuário em tmp/
    const { data: userFolders, error: userListError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(TMP_PREFIX, { limit: 1000 });

    if (userListError) {
      throw new Error(`Failed to list tmp folder: ${userListError.message}`);
    }

    log.info("Found user folders", { count: userFolders?.length || 0 });

    // 3. Percorrer tmp/{userId}/
    for (const userFolder of userFolders || []) {
      // Pular se é um arquivo (não pasta) ou não tem nome
      if (!userFolder.name) continue;

      const userPath = `${TMP_PREFIX}/${userFolder.name}`;

      // 4. Listar pastas de timestamp
      const { data: timestampFolders, error: tsListError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(userPath, { limit: 100 });

      if (tsListError) {
        log.error("Error listing timestamp folders", tsListError, { path: userPath });
        continue;
      }

      // Percorrer tmp/{userId}/{timestamp}/
      for (const tsFolder of timestampFolders || []) {
        // Pular se é um arquivo (não pasta) ou não tem nome
        if (!tsFolder.name) continue;

        const timestampPath = `${userPath}/${tsFolder.name}`;

        // Listar arquivos dentro da pasta timestamp
        const { data: files, error: filesListError } = await supabase.storage
          .from(BUCKET_NAME)
          .list(timestampPath, { limit: 100 });

        if (filesListError) {
          log.error("Error listing files", filesListError, { path: timestampPath });
          continue;
        }

        // 5. Para cada arquivo
        for (const file of files || []) {
          // 5.1 Ignorar se não for arquivo (id inexistente = pasta)
          if (!file.id) {
            continue;
          }

          // 5.2 Ignorar se created_at inexistente
          if (!file.created_at) {
            const storagePath = `${timestampPath}/${file.name}`;
            results.push({ path: storagePath, action: "SKIP", reason: "NO_CREATED_AT" });
            skippedCount++;
            continue;
          }

          const storagePath = `${timestampPath}/${file.name}`;
          const fileCreatedAt = new Date(file.created_at);

          // 5.3 Calcular idade em dias
          const daysOld = Math.floor((Date.now() - fileCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

          // 5.4 Se idade < TTL → SKIP
          if (fileCreatedAt > cutoffDate) {
            results.push({ path: storagePath, action: "SKIP", reason: "TTL_NOT_EXCEEDED", daysOld });
            skippedCount++;
            continue;
          }

          // 5.5 Chamar RPC find_memberships_by_tmp_storage_path
          const { data: memberships, error: rpcError } = await supabase.rpc(
            "find_memberships_by_tmp_storage_path",
            { p_storage_path: storagePath }
          );

          if (rpcError) {
            log.error("RPC error", rpcError, { path: storagePath });
            results.push({ path: storagePath, action: "SKIP", reason: `RPC_ERROR: ${rpcError.message}`, daysOld });
            skippedCount++;
            continue;
          }

          // 5.6 Aplicar regras de proteção
          let shouldDelete = false;
          let deleteReason = "";

          if (!memberships || memberships.length === 0) {
            // Sem membership → DELETE
            shouldDelete = true;
            deleteReason = "NO_MEMBERSHIP";
          } else {
            const membershipStatus = memberships[0].status;
            
            if (PROTECTED_STATUSES.includes(membershipStatus)) {
              // Status protegido → SKIP
              results.push({ 
                path: storagePath, 
                action: "SKIP", 
                reason: `PROTECTED_MEMBERSHIP_${membershipStatus}`, 
                daysOld 
              });
              skippedCount++;
              continue;
            } else {
              // CANCELLED ou REJECTED → DELETE
              shouldDelete = true;
              deleteReason = `MEMBERSHIP_${membershipStatus}`;
            }
          }

          // 5.7 Deletar SOMENTE se permitido
          if (shouldDelete) {
            try {
              const { error: deleteError } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([storagePath]);

              if (deleteError) {
                throw deleteError;
              }

              // 5.8 Criar audit log por arquivo deletado
              await createAuditLog(supabase, {
                event_type: AUDIT_EVENTS.TMP_DOCUMENT_CLEANED,
                tenant_id: null,
                metadata: {
                  storage_path: storagePath,
                  reason: deleteReason,
                  days_old: daysOld,
                  ttl_days: TTL_DAYS,
                  automatic: true,
                  scheduled: true,
                },
              });

              results.push({ path: storagePath, action: "DELETED", reason: deleteReason, daysOld });
              deletedCount++;
              log.info("Deleted file", { path: storagePath, reason: deleteReason, daysOld });

            } catch (deleteErr) {
              const errMsg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
              log.error("Delete error", deleteErr, { path: storagePath });
              results.push({ path: storagePath, action: "ERROR", reason: errMsg, daysOld });
              skippedCount++;
            }
          }
        }
      }
    }

    // 6. Criar audit log de execução (summary)
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.TMP_DOCUMENT_CLEANUP_RUN,
      tenant_id: null,
      metadata: {
        deleted_count: deletedCount,
        skipped_count: skippedCount,
        ttl_days: TTL_DAYS,
        automatic: true,
        scheduled: true,
      },
    });

    log.info("Cleanup completed", { deletedCount, skippedCount });

    // 7. Retornar relatório estruturado
    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        skipped_count: skippedCount,
        ttl_days: TTL_DAYS,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Fatal error", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
