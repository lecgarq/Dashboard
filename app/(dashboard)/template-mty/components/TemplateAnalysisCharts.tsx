// app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
"use client";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/ui/animated-list";
import { StatStrip } from "@/components/ui/stat-tile";
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
import { RoleOverviewSheet } from "./RoleOverviewSheet";
import { TemplateMembersTableShell } from "./TemplateMembersTableShell";

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
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-1 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-chart-1" />
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>
      </div>
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
  // Shared profile drill target (INT-01) — used by member-table rows and role-overview member rows
  const [profileEmail, setProfileEmail] = useState<string | null>(null);

  // Role overview drill state (TPL-02) — hoisted here so RoleOverviewSheet can
  // derive its data from already-loaded page props (NA-01: no new query).
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Derive role overview data from already-loaded page data (NA-01)
  const selectedRoleNode = useMemo(
    () => roleSimilarity.nodes.find((n) => n.roleId === selectedRoleId) ?? null,
    [roleSimilarity.nodes, selectedRoleId],
  );

  const selectedRoleTreeNode = useMemo(
    () => roleTree.find((n) => n.roleId === selectedRoleId) ?? null,
    [roleTree, selectedRoleId],
  );

  // Tier breakdown for the selected role from roleTree (folderCount per tier)
  const selectedRoleTiers = useMemo(() => {
    if (!selectedRoleTreeNode) return [];
    return selectedRoleTreeNode.tiers.map((t) => ({
      label: t.label,
      rank: t.rank,
      count: t.folders.length,
    }));
  }, [selectedRoleTreeNode]);

  // Members who hold the selected role — filtered from already-loaded overview.members
  const membersForRole = useMemo(() => {
    if (!selectedRoleNode) return [];
    return overview.members.filter(
      (m) => m.role === selectedRoleNode.roleName,
    );
  }, [overview.members, selectedRoleNode]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">Template</span>
          <span>Roster updated {overview.updatedAt}</span>
        </div>
        <StatStrip
          stats={[
            { label: "Members", value: overview.memberCount, accent: "primary" },
            { label: "Admins", value: overview.adminCount, accent: "seaweed" },
            { label: "Roles", value: overview.distinctRoles, accent: "wine" },
            { label: "Companies", value: overview.companyCount, accent: "goldenrod" },
          ]}
        />
      </div>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Project members" subtitle="The roster that projects created from this template inherit — with each member's role, company, and access level." />
          <TemplateMembersTableShell
            members={overview.members}
            onSelectMember={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Role distribution" subtitle="Roles held across the template's member roster." />
          <RolesPieChart
            data={overview.roleSummary.slices}
            distinctRoles={overview.distinctRoles}
            usersByRole={overview.roleSummary.usersByRole}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Folder access by tier" subtitle="Which roles — and how many of the members in them — hold each folder permission tier. Click a bar for the members behind it." />
          <PermissionAccessChart
            summary={permissionAccess}
            members={overview.members}
            onMemberClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="ACC module access" subtitle="Which ACC modules the template's members are provisioned for. Click a bar for the members behind it." />
          <ModuleAccessChart
            summary={overview.moduleSummary}
            members={overview.members}
            onMemberClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Folder permission terrain" subtitle="Every folder under Project Files, at any depth. Bright bars are folders whose permissions were deliberately changed from their parent; dimmed bars simply inherit. Colour = permission tier, height = members in that role. Drag to orbit, scroll to zoom, hover a bar for the folder." />
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
          <SectionHeader title="Role similarity" subtitle={`How alike the ${roleSimilarity.nodes.length} roles are by their explicitly-set folder permissions — folders whose permissions differ from their parent (inherited folders excluded, the top Project Files folder included). Roles that grant the same folders at the same tiers are pulled together; clusters are effectively-interchangeable roles.`} />
          <RoleSimilarityGraph
            graph={roleSimilarity}
            onNodeClick={(roleId) => setSelectedRoleId(roleId)}
          />
        </section>
      </Reveal>

      {/* Role overview drill sheet (TPL-02) — data derived from page props, no new query (NA-01) */}
      <RoleOverviewSheet
        open={!!selectedRoleId}
        onClose={() => setSelectedRoleId(null)}
        roleName={selectedRoleNode?.roleName ?? null}
        folderCount={selectedRoleNode?.folderCount ?? 0}
        tiers={selectedRoleTiers}
        members={membersForRole}
        onMemberClick={(email) => {
          // Close role sheet first, then open profile (single sheet visible — INT-01)
          setSelectedRoleId(null);
          setProfileEmail(email.toLowerCase());
        }}
      />

      {/* Shared profile drill target (INT-01) */}
      {profileEmail && (
        <AuthorProfileDrawer email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}
    </div>
  );
}
