// app/(dashboard)/template-mty/page.tsx
import { loadTemplateOverview, loadTemplatePermissionAccess } from "@/lib/server/templateView";
import { loadTemplateFolderTerrain } from "@/lib/server/templateFolderTerrain";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import type { TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import { TemplateAnalysisCharts } from "./components/TemplateAnalysisCharts";

export const metadata = { title: "Template MTY" };
export const dynamic = "force-dynamic";

export default async function TemplateMtyRoute() {
  const [overview, terrain, permissionAccess] = await Promise.all([
    loadTemplateOverview(),
    loadTemplateFolderTerrain(),
    loadTemplatePermissionAccess(),
  ]);

  const terrainOption: TerrainProjectOption = {
    id: TEMPLATE_MTY_ID,
    name: TEMPLATE_MTY_NAME,
    office: terrain?.office ?? "",
    folderCount: terrain?.folders.length ?? 0,
    permCount: terrain?.cells.length ?? 0,
    userRoleCount: terrain?.maxUserCount ?? 0,
  };

  return (
    <div className="h-full overflow-y-auto text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
            ACC · Template Analysis
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{TEMPLATE_MTY_NAME}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Members, roles, folder access, and module provisioning for the ACC Template MTY project template.
          </p>
        </header>

        <TemplateAnalysisCharts
          overview={overview}
          terrain={terrain}
          terrainOption={terrainOption}
          permissionAccess={permissionAccess}
        />
      </div>
    </div>
  );
}
