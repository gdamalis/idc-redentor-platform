/**
 * Bounded in-memory sliding-window rate limiter for `/api/predica/*` (`ICR-204`).
 *
 * Uses a bounded Map (evicting oldest entries past `maxKeys`) so unauthenticated
 * floods cannot exhaust memory or amplify MongoDB writes.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface SlidingWindowBucketConfig {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly maxKeys?: number;
}

export interface SlidingWindowLimiter {
  readonly check: (key: string, nowMs?: number) => RateLimitDecision;
  readonly record: (key: string, nowMs?: number) => RateLimitDecision;
  readonly consume: (key: string, nowMs?: number) => RateLimitDecision;
  readonly reset: () => void;
}

const DEFAULT_MAX_KEYS = 1_000;

export function createSlidingWindowLimiter(
  config: SlidingWindowBucketConfig,
): SlidingWindowLimiter {
  const maxKeys = config.maxKeys ?? DEFAULT_MAX_KEYS;
  const buckets = new Map<string, number[]>();

  function prune(key: string, nowMs: number): number[] {
    const cutoff = nowMs - config.windowMs;
    const existing = buckets.get(key);
    if (!existing || existing.length === 0) {
      return [];
    }
    const active = existing.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      buckets.delete(key);
    } else if (active.length !== existing.length) {
      buckets.set(key, active);
    }
    return active;
  }

  function evictIfNeeded(key: string): void {
    if (buckets.has(key)) return;
    while (buckets.size >= maxKeys) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }

  function computeDecision(
    active: readonly number[],
    nowMs: number,
  ): RateLimitDecision {
    if (active.length >= config.maxRequests) {
      const earliest = active[0] ?? nowMs;
      const retryMs = Math.max(1_000, earliest + config.windowMs - nowMs);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryMs / 1_000),
      };
    }
    return {
      allowed: true,
      remaining: config.maxRequests - active.length,
      retryAfterSeconds: 0,
    };
  }

  return {
    check(key, nowMs = Date.now()) {
      const active = prune(key, nowMs);
      return computeDecision(active, nowMs);
    },

    record(key, nowMs = Date.now()) {
      const active = prune(key, nowMs);
      evictIfNeeded(key);
      const next = [...active, nowMs];
      buckets.set(key, next);
      return computeDecision(next, nowMs);
    },

    consume(key, nowMs = Date.now()) {
      const active = prune(key, nowMs);
      if (active.length >= config.maxRequests) {
        return computeDecision(active, nowMs);
      }
      evictIfNeeded(key);
      const next = [...active, nowMs];
      buckets.set(key, next);
      return {
        allowed: true,
        remaining: config.maxRequests - next.length,
        retryAfterSeconds: 0,
      };
    },

    reset() {
      buckets.clear();
    },
  };
}

/** Max 20 failed auth attempts per client IP in a 15-minute window. */
export const FAILED_AUTH_LIMIT_CONFIG: SlidingWindowBucketConfig = {
  maxRequests: 20,
  windowMs: 15 * 60 * 1_000,
  maxKeys: 1_000,
};

/** Max 60 authenticated requests per minute across the predica ingest token. */
export const AUTHED_INGEST_LIMIT_CONFIG: SlidingWindowBucketConfig = {
  maxRequests: 60,
  windowMs: 60 * 1_000,
  maxKeys: 1_000,
};

export interface PredicaRateLimiters {
  readonly failedAuth: SlidingWindowLimiter;
  readonly authed: SlidingWindowLimiter;
}

export function createPredicaRateLimiters(): PredicaRateLimiters {
  return {
    failedAuth: createSlidingWindowLimiter(FAILED_AUTH_LIMIT_CONFIG),
    authed: createSlidingWindowLimiter(AUTHED_INGEST_LIMIT_CONFIG),
  };
}

export const defaultPredicaRateLimiters: PredicaRateLimiters =
  createPredicaRateLimiters();
