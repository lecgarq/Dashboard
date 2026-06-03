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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <h1 className="text-lg font-semibold text-zinc-100">Access Analysis</h1>
        <RolesByProject rows={rows} />
      </div>
    </div>
  );
}
