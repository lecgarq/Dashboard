// app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/ui/animated-list";
import { RolesPieChart } from "@/app/(dashboard)/access-analysis/components/RolesPieChart";
import { FolderPermissionTerrain } from "@/app/(dashboard)/access-analysis/components/FolderPermissionTerrain";
import { loadTemplateTerrain } from "../templateTerrainActions";
import type { FolderTerrainData, TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { TemplateOverview } from "@/lib/server/templateView";
import type { PermissionAccessSummary } from "../permissionAccess";
import type { RoleTreeNode } from "@/lib/server/templateRoleTree";
import type { RoleSimilarityGraph as RoleSimilarityGraphData } from "../roleSimilarity";
import { PermissionAccessChart } from "./PermissionAccessChart";
import { ModuleAccessChart } from "./ModuleAccessChart";
import { RoleAccessPie } from "./RoleAccessPie";
import { RoleSimilarityGraph } from "./RoleSimilarityGraph";
import { TemplateMembersTable } from "./TemplateMembersTable";

// Lazy: keeps the heavy shared users-profile + tRPC chain out of the initial
// template-mty bundle — loads only once a member row is first clicked. Mirrors
// AccessAnalysisCharts' use of the same drawer.
const AuthorProfileDrawer = dynamic(
  () =>
    import("@/app/(dashboard)/access-analysis/components/AuthorProfileDrawer").then(
      (m) => m.AuthorProfileDrawer,
    ),
  { ssr: false },
);

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function TemplateAnalysisCharts({
  overview, terrain, terrainOption, permissionAccess, roleTree, roleSimilarity,
}: {
  overview: TemplateOverview;
  terrain: FolderTerrainData | null;
  terrainOption: TerrainProjectOption;
  permissionAccess: PermissionAccessSummary;
  roleTree: RoleTreeNode[];
  roleSimilarity: RoleSimilarityGraphData;
}) {
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
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

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Project members" subtitle="The roster that projects created from this template inherit — with each member's role, company, and access level." />
          <TemplateMembersTable
            members={overview.members}
            onSelectMember={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Role distribution" subtitle="Roles held across the template's member roster." />
          <RolesPieChart data={overview.roleSummary.slices} distinctRoles={overview.distinctRoles} />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Folder access by tier" subtitle="Which roles — and how many of the members in them — hold each folder permission tier." />
          <PermissionAccessChart summary={permissionAccess} />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="ACC module access" subtitle="Which ACC modules the template's members are provisioned for." />
          <ModuleAccessChart summary={overview.moduleSummary} />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Folder permission terrain" subtitle="Every folder (2nd level down) whose permissions are explicitly changed from its parent — inherited folders excluded. Colour = permission tier, height = members in that role. Drag to orbit, scroll to zoom, hover a bar for the folder." />
          <FolderPermissionTerrain
            projects={[terrainOption]}
            initial={terrain}
            loadTerrain={loadTemplateTerrain}
            singleProject
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Role access" subtitle="What each role can reach across the template's folders — slice size is the number of folders, coloured by the role's highest permission tier. Click a role for its tier breakdown." />
          <RoleAccessPie nodes={roleTree} />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Role similarity" subtitle="How alike the 29 roles are by their explicitly-set folder permissions — folders whose permissions differ from their parent (inherited folders excluded, the top Project Files folder included). Roles that grant the same folders at the same tiers are pulled together; clusters are effectively-interchangeable roles." />
          <RoleSimilarityGraph graph={roleSimilarity} />
        </section>
      </Reveal>

      {profileEmail && (
        <AuthorProfileDrawer email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}
    </div>
  );
}
