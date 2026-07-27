import { describe, it, expect } from "vitest";
import {
  describeRosterAge,
  ROSTER_AGING_DAYS,
  ROSTER_STALE_DAYS,
} from "@/lib/acc/rosterFreshness";

const CAPTURED = "2026-06-10";
const at = (days: number) => Date.parse(CAPTURED) + days * 86_400_000;

describe("describeRosterAge", () => {
  it("reports capture day as fresh", () => {
    const age = describeRosterAge(CAPTURED, at(0));
    expect(age).toMatchObject({ days: 0, tone: "fresh", ageLabel: "captured today" });
  });

  it("ages in whole days and switches tone at the thresholds", () => {
    expect(describeRosterAge(CAPTURED, at(1)).ageLabel).toBe("1 day old");
    expect(describeRosterAge(CAPTURED, at(ROSTER_AGING_DAYS - 1)).tone).toBe("fresh");
    expect(describeRosterAge(CAPTURED, at(ROSTER_AGING_DAYS)).tone).toBe("aging");
    expect(describeRosterAge(CAPTURED, at(ROSTER_STALE_DAYS - 1)).tone).toBe("aging");
    expect(describeRosterAge(CAPTURED, at(ROSTER_STALE_DAYS)).tone).toBe("stale");
  });

  it("switches to months past 60 days so the label stays readable", () => {
    expect(describeRosterAge(CAPTURED, at(59)).ageLabel).toBe("59 days old");
    expect(describeRosterAge(CAPTURED, at(60)).ageLabel).toBe("2 months old");
    expect(describeRosterAge(CAPTURED, at(400)).ageLabel).toBe("13 months old");
  });

  // A clock skewed behind the capture date must not render as "-3 days old".
  it("clamps a future capture date to zero without going fresh-negative", () => {
    const age = describeRosterAge(CAPTURED, at(-5));
    expect(age.days).toBe(0);
    expect(age.tone).toBe("fresh");
  });

  // An unreadable date is not evidence of freshness.
  it("treats an unparseable capture date as stale", () => {
    const age = describeRosterAge("not-a-date", Date.parse(CAPTURED));
    expect(age.tone).toBe("stale");
    expect(age.ageLabel).toBe("capture date unknown");
  });
});
