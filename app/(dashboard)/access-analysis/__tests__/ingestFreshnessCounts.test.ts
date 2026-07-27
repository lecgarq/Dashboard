import { describe, expect, it } from "vitest";
import {
  STALE_THRESHOLD_HOURS,
  ingestStaleness,
  statusTone,
  formatRunDuration,
} from "../ingestFreshnessCounts";

describe("ingestStaleness", () => {
  const startedAt = "2026-07-01T00:00:00.000Z";
  const startedMs = Date.parse(startedAt);

  it("is fresh just under the 36h threshold (35.9h)", () => {
    const now = startedMs + 35.9 * 60 * 60 * 1000;
    const result = ingestStaleness(startedAt, now);
    expect(result.stale).toBe(false);
    expect(result.ageHours).toBeCloseTo(35.9, 5);
  });

  it("is stale just over the 36h threshold (36.1h)", () => {
    const now = startedMs + 36.1 * 60 * 60 * 1000;
    const result = ingestStaleness(startedAt, now);
    expect(result.stale).toBe(true);
    expect(result.ageHours).toBeCloseTo(36.1, 5);
  });

  it("is not stale exactly at the threshold boundary (36.0h)", () => {
    const now = startedMs + STALE_THRESHOLD_HOURS * 60 * 60 * 1000;
    const result = ingestStaleness(startedAt, now);
    expect(result.stale).toBe(false);
  });

  it("respects a custom threshold", () => {
    const now = startedMs + 10 * 60 * 60 * 1000;
    expect(ingestStaleness(startedAt, now, 5).stale).toBe(true);
    expect(ingestStaleness(startedAt, now, 20).stale).toBe(false);
  });
});

describe("statusTone", () => {
  it("maps success to positive", () => {
    expect(statusTone("success")).toEqual({ label: "success", tone: "positive" });
  });

  it("maps running to neutral with an 'in progress' label", () => {
    expect(statusTone("running")).toEqual({ label: "in progress", tone: "neutral" });
  });

  it("maps partial to caution", () => {
    expect(statusTone("partial")).toEqual({ label: "partial", tone: "caution" });
  });

  it("maps quarantined to caution", () => {
    expect(statusTone("quarantined")).toEqual({ label: "quarantined", tone: "caution" });
  });

  it("maps failed to negative", () => {
    expect(statusTone("failed")).toEqual({ label: "failed", tone: "negative" });
  });

  it("maps an unrecognized status to neutral with the raw label, never blank/crash", () => {
    expect(statusTone("quarantined-v2")).toEqual({ label: "quarantined-v2", tone: "neutral" });
  });
});

describe("formatRunDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatRunDuration("2026-07-02T18:00:00.000Z", "2026-07-02T19:23:00.000Z")).toBe("1h 23m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatRunDuration("2026-07-02T18:00:00.000Z", "2026-07-02T18:12:00.000Z")).toBe("12m");
  });

  it("returns 'in progress' when endedAt is null", () => {
    expect(formatRunDuration("2026-07-02T18:00:00.000Z", null)).toBe("in progress");
  });
});
