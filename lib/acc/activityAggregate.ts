import { categorize, type ActivityCategory } from "./activityCategories";
import { resolveActionId } from "@/app/(dashboard)/users/access-analysis/accTaxonomy";

export interface RawActivityGroupRow {
  userEmail: string;
  projectId: string;
  rawAction: string;
  count: number;
  lastCreatedAt: string; // ISO
}

export interface InstanceActivity {
  mix: Partial<Record<ActivityCategory, number>>;
  total: number;
  lastActivity: string | null;
  /** [Phase B] Sparse per-canonical-action counts for THIS instance (keyed by taxonomy id). */
  actionCounts?: Record<string, number>;
}

export function foldActivityRows(rows: readonly RawActivityGroupRow[]): Map<string, InstanceActivity> {
  const out = new Map<string, InstanceActivity>();
  for (const r of rows) {
    const key = `${r.userEmail.toLowerCase()}::${r.projectId}`;
    const cur = out.get(key) ?? { mix: {}, total: 0, lastActivity: null, actionCounts: {} };
    const cat = categorize(r.rawAction);
    cur.mix[cat] = (cur.mix[cat] ?? 0) + r.count;
    cur.total += r.count;
    const actionId = resolveActionId(r.rawAction);
    cur.actionCounts![actionId] = (cur.actionCounts![actionId] ?? 0) + r.count;
    const iso = new Date(r.lastCreatedAt).toISOString();
    if (cur.lastActivity === null || iso > cur.lastActivity) cur.lastActivity = iso;
    out.set(key, cur);
  }
  return out;
}

/** [Phase B] Account-level admin activity row (sourceFile='admin'); attributed to the ACTOR. */
export interface AdminActionRow {
  actorEmail: string;
  rawAction: string;
  count: number;
}

/** Fold admin rows into per-actor count maps: lowercased actorEmail -> { canonicalActionId: count }. */
export function foldAdminActionRows(rows: readonly AdminActionRow[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const actor = r.actorEmail.toLowerCase();
    const cur = out.get(actor) ?? {};
    const actionId = resolveActionId(r.rawAction);
    cur[actionId] = (cur[actionId] ?? 0) + r.count;
    out.set(actor, cur);
  }
  return out;
}
