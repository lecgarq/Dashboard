import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { RolesByProject } from "./components/RolesByProject";
import type { ProjectRoleRow } from "./projectFilter";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const view = await loadInstanceView();
  // Slim per-membership rows: just enough for the client to filter by project
  // and re-bucket roles. Everything else in the instance view is dropped.
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
  }));
  return (
    // The dashboard <main> is fixed-height + overflow-hidden, so this page owns
    // its own vertical scroll. Background comes from the themed layout/body.
    <div className="h-full overflow-y-auto text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
            ACC · Access
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Access Analysis
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Role distribution across user–project memberships. Search and tick projects to focus the donut.
          </p>
        </header>
        <RolesByProject rows={rows} />
      </div>
    </div>
  );
}
