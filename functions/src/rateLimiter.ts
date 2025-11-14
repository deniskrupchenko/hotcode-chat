import { HttpsError } from "firebase-functions/v2/https";

type RateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
};

type Bucket = {
  count: number;
  expiresAt: number;
};

const buckets = new Map<string, Bucket>();

export const assertRateLimit = (key: string, options: RateLimiterOptions) => {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + options.windowMs });
    return;
  }

  if (existing.count >= options.maxRequests) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many requests. Please retry in a few moments."
    );
  }

  existing.count += 1;
  buckets.set(key, existing);
};

export const resetRateLimiter = () => {
  buckets.clear();
};


