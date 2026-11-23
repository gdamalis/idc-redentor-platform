import { describe, expect, it } from "vitest";
import { createSlidingWindowLimiter } from "./rate-limit";

describe("createSlidingWindowLimiter", () => {
  it("allows up to maxRequests within window and blocks with positive retryAfterSeconds", () => {
    const limiter = createSlidingWindowLimiter({
      maxRequests: 3,
      windowMs: 10_000,
    });

    expect(limiter.consume("k", 1_000)).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
    });
    expect(limiter.consume("k", 2_000)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(limiter.consume("k", 3_000)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });

    const blocked = limiter.consume("k", 4_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(7); // earliest 1000 + 10000 - 4000 = 7000ms

    // After earliest expires (11_001 > 1_000 + 10_000)
    const afterExpiry = limiter.consume("k", 11_001);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(0);
  });

  it("evicts oldest keys when maxKeys is reached", () => {
    const limiter = createSlidingWindowLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      maxKeys: 2,
    });

    limiter.consume("ip-1", 1_000);
    limiter.consume("ip-2", 2_000);
    expect(limiter.check("ip-1", 3_000).allowed).toBe(false);

    // Adding ip-3 evicts ip-1
    limiter.consume("ip-3", 3_000);
    expect(limiter.check("ip-1", 4_000).allowed).toBe(true);
    expect(limiter.check("ip-2", 4_000).allowed).toBe(false);
    expect(limiter.check("ip-3", 4_000).allowed).toBe(false);
  });

  it("supports separate check() and record() for failed-auth tracking", () => {
    const limiter = createSlidingWindowLimiter({
      maxRequests: 2,
      windowMs: 30_000,
    });

    expect(limiter.check("ip", 1_000).allowed).toBe(true);
    expect(limiter.record("ip", 1_000).allowed).toBe(true);
    expect(limiter.record("ip", 2_000).allowed).toBe(false);
    expect(limiter.check("ip", 3_000).allowed).toBe(false);
  });
});
