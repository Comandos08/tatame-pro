/**
 * 🔐 Secure Rate Limiter with Fail-Closed Behavior
 * 
 * Enhanced rate limiter that:
 * - Uses Upstash Redis for distributed rate limiting
 * - FAILS CLOSED on errors (blocks requests when Redis unavailable)
 * - Logs security events for rate limit violations
 * - Supports composite keys (operation + user + tenant + IP)
 * 
 * Configuration:
 * - UPSTASH_REDIS_REST_URL: Upstash Redis REST API URL
 * - UPSTASH_REDIS_REST_TOKEN: Upstash Redis REST API Token
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSecurityEvent, SECURITY_EVENTS, extractRequestContext } from "./security-logger.ts";
import { buildErrorEnvelope, errorResponse, ERROR_CODES } from "./errors/envelope.ts";
import { createBackendLogger } from "./backend-logger.ts";

export interface SecureRateLimitConfig {
  /** Operation name for key prefix */
  operation: string;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Whether to fail closed (block) on Redis errors. Default: true */
  failClosed?: boolean;
  /** Log security event on limit exceeded. Default: true */
  logSecurityEvent?: boolean;
}

export interface SecureRateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the window */
  remaining: number;
  /** Unix timestamp when the window resets */
  reset: number;
  /** Current request count */
  count: number;
  /** Error message if rate limit check failed */
  error?: string;
  /** Whether the result is from a fallback (Redis unavailable) */
  fallback?: boolean;
}

export interface RateLimitContext {
  userId?: string | null;
  tenantId?: string | null;
  ipAddress: string;
  userAgent?: string;
}

/**
 * Secure Rate Limiter with fail-closed behavior
 */
export class SecureRateLimiter {
  private config: SecureRateLimitConfig;
  private redisUrl: string;
  private redisToken: string;

  constructor(config: SecureRateLimitConfig) {
    this.config = {
      ...config,
      failClosed: config.failClosed ?? true,
      logSecurityEvent: config.logSecurityEvent ?? true,
    };
    this.redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL") ?? "";
    this.redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") ?? "";
  }

  /**
   * Build composite rate limit key
   */
  private buildKey(ctx: RateLimitContext): string {
    const parts = [`ratelimit`, this.config.operation];
    
    if (ctx.tenantId) parts.push(`t:${ctx.tenantId}`);
    if (ctx.userId) parts.push(`u:${ctx.userId}`);
    parts.push(`ip:${ctx.ipAddress}`);
    
    return parts.join(':');
  }

