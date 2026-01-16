/**
 * Rate Limiter Utility using Upstash Redis
 * 
 * Provides centralized rate limiting for edge functions.
 * Uses sliding window algorithm for accurate rate limiting.
 * 
 * Configuration:
 * - UPSTASH_REDIS_REST_URL: Upstash Redis REST API URL
 * - UPSTASH_REDIS_REST_TOKEN: Upstash Redis REST API Token
 * 
 * Usage:
 * ```typescript
 * import { RateLimiter, RateLimitConfig } from "../_shared/rate-limiter.ts";
 * 
 * const limiter = new RateLimiter({
 *   prefix: "password-reset",
 *   limit: 5,
 *   windowSeconds: 3600, // 1 hour
 * });
 * 
 * const { success, remaining, reset } = await limiter.check(identifier);
 * ```
 */

export interface RateLimitConfig {
  /** Prefix for Redis keys (e.g., "password-reset", "checkout") */
  prefix: string;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of remaining requests in the window */
  remaining: number;
  /** Unix timestamp when the window resets */
  reset: number;
  /** Current request count */
  count: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private redisUrl: string;
  private redisToken: string;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL") ?? "";
    this.redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") ?? "";
  }

  /**
   * Check if the identifier is rate limited
   * @param identifier - Unique identifier (IP, email, tenant_id, etc.)
   * @returns RateLimitResult with success status and metadata
   */
  async check(identifier: string): Promise<RateLimitResult> {
    // If Redis is not configured, allow all requests (fail-open)
    if (!this.redisUrl || !this.redisToken) {
      console.warn("[RATE-LIMITER] Redis not configured, allowing request");
      return {
        success: true,
        remaining: this.config.limit,
        reset: Date.now() + this.config.windowSeconds * 1000,
        count: 0,
      };
    }

    const key = `ratelimit:${this.config.prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowSeconds * 1000;

    try {
      // Use Upstash Redis REST API with sliding window
      // ZREMRANGEBYSCORE removes old entries, ZADD adds new, ZCARD counts
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
        console.error("[RATE-LIMITER] Redis error:", await response.text());
        // Fail-open on Redis errors
        return {
          success: true,
          remaining: this.config.limit,
          reset: now + this.config.windowSeconds * 1000,
          count: 0,
        };
      }

      const results = await response.json();
      const count = results[2]?.result ?? 0;
      const remaining = Math.max(0, this.config.limit - count);
      const success = count <= this.config.limit;

      console.log(`[RATE-LIMITER] ${this.config.prefix}:${identifier} - count: ${count}, limit: ${this.config.limit}, success: ${success}`);

      return {
        success,
        remaining,
        reset: now + this.config.windowSeconds * 1000,
        count,
      };
    } catch (error) {
      console.error("[RATE-LIMITER] Error:", error);
      // Fail-open on errors
      return {
        success: true,
        remaining: this.config.limit,
        reset: now + this.config.windowSeconds * 1000,
        count: 0,
      };
    }
  }

  /**
   * Get rate limit headers for response
   */
  getHeaders(result: RateLimitResult): Record<string, string> {
    return {
      "X-RateLimit-Limit": this.config.limit.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": Math.floor(result.reset / 1000).toString(),
    };
  }

  /**
   * Create a 429 Too Many Requests response
   */
  tooManyRequestsResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    return new Response(
      JSON.stringify({
        error: "Muitas requisições. Tente novamente mais tarde.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          ...this.getHeaders(result),
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
        },
      }
    );
  }
}

/**
 * Extract client IP from request headers
 * Works with Cloudflare, Vercel, and standard proxies
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
 * Pre-configured rate limiters for common use cases
 */
export const RateLimitPresets = {
  /** Password reset: 5 requests per hour per email */
  passwordReset: (email: string) =>
    new RateLimiter({
      prefix: "password-reset",
      limit: 5,
      windowSeconds: 3600,
    }),

  /** Login attempts: 10 per 15 minutes per IP */
  login: () =>
    new RateLimiter({
      prefix: "login",
      limit: 10,
      windowSeconds: 900,
    }),

  /** Checkout creation: 10 per hour per IP */
  checkout: () =>
    new RateLimiter({
      prefix: "checkout",
      limit: 10,
      windowSeconds: 3600,
    }),

  /** Generic API: 100 per minute per IP */
  api: () =>
    new RateLimiter({
      prefix: "api",
      limit: 100,
      windowSeconds: 60,
    }),
};
