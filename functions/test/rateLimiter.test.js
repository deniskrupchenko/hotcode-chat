"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rateLimiter_1 = require("../src/rateLimiter");
const ai_1 = require("../src/ai");
(0, vitest_1.describe)("rateLimiter", () => {
    (0, vitest_1.it)("allows requests under the threshold", () => {
        (0, rateLimiter_1.resetRateLimiter)();
        (0, vitest_1.expect)(() => {
            (0, rateLimiter_1.assertRateLimit)("user-1", { windowMs: 1_000, maxRequests: 2 });
            (0, rateLimiter_1.assertRateLimit)("user-1", { windowMs: 1_000, maxRequests: 2 });
        }).not.toThrow();
    });
    (0, vitest_1.it)("throws once the threshold is exceeded", () => {
        (0, rateLimiter_1.resetRateLimiter)();
        (0, vitest_1.expect)(() => {
            (0, rateLimiter_1.assertRateLimit)("user-2", { windowMs: 1_000, maxRequests: 1 });
            (0, rateLimiter_1.assertRateLimit)("user-2", { windowMs: 1_000, maxRequests: 1 });
        }).toThrowError(/Too many requests/);
    });
});
(0, vitest_1.describe)("moderateContent", () => {
    (0, vitest_1.it)("blocks messages containing restricted terms", async () => {
        const result = await (0, ai_1.moderateContent)("This looks like phishing.");
        (0, vitest_1.expect)(result.approved).toBe(false);
    });
    (0, vitest_1.it)("approves safe messages", async () => {
        const result = await (0, ai_1.moderateContent)("Hello team, let's sync later.");
        (0, vitest_1.expect)(result.approved).toBe(true);
    });
});
