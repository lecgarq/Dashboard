import { categorize, type ActivityCategory } from "./activityCategories";

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
}

export function foldActivityRows(rows: readonly RawActivityGroupRow[]): Map<string, InstanceActivity> {
  const out = new Map<string, InstanceActivity>();
  for (const r of rows) {
    const key = `${r.userEmail.toLowerCase()}::${r.projectId}`;
    const cur = out.get(key) ?? { mix: {}, total: 0, lastActivity: null };
    const cat = categorize(r.rawAction);
    cur.mix[cat] = (cur.mix[cat] ?? 0) + r.count;
    cur.total += r.count;
    const iso = new Date(r.lastCreatedAt).toISOString();
    if (cur.lastActivity === null || iso > cur.lastActivity) cur.lastActivity = iso;
    out.set(key, cur);
  }
  return out;
}
