/**
 * PIPE-01 — pure staleness / status-tone / duration transforms for the ingest
 * freshness strip. No DB access; `now` is injected so staleness is deterministic
 * and unit-testable.
 */

/** ~1 ingest cycle (daily cron) + slack — aligned with the Ph19 staleness doc. */
export const STALE_THRESHOLD_HOURS = 36;

export interface IngestStaleness {
  stale: boolean;
  ageHours: number;
}

/** Age of the run (from startedAt) — run recency is what "fresh pipeline" means. */
export function ingestStaleness(
  startedAt: string,
  nowMs: number,
  thresholdHours: number = STALE_THRESHOLD_HOURS,
): IngestStaleness {
  const startedMs = Date.parse(startedAt);
  const ageHours = Number.isNaN(startedMs) ? Infinity : (nowMs - startedMs) / (1000 * 60 * 60);
  return { stale: ageHours > thresholdHours, ageHours };
}

export type StatusToneKind = "positive" | "caution" | "negative" | "neutral";

export interface StatusTone {
  label: string;
  tone: StatusToneKind;
}

// VERIFY: status is an open string; no central enum exists — observed:
// running/success/partial/failed/quarantined
export function statusTone(status: string): StatusTone {
  switch (status) {
    case "success":
      return { label: "success", tone: "positive" };
    case "running":
      return { label: "in progress", tone: "neutral" };
    case "partial":
      return { label: "partial", tone: "caution" };
    case "quarantined":
      return { label: "quarantined", tone: "caution" };
    case "failed":
      return { label: "failed", tone: "negative" };
    default:
      // Never blank, never crash — unrecognized values surface honestly.
      return { label: status, tone: "neutral" };
  }
}

/** "1h 23m" style duration, or "in progress" when the run has not ended. */
export function formatRunDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "in progress";
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs)) return "unknown";

  const totalMinutes = Math.max(0, Math.round((endedMs - startedMs) / (1000 * 60)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
