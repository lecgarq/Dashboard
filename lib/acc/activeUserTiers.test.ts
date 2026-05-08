/**
 * Unit tests for bucketActiveUserTier — 7d / 30d / 90d / >90d / Never bucketing.
 *
 * Plan 04-03 Feature 2 (DASH-02).
 * Pitfall 4: lastSignIn may be null OR undefined OR a malformed string — all → "Never".
 */

import { describe, it, expect } from "vitest";
import { bucketActiveUserTier, ACTIVE_TIERS } from "./activeUserTiers";

const now = new Date("2026-05-08T00:00:00Z");

describe("bucketActiveUserTier — null / undefined / invalid", () => {
  it("null lastSignIn → Never", () => {
    expect(bucketActiveUserTier(null, now)).toBe("Never");
  });

  it("undefined lastSignIn → Never (Pitfall 4)", () => {
    expect(bucketActiveUserTier(undefined, now)).toBe("Never");
  });

  it("malformed date string → Never (defensive fallback)", () => {
    expect(bucketActiveUserTier("invalid-date-string", now)).toBe("Never");
  });
});

describe("bucketActiveUserTier — 7d boundary", () => {
  it("3 days ago → 7d", () => {
    expect(bucketActiveUserTier("2026-05-05T00:00:00Z", now)).toBe("7d");
  });

  it("7 days ago (boundary inclusive) → 7d", () => {
    expect(bucketActiveUserTier("2026-05-01T00:00:00Z", now)).toBe("7d");
  });
});

describe("bucketActiveUserTier — 30d boundary", () => {
  it("8 days ago → 30d", () => {
    expect(bucketActiveUserTier("2026-04-30T00:00:00Z", now)).toBe("30d");
  });

  it("30 days ago (boundary inclusive) → 30d", () => {
    expect(bucketActiveUserTier("2026-04-08T00:00:00Z", now)).toBe("30d");
  });
});

describe("bucketActiveUserTier — 90d boundary", () => {
  it("31 days ago → 90d", () => {
    expect(bucketActiveUserTier("2026-04-07T00:00:00Z", now)).toBe("90d");
  });

  it("90 days ago (boundary inclusive) → 90d", () => {
    expect(bucketActiveUserTier("2026-02-07T00:00:00Z", now)).toBe("90d");
  });
});

describe("bucketActiveUserTier — >90d", () => {
  it("91 days ago → >90d", () => {
    expect(bucketActiveUserTier("2026-02-06T00:00:00Z", now)).toBe(">90d");
  });

  it("365 days ago → >90d", () => {
    expect(bucketActiveUserTier("2025-05-08T00:00:00Z", now)).toBe(">90d");
  });
});

describe("ACTIVE_TIERS export", () => {
  it("is a 5-element readonly tuple in canonical order", () => {
    expect(ACTIVE_TIERS).toEqual(["7d", "30d", "90d", ">90d", "Never"]);
    expect(ACTIVE_TIERS.length).toBe(5);
  });
});
