/**
 * Tiny relative-time formatter for the "issues extracted N ago" freshness chip.
 * Takes an explicit `now` so it is deterministic and unit testable.
 */
export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";

  const sec = Math.floor((now - t) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [60, "hour"],
    [24, "day"],
    [30, "month"],
    [12, "year"],
  ];
  let value = sec;
  let unit = "second";
  for (const [size, name] of units) {
    if (value < size) break;
    value = Math.floor(value / size);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

/** Short absolute date for tooltips, e.g. "2026-06-08 17:35". */
export function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "unknown";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
