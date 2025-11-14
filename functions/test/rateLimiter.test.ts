import { describe, expect, it } from "vitest";

import { assertRateLimit, resetRateLimiter } from "../src/rateLimiter";
import { moderateContent } from "../src/ai";

describe("rateLimiter", () => {
  it("allows requests under the threshold", () => {
    resetRateLimiter();
    expect(() => {
      assertRateLimit("user-1", { windowMs: 1_000, maxRequests: 2 });
      assertRateLimit("user-1", { windowMs: 1_000, maxRequests: 2 });
    }).not.toThrow();
  });

  it("throws once the threshold is exceeded", () => {
    resetRateLimiter();
    expect(() => {
      assertRateLimit("user-2", { windowMs: 1_000, maxRequests: 1 });
      assertRateLimit("user-2", { windowMs: 1_000, maxRequests: 1 });
    }).toThrowError(/Too many requests/);
  });
});

describe("moderateContent", () => {
  it("blocks messages containing restricted terms", async () => {
    const result = await moderateContent("This looks like phishing.");
    expect(result.approved).toBe(false);
  });

  it("approves safe messages", async () => {
    const result = await moderateContent("Hello team, let's sync later.");
    expect(result.approved).toBe(true);
  });
});


