import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 🔐 Supabase Test Client
 * 
 * Creates a Supabase client for E2E test authentication.
 * Uses environment variables for configuration.
 */

// Test environment configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase credentials not found in environment. Tests requiring auth will fail.');
}

/**
 * Creates a Supabase client for test authentication
 */
export function createTestSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Returns the Supabase project reference (for cookie names)
 */
export function getSupabaseProjectRef(): string {
  // Extract project ref from URL: https://xxx.supabase.co -> xxx
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || 'test';
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
