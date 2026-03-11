/**
 * Account Lockout Utility (P1-13)
 *
 * Tracks failed login attempts per email.
 * After LOCKOUT_THRESHOLD failures within LOCKOUT_WINDOW_MINUTES,
 * the account is locked for LOCKOUT_DURATION_MINUTES.
 *
 * Uses the login_attempts table (created in migration 20260311200200).
 */

import { createBackendLogger } from "./backend-logger.ts";

// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_DURATION_MINUTES = 15;

export interface LockoutResult {
  locked: boolean;
  remainingAttempts: number;
  lockedUntil?: string;
}

/**
 * Check if an account is currently locked.
 */
export async function checkAccountLockout(
  supabase: SupabaseAdminClient,
  email: string,
): Promise<LockoutResult> {
  const log = createBackendLogger("account-lockout", crypto.randomUUID());

  const windowStart = new Date(
    Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: recentFailures, error } = await supabase
    .from("login_attempts")
    .select("id, created_at")
    .eq("email", email.toLowerCase())
    .eq("success", false)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("Failed to query login_attempts", error);
    // Fail-closed: if we can't check, assume not locked (but log the error)
    return { locked: false, remainingAttempts: LOCKOUT_THRESHOLD };
  }

  const failureCount = recentFailures?.length || 0;

  if (failureCount >= LOCKOUT_THRESHOLD) {
    const lastFailure = recentFailures[0]?.created_at;
    const lockedUntil = new Date(
      new Date(lastFailure).getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
    ).toISOString();

    if (new Date(lockedUntil) > new Date()) {
      log.warn("Account locked", { email, failureCount, lockedUntil });
      return { locked: true, remainingAttempts: 0, lockedUntil };
    }
  }

  return {
    locked: false,
    remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - failureCount),
  };
}

/**
 * Record a login attempt (success or failure).
 */
export async function recordLoginAttempt(
  supabase: SupabaseAdminClient,
  email: string,
  success: boolean,
  ipAddress?: string,
): Promise<void> {
  const log = createBackendLogger("account-lockout", crypto.randomUUID());

  const { error } = await supabase.from("login_attempts").insert({
    email: email.toLowerCase(),
    ip_address: ipAddress || null,
    success,
  });

  if (error) {
    log.error("Failed to record login attempt", error);
  }
}

/**
 * Cleanup old login attempts (call from scheduled job).
 */
export async function cleanupOldLoginAttempts(
  supabase: SupabaseAdminClient,
): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("login_attempts")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    const log = createBackendLogger("account-lockout", crypto.randomUUID());
    log.error("Failed to cleanup login attempts", error);
    return 0;
  }

  return data?.length || 0;
}
