/**
 * `formatBytes` — the one PERM-01 formatting helper kept after the 20.1-06
 * panel-semantic pivot (PermissionFootprintChart, its summarize function, and
 * the byte-sized headline chart are removed; permission volume by level now
 * counts folder-permission grants, never bytes). Retained per the phase's
 * locked decision for any future byte-sized drill detail. No React/DOM/IO —
 * safe on both server and client.
 */

/** Human-readable byte string, e.g. "42.3 GB". B/KB/MB/GB/TB boundaries, 1024-based. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
