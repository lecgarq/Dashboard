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
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Ambient indigo glow bleeding from the top edge for depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(99,102,241,0.13),transparent_70%)]"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-400/80">
            ACC · Access
          </span>
          <h1 className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Access Analysis
          </h1>
          <p className="max-w-prose text-sm text-zinc-400">
            Role distribution across user–project memberships. Search and tick projects to focus the donut.
          </p>
        </header>
        <RolesByProject rows={rows} />
      </div>
    </div>
  );
}