  /**
   * Check rate limit for the given context
   */
  async check(
    ctx: RateLimitContext,
    // deno-lint-ignore no-explicit-any
    supabaseAdmin?: any
  ): Promise<SecureRateLimitResult> {
    const key = this.buildKey(ctx);
    const now = Date.now();
    const log = createBackendLogger("secure-rate-limiter", crypto.randomUUID());

    // If Redis is not configured, fail closed
    if (!this.redisUrl || !this.redisToken) {
      log.error("Redis not configured - BLOCKING request (fail-closed)");
      
      if (this.config.failClosed) {
        return {
          allowed: false,
          remaining: 0,
          reset: now + this.config.windowSeconds * 1000,
          count: -1,
          error: 'Rate limiter unavailable',
          fallback: true,
        };
      }
      
      // Only allow if explicitly configured to fail open
      return {
        allowed: true,
        remaining: this.config.limit,
        reset: now + this.config.windowSeconds * 1000,
        count: 0,
        fallback: true,
      };
    }

    try {
      const windowStart = now - this.config.windowSeconds * 1000;

      // Sliding window with Redis sorted sets
      const pipeline = [
        ["ZREMRANGEBYSCORE", key, "0", windowStart.toString()],
        ["ZADD", key, now.toString(), `${now}-${Math.random()}`],
        ["ZCARD", key],
        ["PEXPIRE", key, (this.config.windowSeconds * 1000).toString()],
      ];

      const response = await fetch(`${this.redisUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pipeline),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Redis error", undefined, { response: errorText });
        
        if (this.config.failClosed) {
          return {
            allowed: false,
            remaining: 0,
            reset: now + this.config.windowSeconds * 1000,
            count: -1,
            error: 'Rate limiter error',
            fallback: true,
          };
        }
        
        return {
          allowed: true,
          remaining: this.config.limit,
          reset: now + this.config.windowSeconds * 1000,
          count: 0,
          fallback: true,
        };
      }

      const results = await response.json();
      const count = results[2]?.result ?? 0;
      const remaining = Math.max(0, this.config.limit - count);
      const allowed = count <= this.config.limit;

      log.info("Rate limit check", { operation: this.config.operation, count, limit: this.config.limit, allowed });

      // Log security event if rate limit exceeded
      if (!allowed && this.config.logSecurityEvent && supabaseAdmin) {
        await logSecurityEvent(supabaseAdmin, {
          event_type: SECURITY_EVENTS.RATE_LIMIT_EXCEEDED,
          severity: 'MEDIUM',
          user_id: ctx.userId,
          tenant_id: ctx.tenantId,
          ip_address: ctx.ipAddress,
          user_agent: ctx.userAgent,
          operation: this.config.operation,
          metadata: {
            count,
            limit: this.config.limit,
            windowSeconds: this.config.windowSeconds,
            key,
          },
        });
      }

      return {
        allowed,
        remaining,
        reset: now + this.config.windowSeconds * 1000,
        count,
      };
    } catch (error) {
      log.error("Rate limit check error", error);
      
      if (this.config.failClosed) {
        return {
          allowed: false,
          remaining: 0,
          reset: now + this.config.windowSeconds * 1000,
          count: -1,
          error: String(error),
          fallback: true,
        };
      }
      
      return {
        allowed: true,
        remaining: this.config.limit,
        reset: now + this.config.windowSeconds * 1000,
        count: 0,
        fallback: true,
      };
    }
  }

  /**
   * Get standard rate limit headers
   */
  getHeaders(result: SecureRateLimitResult): Record<string, string> {
    return {
      "X-RateLimit-Limit": this.config.limit.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": Math.floor(result.reset / 1000).toString(),
    };
  }

  /**
   * Create 429 Too Many Requests response (A07 Envelope)
   */
  tooManyRequestsResponse(
    result: SecureRateLimitResult,
    corsHeaders: Record<string, string>,
    correlationId?: string,
  ): Response {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    const envelope = buildErrorEnvelope(
      ERROR_CODES.RATE_LIMITED,
      "system.rate_limited",
      true,
      undefined,
      correlationId,
    );
    return errorResponse(429, envelope, {
      ...corsHeaders,
      ...this.getHeaders(result),
      "Retry-After": retryAfter.toString(),
    });
  }
}

/**
 * Pre-configured rate limiters for sensitive operations
 */
export const SecureRateLimitPresets = {
  /** Role management: 20 per hour per user */
  grantRoles: () => new SecureRateLimiter({
    operation: "grant-roles",
    limit: 20,
    windowSeconds: 3600,
  }),

  /** Role revocation: 20 per hour per user */
  revokeRoles: () => new SecureRateLimiter({
    operation: "revoke-roles",
    limit: 20,
    windowSeconds: 3600,
  }),

  /** Tenant onboarding: 5 per hour per tenant */
  completeOnboarding: () => new SecureRateLimiter({
    operation: "complete-onboarding",
    limit: 5,
    windowSeconds: 3600,
  }),

  /** Membership approval: 50 per hour per admin */
  approveMembership: () => new SecureRateLimiter({
    operation: "approve-membership",
    limit: 50,
    windowSeconds: 3600,
  }),

  /** Membership rejection: 50 per hour per admin */
  rejectMembership: () => new SecureRateLimiter({
    operation: "reject-membership",
    limit: 50,
    windowSeconds: 3600,
  }),

  /** Impersonation: 10 per hour per superadmin (default) */
  startImpersonation: () => new SecureRateLimiter({
    operation: "start-impersonation",
    limit: 10,
    windowSeconds: 3600,
  }),

  /** Impersonation elevated: 100 per hour for SUPERADMIN_GLOBAL */
  startImpersonationElevated: () => new SecureRateLimiter({
    operation: "start-impersonation-elevated",
    limit: 100,
    windowSeconds: 3600,
  }),

  /** Login attempts: 10 per 15 minutes per IP */
  login: () => new SecureRateLimiter({
    operation: "login",
    limit: 10,
    windowSeconds: 900,
  }),

  /** Password reset: 5 per hour per email */
  passwordReset: () => new SecureRateLimiter({
    operation: "password-reset",
    limit: 5,
    windowSeconds: 3600,
  }),

  /** Admin create user: 10 per hour per admin */
  adminCreateUser: () => new SecureRateLimiter({
    operation: "admin-create-user",
    limit: 10,
    windowSeconds: 3600,
  }),

  /** Publish bracket: 20 per hour per admin */
  publishBracket: () => new SecureRateLimiter({
    operation: "publish-bracket",
    limit: 20,
    windowSeconds: 3600,
  }),

  /** Generate bracket: 20 per hour per admin */
  generateBracket: () => new SecureRateLimiter({
    operation: "generate-bracket",
    limit: 20,
    windowSeconds: 3600,
  }),

  /** Record match result: 100 per hour per admin */
  recordMatch: () => new SecureRateLimiter({
    operation: "record-match",
    limit: 100,
    windowSeconds: 3600,
  }),

  /** Verify document (public): 60 per minute per IP, fail-open */
  verifyDocument: () => new SecureRateLimiter({
    operation: "verify-document",
    limit: 60,
    windowSeconds: 60,
    failClosed: false,
  }),

  /** Create subscription: 5 per hour per user */
  createSubscription: () => new SecureRateLimiter({
    operation: "create-subscription",
    limit: 5,
    windowSeconds: 3600,
  }),

  /** Create tenant admin: 5 per hour per user */
  createTenantAdmin: () => new SecureRateLimiter({
    operation: "create-tenant-admin",
    limit: 5,
    windowSeconds: 3600,
  }),

  /** Billing control: 10 per hour per superadmin */
  billingControl: () => new SecureRateLimiter({
    operation: "billing-control",
    limit: 10,
    windowSeconds: 3600,
  }),

  /** Membership checkout: 10 per hour per user */
  membershipCheckout: () => new SecureRateLimiter({
    operation: "membership-checkout",
    limit: 10,
    windowSeconds: 3600,
  }),

  /** End impersonation: 20 per hour per superadmin */
  endImpersonation: () => new SecureRateLimiter({
    operation: "end-impersonation",
    limit: 20,
    windowSeconds: 3600,
  }),

  /** Tenant customer portal: 10 per hour per user */
  tenantCustomerPortal: () => new SecureRateLimiter({
    operation: "tenant-customer-portal",
    limit: 10,
    windowSeconds: 3600,
  }),

  /** Export athlete data (LGPD): 5 per hour per user — PII data, strict */
  exportAthleteData: () => new SecureRateLimiter({
    operation: "export-athlete-data",
    limit: 5,
    windowSeconds: 3600,
  }),

  /** Import athletes (bulk): 5 per hour per admin — expensive operation */
  importAthletes: () => new SecureRateLimiter({
    operation: "import-athletes",
    limit: 5,
    windowSeconds: 3600,
  }),

  /** Assign/revoke athlete badge: 100 per hour per admin */
  assignRevokeBadge: () => new SecureRateLimiter({
    operation: "assign-revoke-badge",
    limit: 100,
    windowSeconds: 3600,
  }),

  /** Audit tools (RLS, billing consistency): 10 per hour per superadmin */
  auditTool: () => new SecureRateLimiter({
    operation: "audit-tool",
    limit: 10,
    windowSeconds: 3600,
  }),
};

/**
 * Utility to extract IP from request
 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Build rate limit context from request
 */
export function buildRateLimitContext(
  req: Request,
  userId?: string | null,
  tenantId?: string | null
): RateLimitContext {
  const { ip_address, user_agent } = extractRequestContext(req);
  return {
    userId,
    tenantId,
    ipAddress: ip_address,
    userAgent: user_agent,
  };
}
