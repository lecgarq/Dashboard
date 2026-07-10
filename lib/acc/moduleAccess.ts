import { moduleLabelById } from "./moduleCatalog";
import type { ModuleId } from "./accessInstanceTypes";

export interface ModuleAccessSlice {
  id: ModuleId;
  name: string;
  userCount: number;
  users: string[]; // member names provisioned for this module
  roles: string[]; // distinct roles among those members
}

export interface ModuleAccessSummary {
  /** One slice per module ≥1 member has, sorted by member count desc. */
  slices: ModuleAccessSlice[];
  /** Sum of slice user counts (module-grants across members). */
  total: number;
  /** Members considered (the 19). */
  memberCount: number;
  /** False when no member carries any module — drives the empty state. */
  hasData: boolean;
}

/**
 * Which ACC modules the template's project members are provisioned for. Each
 * member is counted once per module; `users`/`roles` carry the breakdown for the
 * chart tooltip. `modules` is empty until the owner fills it in the roster.
 */
export function summarizeModuleAccess(
  members: ReadonlyArray<{ name: string; role: string; modules?: ModuleId[] }>,
): ModuleAccessSummary {
  const acc = new Map<ModuleId, { users: string[]; roles: Set<string> }>();
  for (const m of members) {
    for (const id of m.modules ?? []) {
      const e = acc.get(id) ?? { users: [], roles: new Set<string>() };
      e.users.push(m.name);
      if (m.role) e.roles.add(m.role);
      acc.set(id, e);
    }
  }
  const slices: ModuleAccessSlice[] = [...acc.entries()]
    .map(([id, e]) => ({
      id,
      name: moduleLabelById(id),
      userCount: e.users.length,
      users: e.users,
      roles: [...e.roles],
    }))
    .sort((a, b) => b.userCount - a.userCount || a.name.localeCompare(b.name));
  const total = slices.reduce((s, x) => s + x.userCount, 0);
  return { slices, total, memberCount: members.length, hasData: slices.length > 0 };
}
