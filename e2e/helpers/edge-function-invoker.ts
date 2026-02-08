/**
 * 🔧 Edge Function Invoker Helper
 * 
 * Centralized utility for invoking Edge Functions in contract tests.
 * Provides type-safe invocation with session management and assertions.
 * 
 * PI-D6.1 — Contract & Invariant Verification
 */

import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export interface EdgeFunctionResult {
  status: number;
  data: Record<string, unknown>;
  headers: Headers;
}

export interface InvokeOptions {
  session?: Session;
  headers?: Record<string, string>;
  impersonationId?: string;
}

/**
 * Invokes an Edge Function with full control over authentication and headers.
 * Returns status, parsed JSON data, and headers for complete verification.
 */
export async function invokeEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  options: InvokeOptions = {}
): Promise<EdgeFunctionResult> {
  const { session, headers: customHeaders, impersonationId } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    ...customHeaders,
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  if (impersonationId) {
    headers['x-impersonation-id'] = impersonationId;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  
  return { 
    status: response.status, 
    data,
    headers: response.headers,
  };
}

/**
 * Creates an authenticated session for a test user.
 */
export async function createTestSession(
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
 * Asserts that an Edge Function is blocked with expected code.
 * Validates HTTP 200 (neutral error) and success: false.
 */
export async function assertEdgeFunctionBlocked(
  functionName: string,
  body: Record<string, unknown>,
  expectedCode: string,
  session: Session
): Promise<void> {
  const result = await invokeEdgeFunction(functionName, body, { session });

  if (result.status !== 200) {
    throw new Error(
      `[${functionName}] Expected HTTP 200 (neutral error), got ${result.status}`
    );
  }

  if (result.data.success !== false) {
    throw new Error(
      `[${functionName}] Expected success: false, got ${JSON.stringify(result.data)}`
    );
  }

  if (result.data.code !== expectedCode) {
    throw new Error(
      `[${functionName}] Expected code "${expectedCode}", got "${result.data.code}"`
    );
  }
}

/**
 * Asserts that an audit log was created with required metadata fields.
 */
export async function assertAuditLogCreated(
  client: SupabaseClient,
  eventType: string,
  tenantId: string,
  requiredMetadataFields: string[],
  afterTimestamp: Date
): Promise<Record<string, unknown>> {
  const { data, error } = await client
    .from('audit_logs')
    .select('*')
    .eq('event_type', eventType)
    .eq('tenant_id', tenantId)
    .gte('created_at', afterTimestamp.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Audit log query failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      `No audit log found for event_type="${eventType}" in tenant="${tenantId}" after ${afterTimestamp.toISOString()}`
    );
  }

  const log = data[0];
  const metadata = log.metadata as Record<string, unknown> || {};

  for (const field of requiredMetadataFields) {
    if (!(field in metadata)) {
      throw new Error(
        `Audit log missing required metadata field: "${field}". Got: ${JSON.stringify(metadata)}`
      );
    }
  }

  return log;
}

/**
 * Verifies that a federation_tenants link exists with expected state.
 */
export async function assertFederationLink(
  client: SupabaseClient,
  tenantId: string,
  federationId: string,
  expectations: {
    exists: boolean;
    leftAt?: 'null' | 'not_null';
  }
): Promise<void> {
  const { data, error } = await client
    .from('federation_tenants')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('federation_id', federationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Federation link query failed: ${error.message}`);
  }

  if (expectations.exists && !data) {
    throw new Error(
      `Expected federation link to exist for tenant=${tenantId}, federation=${federationId}`
    );
  }

  if (!expectations.exists && data) {
    throw new Error(
      `Expected no federation link for tenant=${tenantId}, federation=${federationId}`
    );
  }

  if (data && expectations.leftAt === 'null' && data.left_at !== null) {
    throw new Error(
      `Expected left_at to be null, got: ${data.left_at}`
    );
  }

  if (data && expectations.leftAt === 'not_null' && data.left_at === null) {
    throw new Error(
      `Expected left_at to be set (not null), but it is null`
    );
  }
}

/**
 * Creates a test Supabase client with service role for admin operations.
 * Note: This uses anon key - for service role, you'd need SUPABASE_SERVICE_KEY.
 */
export function createTestSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
