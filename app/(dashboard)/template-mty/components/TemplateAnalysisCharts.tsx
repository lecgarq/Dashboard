// app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
"use client";
import { RolesPieChart } from "@/app/(dashboard)/access-analysis/components/RolesPieChart";
import { FolderPermissionTerrain } from "@/app/(dashboard)/access-analysis/components/FolderPermissionTerrain";
import { loadTemplateTerrain } from "../templateTerrainActions";
import type { FolderTerrainData, TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { TemplateOverview } from "@/lib/server/templateView";
import type { PermissionAccessSummary } from "../permissionAccess";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";
import { PermissionAccessChart } from "./PermissionAccessChart";
import { ModuleAccessChart } from "./ModuleAccessChart";
import { RolePermissionTree } from "./RolePermissionTree";
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
  overview, terrain, terrainOption, permissionAccess, roleTree,
}: {
  overview: TemplateOverview;
  terrain: FolderTerrainData | null;
  terrainOption: TerrainProjectOption;
  permissionAccess: PermissionAccessSummary;
  roleTree: RoleTreeNode[];
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
        <SectionHeader title="Folder access by tier" subtitle="Which roles — and how many of the members in them — hold each folder permission tier." />
        <PermissionAccessChart summary={permissionAccess} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="ACC module access" subtitle="Which ACC modules the template's members are provisioned for." />
        <ModuleAccessChart summary={overview.moduleSummary} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Folder permission terrain" subtitle="Every folder (2nd level down) whose permissions are explicitly changed from its parent — inherited folders excluded. Colour = permission tier, height = members in that role. Drag to orbit, scroll to zoom, hover a bar for the folder." />
        <FolderPermissionTerrain
          projects={[terrainOption]}
          initial={terrain}
          loadTerrain={loadTemplateTerrain}
          singleProject
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Role access tree" subtitle="What each role can reach — expand a role to see every folder it holds permissions on, grouped by permission tier." />
        <RolePermissionTree nodes={roleTree} />
      </section>
    </div>
  );
}
