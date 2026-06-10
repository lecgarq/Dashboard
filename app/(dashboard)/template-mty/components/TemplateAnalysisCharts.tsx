// app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
"use client";
import { RolesPieChart } from "@/app/(dashboard)/access-analysis/components/RolesPieChart";
import { FolderPermissionTerrain } from "@/app/(dashboard)/access-analysis/components/FolderPermissionTerrain";
import { loadTerrainForProject } from "@/app/(dashboard)/access-analysis/folderTerrainActions";
import type { FolderTerrainData, TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { TemplateOverview } from "@/lib/server/templateView";
import { AccessLevelPieChart } from "./AccessLevelPieChart";
import { TemplateMembersTable } from "./TemplateMembersTable";

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function TemplateAnalysisCharts({
  overview, terrain, terrainOption,
}: {
  overview: TemplateOverview;
  terrain: FolderTerrainData | null;
  terrainOption: TerrainProjectOption;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">Template</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.memberCount}</b> members</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.adminCount}</b> admins</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.distinctRoles}</b> roles</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.companyCount}</b> companies</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5">roster updated {overview.updatedAt}</span>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Project members" subtitle="The roster that projects created from this template inherit — with each member's role, company, and access level." />
        <TemplateMembersTable members={overview.members} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across the template's member roster." />
        <RolesPieChart data={overview.roleSummary.slices} distinctRoles={overview.distinctRoles} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Access levels" subtitle="Project Admins vs Project Members across the roster." />
        <AccessLevelPieChart slices={overview.accessLevels} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Folder permission terrain" subtitle="Each Level-2 folder × role, coloured by permission tier and raised by users in that role." />
        <FolderPermissionTerrain
          projects={[terrainOption]}
          initial={terrain}
          loadTerrain={loadTerrainForProject}
          singleProject
        />
      </section>
    </div>
  );
}
