/**
 * 🔐 Security Test Client
 * 
 * Provides direct API access for security testing without UI.
 * Used to test edge function authorization and bypass attempts.
 */

import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

/**
 * Creates an authenticated test client with a specific user session
 */
export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<{ client: SupabaseClient; session: Session }> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  
  if (error || !data.session) {
    throw new Error(`Authentication failed for ${email}: ${error?.message}`);
  }

  return { client, session: data.session };
}

/**
 * Invokes an edge function with optional impersonation header
 */
export async function invokeEdgeFunction(
  session: Session,
  functionName: string,
  body: Record<string, unknown>,
  impersonationId?: string
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };

  if (impersonationId) {
    headers['x-impersonation-id'] = impersonationId;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

/**
 * Direct database query for verification (read-only)
 */
export async function queryDatabase<T>(
  client: SupabaseClient,
  table: string,
  filter: { column: string; value: string }
): Promise<T[]> {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(filter.column, filter.value);

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  return (data || []) as T[];
}

/**
 * Checks if an audit log exists for a specific event
 */
export async function checkAuditLog(
  client: SupabaseClient,
  eventType: string,
  tenantId: string,
  afterTimestamp: Date
): Promise<{ exists: boolean; log?: Record<string, unknown> }> {
  const { data, error } = await client
    .from('audit_logs')
    .select('*')
    .eq('event_type', eventType)
    .eq('tenant_id', tenantId)
    .gte('created_at', afterTimestamp.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Audit log check failed:', error);
    return { exists: false };
  }

  return { exists: (data?.length ?? 0) > 0, log: data?.[0] };
}

/**
 * Gets user roles from the database
 */
export async function getUserRoles(
  client: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<string[]> {
  const { data, error } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to get roles: ${error.message}`);
  }

  return (data || []).map(r => r.role);
}

/**
 * Gets tenant onboarding status
 */
export async function getTenantOnboardingStatus(
  client: SupabaseClient,
  tenantId: string
): Promise<{ completed: boolean; completedAt: string | null }> {
  const { data, error } = await client
    .from('tenants')
    .select('onboarding_completed, onboarding_completed_at')
    .eq('id', tenantId)
    .single();

  if (error) {
    throw new Error(`Failed to get tenant: ${error.message}`);
  }

  return {
    completed: data?.onboarding_completed ?? false,
    completedAt: data?.onboarding_completed_at ?? null,
  };
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
