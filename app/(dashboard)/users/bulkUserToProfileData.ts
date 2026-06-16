import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { AccProfileData, ProjectData } from "./AccProfileSection";

/**
 * Maps an in-memory synced BulkAccUser into the AccProfileData shape that
 * AccProfileFull renders. Pure — no I/O. Used so the profile panel can render
 * instantly from already-loaded bulk data instead of a per-click getAccProfile
 * round trip. Callers must only pass `found` users; they branch on `user.found`
 * and show a "not synced" state otherwise.
 */
export function bulkUserToProfileData(user: BulkAccUser): AccProfileData {
  const projects: ProjectData[] = user.projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    isAdmin: p.isAdmin,
    roles: p.roles,
    modules: p.modules,
    // ProjectData.addedOn is `string | undefined`; BulkAccProject.addedOn is
    // `string | null | undefined`. Normalize null → undefined.
    addedOn: p.addedOn ?? undefined,
  }));

  const status =
    user.aggregatedStatus ?? (user.activeCount > 0 ? "active" : "inactive");

  const role = user.isAccountAdmin
    ? "account_admin"
    : user.projectAdmin
      ? "project_admin"
      : undefined;

  return {
    found: true,
    status,
    name: user.name,
    syncedAt: user.syncedAt,
    role,
    company: user.companyName ?? undefined,
    photoUrl: user.photoUrl ?? undefined,
    costCenter: user.costCenter ?? undefined,
    addedOn: user.addedOn ?? undefined,
    lastSignIn: user.lastSignIn ?? undefined,
    projects,
  };
}
