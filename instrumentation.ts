/**
 * Next.js instrumentation hook — runs once per server process on startup.
 *
 * Keeps the ACC hot cache (the ~17k-user `accDcGraph.bulkUsers` snapshot) warm
 * so /users/spatial-graph and /users never pay the ~15-20s COLD query on first
 * navigation. Without this the cache only populates on-demand and expires after
 * ACC_HOT_CACHE_TTL_MS (10 min), so the first visitor after any idle gap eats
 * the full cold cost. We warm shortly after boot, then every 8 min (< TTL).
 *
 * (The /api/dev/prewarm-acc endpoint is dev+localhost only — 404 in production —
 *  so it cannot keep a real deployment warm; this hook does.)
 */
export async function register(): Promise<void> {
  // Prisma/DB access is node-only; never run in the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const warm = async (): Promise<void> => {
    try {
      const { db } = await import("@/server/db");
      const { prewarmAccHotCache } = await import("@/lib/server/acc-hot-cache");
      await prewarmAccHotCache(db);
    } catch (err) {
      // Best-effort: a failed warm just means the next request pays the cold cost.
      console.warn("[instrumentation] ACC hot-cache prewarm failed:", (err as Error).message);
    }
  };

  // Don't block startup — warm a few seconds after boot, then on an interval
  // safely under the 10-min TTL. unref() so the timer never keeps the process alive.
  setTimeout(() => void warm(), 5_000);
  const interval = setInterval(() => void warm(), 8 * 60_000);
  interval.unref?.();
}
