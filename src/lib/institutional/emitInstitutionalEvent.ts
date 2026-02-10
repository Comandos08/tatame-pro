// ============================================================================
// PI U16 — Client-side emit helper (fail-silent)
// ============================================================================
//
// Sends institutional events to the edge function.
// NEVER throws. NEVER blocks. NEVER breaks caller flow.
// Fire-and-forget by design.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import type { InstitutionalEventDomain, InstitutionalEventType } from "./institutionalTimeline";

interface EmitPayload {
  domain: InstitutionalEventDomain;
  type: InstitutionalEventType;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget institutional event emission.
 * Fail-silent: swallows all errors.
 */
export function emitInstitutionalEvent(payload: EmitPayload): void {
  // Intentionally fire-and-forget (no await)
  _emit(payload).catch(() => {
    // fail-silent
  });
}

async function _emit(payload: EmitPayload): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emit-institutional-event`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}
