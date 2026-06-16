import "server-only";
import { db } from "@/server/db";

let cache: { at: number; names: string[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * The full company roster: every distinct `AccDcCompany.name`, cached 5 min
 * (mirrors the other access-analysis view loaders). Returns names verbatim —
 * tombstone (`"removed at …"`) filtering is the pure function's job
 * (summarizeDormantCompanies), so it stays testable.
 */
export async function loadCompanyRoster(force = false): Promise<string[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.names;
  const rows = await db.accDcCompany.findMany({ select: { name: true } });
  const names = [...new Set(rows.map((r) => r.name))].sort((a, b) => a.localeCompare(b));
  cache = { at: Date.now(), names };
  return names;
}
