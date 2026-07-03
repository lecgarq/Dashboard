import { describe, expect, it } from "vitest";
import { bucketSignInRecency, summarizeSignInRecency, RECENCY_BANDS } from "../signInRecencyCounts";
import type { SignInRecencyRow } from "@/lib/server/signInRecencyView";

const NOW = Date.parse("2026-07-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

describe("bucketSignInRecency", () => {
  it("buckets null/undefined as Never signed in", () => {
    expect(bucketSignInRecency(null, NOW)).toBe("Never signed in");
    expect(bucketSignInRecency(undefined, NOW)).toBe("Never signed in");
  });

  it("buckets an unparseable date as Never signed in", () => {
    expect(bucketSignInRecency("not-a-date", NOW)).toBe("Never signed in");
  });

  it("29d -> <30d, 31d -> 30–90d (boundary at 30 days)", () => {
    expect(bucketSignInRecency(daysAgo(29), NOW)).toBe("<30d");
    expect(bucketSignInRecency(daysAgo(31), NOW)).toBe("30–90d");
  });

  it("89d -> 30–90d, 91d -> 90–365d (boundary at 90 days)", () => {
    expect(bucketSignInRecency(daysAgo(89), NOW)).toBe("30–90d");
    expect(bucketSignInRecency(daysAgo(91), NOW)).toBe("90–365d");
  });

  it("364d -> 90–365d, 366d -> >365d (boundary at 365 days)", () => {
    expect(bucketSignInRecency(daysAgo(364), NOW)).toBe("90–365d");
    expect(bucketSignInRecency(daysAgo(366), NOW)).toBe(">365d");
  });
});

describe("summarizeSignInRecency", () => {
  function row(overrides: Partial<SignInRecencyRow>): SignInRecencyRow {
    return { projectId: "p1", name: "User", company: "Co", lastSignIn: null, ...overrides };
  }

  it("keeps all 5 bands present with zero counts when a band is empty", () => {
    const summary = summarizeSignInRecency([row({ lastSignIn: null })], NOW);
    expect(summary.bands.map((b) => b.band)).toEqual([...RECENCY_BANDS]);
    const byBand = new Map(summary.bands.map((b) => [b.band, b.count]));
    expect(byBand.get("Never signed in")).toBe(1);
    expect(byBand.get("<30d")).toBe(0);
    expect(byBand.get("30–90d")).toBe(0);
    expect(byBand.get("90–365d")).toBe(0);
    expect(byBand.get(">365d")).toBe(0);
  });

  it("never drops a row — total of band counts === rows.length", () => {
    const rows = [
      row({ lastSignIn: daysAgo(5) }),
      row({ lastSignIn: daysAgo(60) }),
      row({ lastSignIn: daysAgo(200) }),
      row({ lastSignIn: daysAgo(500) }),
      row({ lastSignIn: null }),
      row({ lastSignIn: null }),
    ];
    const summary = summarizeSignInRecency(rows, NOW);
    const total = summary.bands.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(rows.length);
    expect(summary.usersByBand.get("Never signed in")).toHaveLength(2);
  });

  it("sorts dated-band drill rows oldest-first (most dormant at top)", () => {
    const rows = [
      row({ name: "Recent", lastSignIn: daysAgo(310) }),
      row({ name: "Oldest", lastSignIn: daysAgo(360) }),
      row({ name: "Middle", lastSignIn: daysAgo(340) }),
    ];
    const summary = summarizeSignInRecency(rows, NOW);
    const drill = summary.usersByBand.get("90–365d")!;
    expect(drill.map((d) => d.name)).toEqual(["Oldest", "Middle", "Recent"]);
  });

  it("keeps Never signed in rows in stable input order", () => {
    const rows = [
      row({ name: "A", lastSignIn: null }),
      row({ name: "B", lastSignIn: null }),
      row({ name: "C", lastSignIn: null }),
    ];
    const summary = summarizeSignInRecency(rows, NOW);
    expect(summary.usersByBand.get("Never signed in")!.map((d) => d.name)).toEqual(["A", "B", "C"]);
  });
});
