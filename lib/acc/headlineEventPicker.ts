import type { ChangeStreamId, HeadlineEvent } from "./accessAnalysisTypes";

export interface RankableEvent {
  rawAction: string;
  newRole: string | null;
  occurredAt: Date;
  subjectEmail: string | null;
  subjectAutodeskId: string | null;
  projectId: string | null;
}

const SEVERITY: Record<string, number> = {
  "role.change:accountAdmin": 100,
  "role.change:projectAdmin": 60,
  "user.deactivated": 50,
  "user.added": 30,
  "user.removed": 25,
  "project.member.added": 20,
  "role.change": 15,
  "user.activated": 10,
};

function severityKey(e: RankableEvent): string {
  if (e.rawAction === "role.change" && e.newRole) {
    const key = `role.change:${e.newRole}`;
    if (SEVERITY[key] !== undefined) return key;
  }
  return e.rawAction;
}

function recencyWeight(occurredAt: Date, windowStart: Date, windowEnd: Date): number {
  const total = windowEnd.getTime() - windowStart.getTime();
  if (total <= 0) return 1.0;
  const elapsed = occurredAt.getTime() - windowStart.getTime();
  const ratio = Math.max(0, Math.min(1, elapsed / total));
  return 0.3 + 0.7 * ratio;
}

function formatHeadline(e: RankableEvent): string {
  const who = e.subjectEmail ?? e.subjectAutodeskId ?? "Unknown user";
  const date = e.occurredAt.toISOString().slice(0, 10);
  if (e.rawAction === "role.change" && e.newRole) {
    return `${who} was promoted to ${e.newRole} on ${date}`;
  }
  if (e.rawAction === "user.added") return `${who} was added on ${date}`;
  if (e.rawAction === "user.removed") return `${who} was removed on ${date}`;
  if (e.rawAction === "user.deactivated") return `${who} was deactivated on ${date}`;
  if (e.rawAction === "user.activated") return `${who} was reactivated on ${date}`;
  if (e.rawAction === "project.member.added") {
    return `${who} was added to a project on ${date}`;
  }
  return `${who}: ${e.rawAction} on ${date}`;
}

export function pickHeadlineEvent(
  events: RankableEvent[],
  stream: ChangeStreamId,
  windowStart: Date,
  windowEnd: Date,
): HeadlineEvent | null {
  if (events.length === 0) return null;
  let best: { event: RankableEvent; score: number } | null = null;
  for (const e of events) {
    const sev = SEVERITY[severityKey(e)] ?? 5;
    const score = sev * recencyWeight(e.occurredAt, windowStart, windowEnd);
    if (!best || score > best.score) best = { event: e, score };
  }
  if (!best) return null;
  return {
    stream,
    headline: formatHeadline(best.event),
    occurredAt: best.event.occurredAt.toISOString(),
    subjectAutodeskId: best.event.subjectAutodeskId,
    subjectEmail: best.event.subjectEmail,
    projectId: best.event.projectId,
    newRole: best.event.newRole,
    impactScore: best.score,
  };
}
