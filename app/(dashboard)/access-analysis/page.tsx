import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { loadModuleActivity } from "@/lib/server/moduleActivityView";
import { loadCoordinationByProject } from "@/lib/server/coordinationByProjectView";
import { AccessAnalysisCharts } from "./components/AccessAnalysisCharts";
import type { ProjectRoleRow } from "./projectFilter";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const [view, moduleRows, coordinationData] = await Promise.all([loadInstanceView(), loadModuleActivity(), loadCoordinationByProject()]);
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
            ACC · Access &amp; Activity
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Access Analysis
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Roles, module activity, and coordination issues across ACC projects.
            Tick projects once to focus all three panels below.
          </p>
        </header>
        <AccessAnalysisCharts roleRows={rows} moduleRows={moduleRows} coordinationData={coordinationData} />
      </div>
    </div>
  );
}
