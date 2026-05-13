import { describe, it, expect } from "vitest";
import { pickHeadlineEvent, type RankableEvent } from "./headlineEventPicker";

const windowEnd = new Date("2026-05-13T00:00:00.000Z");
const windowStart = new Date("2026-04-13T00:00:00.000Z");

describe("pickHeadlineEvent", () => {
  it("returns null on empty input", () => {
    expect(pickHeadlineEvent([], "admin", windowStart, windowEnd)).toBeNull();
  });

  it("picks the highest-severity event when recency is equal", () => {
    const events: RankableEvent[] = [
      { rawAction: "role.change", newRole: "projectAdmin", occurredAt: windowEnd, subjectEmail: "a@x", subjectAutodeskId: "1", projectId: "p1" },
      { rawAction: "role.change", newRole: "memberLead", occurredAt: windowEnd, subjectEmail: "b@x", subjectAutodeskId: "2", projectId: "p1" },
    ];
    const head = pickHeadlineEvent(events, "admin", windowStart, windowEnd);
    expect(head?.subjectEmail).toBe("a@x");
  });

  it("biases toward recent events when severities are equal", () => {
    const events: RankableEvent[] = [
      { rawAction: "user.added", newRole: null, occurredAt: windowStart, subjectEmail: "old@x", subjectAutodeskId: "1", projectId: null },
      { rawAction: "user.added", newRole: null, occurredAt: windowEnd, subjectEmail: "new@x", subjectAutodeskId: "2", projectId: null },
    ];
    const head = pickHeadlineEvent(events, "membership", windowStart, windowEnd);
    expect(head?.subjectEmail).toBe("new@x");
  });

  it("formats the headline string with subject and date", () => {
    const events: RankableEvent[] = [
      { rawAction: "role.change", newRole: "projectAdmin", occurredAt: new Date("2026-05-12T10:00:00Z"), subjectEmail: "marco@hermosillo.com", subjectAutodeskId: "1", projectId: "p1" },
    ];
    const head = pickHeadlineEvent(events, "admin", windowStart, windowEnd);
    expect(head?.headline).toContain("marco@hermosillo.com");
    expect(head?.headline.toLowerCase()).toContain("projectadmin");
  });
});
