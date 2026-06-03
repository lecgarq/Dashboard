const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

type DurationUnit = {
  label: string;
  ms: number;
};

const UNITS: DurationUnit[] = [
  { label: 'week', ms: WEEK_MS },
  { label: 'day', ms: DAY_MS },
  { label: 'hour', ms: HOUR_MS },
  { label: 'minute', ms: MINUTE_MS },
  { label: 'second', ms: SECOND_MS },
];

export function formatHumanDuration(ms: number): string {
  const roundedMs = Math.max(0, Math.round(ms / SECOND_MS) * SECOND_MS);
  if (roundedMs < SECOND_MS) return '0 seconds';

  const firstUnitIndex = UNITS.findIndex((unit) => roundedMs >= unit.ms);
  const primary = UNITS[firstUnitIndex];
  const secondary = UNITS[firstUnitIndex + 1];
  const primaryValue = Math.floor(roundedMs / primary.ms);
  const remainder = roundedMs - primaryValue * primary.ms;
  const parts = [formatUnit(primaryValue, primary.label)];

  if (secondary) {
    const secondaryValue = Math.floor(remainder / secondary.ms);
    if (secondaryValue > 0) {
      parts.push(formatUnit(secondaryValue, secondary.label));
    }
  }

  return parts.join(' ');
}

export interface EstimateExtractionTimingInput {
  startedAt: Date | null;
  endedAt: Date | null;
  quotaUsed: number;
  plannedRequests: number;
  now?: Date;
}

export interface ExtractionTiming {
  elapsedMs: number;
  remainingMs: number | null;
  elapsedLabel: string;
  remainingLabel: string | null;
  completionDurationLabel: string | null;
  completionTime: Date | null;
}

export function estimateExtractionTiming(
  input: EstimateExtractionTimingInput,
): ExtractionTiming {
  const now = input.now ?? new Date();
  if (!input.startedAt) {
    return {
      elapsedMs: 0,
      remainingMs: null,
      elapsedLabel: '0 seconds',
      remainingLabel: null,
      completionDurationLabel: null,
      completionTime: null,
    };
  }

  const end = input.endedAt ?? now;
  const elapsedMs = Math.max(0, end.getTime() - input.startedAt.getTime());
  const completedRequests = Math.max(0, input.quotaUsed);
  const plannedRequests = Math.max(0, input.plannedRequests);
  const remainingRequests = Math.max(0, plannedRequests - completedRequests);
  const msPerRequest =
    completedRequests > 0 ? elapsedMs / completedRequests : null;
  const remainingMs =
    msPerRequest !== null ? Math.round(msPerRequest * remainingRequests) : null;
  const completionTime =
    remainingMs !== null ? new Date(now.getTime() + remainingMs) : null;

  return {
    elapsedMs,
    remainingMs,
    elapsedLabel: formatHumanDuration(elapsedMs),
    remainingLabel:
      remainingMs !== null ? formatHumanDuration(remainingMs) : null,
    completionDurationLabel:
      remainingMs !== null ? formatHumanDuration(remainingMs) : null,
    completionTime,
  };
}

function formatUnit(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}
