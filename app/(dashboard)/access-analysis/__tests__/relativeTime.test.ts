import { describe, it, expect } from "vitest";
import { formatRelativeTime, formatAbsolute } from "../relativeTime";

const NOW = Date.parse("2026-06-08T18:00:00.000Z");

describe("formatRelativeTime", () => {
  it("renders coarse buckets with singular/plural", () => {
    expect(formatRelativeTime("2026-06-08T17:59:30.000Z", NOW)).toBe("just now");
    expect(formatRelativeTime("2026-06-08T17:59:00.000Z", NOW)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-06-08T17:30:00.000Z", NOW)).toBe("30 minutes ago");
    expect(formatRelativeTime("2026-06-08T17:00:00.000Z", NOW)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-06-06T18:00:00.000Z", NOW)).toBe("2 days ago");
  });

  it("is null/garbage safe", () => {
    expect(formatRelativeTime(null, NOW)).toBe("unknown");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("unknown");
  });

  it("treats future timestamps as just now", () => {
    expect(formatRelativeTime("2026-06-08T18:05:00.000Z", NOW)).toBe("just now");
  });
});

describe("formatAbsolute", () => {
  it("formats to local YYYY-MM-DD HH:mm", () => {
    // Exact value depends on the runner TZ; assert the shape instead.
    expect(formatAbsolute("2026-06-08T17:35:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatAbsolute(null)).toBe("unknown");
  });
});
