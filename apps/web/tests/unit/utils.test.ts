import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelativeTime } from "@/lib/utils";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns minutes for recent timestamps", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
    expect(formatRelativeTime(twoMinutesAgo)).toContain("minute");
  });

  it("returns days for older timestamps", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toContain("day");
  });
});


