"use client";

// Access breadth, heatmap/admin distribution, rankings, activity & risk, and the vgplot-clickable
// style block — moved verbatim from HybridAnalyticsSurface.tsx (SPLIT-04 Task 2).
import { HistogramPanel } from "./HistogramPanel";
import { DistributionPanel } from "./DistributionPanel";
import { HeatmapPanel } from "./HeatmapPanel";
import { AccessEventsChart } from "./AccessEventsChart";
import { ComplianceScanPanel } from "./ComplianceScanPanel";
import { PermissionRiskPanel } from "./PermissionRiskPanel";
import { SectionHeading, FallbackBarPanel } from "./hybridAnalyticsPanels";
import { ACCENTS, adminGrantFinding, toFallbackRows } from "./hybridAnalyticsTransforms";
import type { HybridAnalyticsViewProps } from "./HybridAnalyticsView";

export function HybridAnalyticsRankingsSection({
  viewModel,
  setDetailFilter,
  handleVgPlotClick,
}: HybridAnalyticsViewProps) {
  const {
    users,
    isReady,
    isFallback,
    usersSelection,
    projectsSelection,
    projectDistributionRows,
    findings,
    roleStatusRows,
    adminDistributionRows,
    topProjectRows,
    topRoleRows,
    topCompanyRows,
    queryState,
  } = viewModel;

  return (
    <>
      <SectionHeading title="Access breadth" />

      {isReady ? (
        <div onClick={(e) => handleVgPlotClick(e, "projects")} className="cursor-pointer vgplot-clickable">
          <DistributionPanel
            title="Projects per user"
            subtitle="Distribution of access breadth. The long tail on the right is your over-provisioned users."
            table="users"
            column="project_count"
            accent={ACCENTS.distribution}
            binStep={1}
            height={300}
            selection={usersSelection}
          />
        </div>
      ) : isFallback ? (
        <FallbackBarPanel
          title="Projects per user"
          subtitle="Local fallback distribution while DuckDB-Wasm is unavailable."
          rows={projectDistributionRows}
          accent={ACCENTS.distribution}
          finding={findings.projectBreadth}
          onRowClick={(row) => {
            setDetailFilter({
              title: `Users with ${row.label} Projects`,
              subtitle: `Detailed view of users who belong to ${row.label} projects.`,
              filterFn: (u) => {
                if (row.label === "10+") return u.projectCount >= 10;
                const num = parseInt(row.label, 10);
                return !isNaN(num) && u.projectCount === num;
              },
            });
          }}
        />
      ) : (
        <div className="h-[340px] animate-pulse rounded-lg border bg-card/60" />
      )}

      <div className="grid grid-cols-1 gap-4">
        {isReady ? (
          <div onClick={(e) => handleVgPlotClick(e, "rolesProjectStatus")} className="cursor-pointer vgplot-clickable">
            <HeatmapPanel
              title="Roles x project status"
              subtitle="Which roles are concentrated on active vs archived projects"
              table="user_projects"
              xColumn="project_status"
              yColumn="role_id"
              scheme="blues"
              height={520}
              selection={projectsSelection}
            />
          </div>
        ) : isFallback ? (
          <FallbackBarPanel
            title="Roles x project status"
            subtitle="Top role and project-status intersections from local data."
            rows={roleStatusRows}
            accent={ACCENTS.heatmap}
            onRowClick={(row) => {
              const [rolePart, statusPart] = row.label.split(" / ");
              setDetailFilter({
                title: `Users with Role "${rolePart}" in "${statusPart}" Projects`,
                subtitle: `Detailed view of users carrying role "${rolePart}" on projects with status "${statusPart}".`,
                filterFn: (u) => u.projects.some((p) => {
                  const statusMatch = (p.status || "unknown").toLowerCase() === (statusPart || "unknown").toLowerCase();
                  const rolesToCheck = p.roles.length ? p.roles : u.allRoles;
                  const roleMatch = rolesToCheck.some((r) => (r || "Unknown").toLowerCase() === (rolePart || "Unknown").toLowerCase());
                  return statusMatch && roleMatch;
                }),
              });
            }}
          />
        ) : (
          <div className="h-[520px] animate-pulse rounded-lg border bg-card/60" />
        )}
        {isReady ? (
          <div onClick={(e) => handleVgPlotClick(e, "admin")} className="cursor-pointer vgplot-clickable">
            <DistributionPanel
              title="Admin grants per user"
              subtitle="How many projects each admin actually administers"
              table="users"
              column="admin_count"
              accent={ACCENTS.distributionAdmin}
              binStep={1}
              height={420}
              selection={usersSelection}
            />
          </div>
        ) : isFallback ? (
          <FallbackBarPanel
            title="Admin grants per user"
            subtitle="Local fallback distribution while DuckDB-Wasm is unavailable."
            rows={adminDistributionRows}
            accent={ACCENTS.distributionAdmin}
            finding={adminGrantFinding(users)}
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users with ${row.label} Admin Grants`,
                subtitle: `Detailed view of users administering ${row.label} projects.`,
                filterFn: (u) => {
                  if (row.label === "10+") return u.adminCount >= 10;
                  const num = parseInt(row.label, 10);
                  return !isNaN(num) && u.adminCount === num;
                },
              });
            }}
          />
        ) : (
          <div className="h-[420px] animate-pulse rounded-lg border bg-card/60" />
        )}
      </div>

      <SectionHeading title="Rankings" />

      {!isReady && !isFallback ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <FallbackBarPanel
            title="Top projects"
            subtitle="Extracted project memberships shown immediately while cross-filter charts initialize."
            rows={topProjectRows}
            accent={ACCENTS.membership}
            emptyText="No project memberships found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users in Project: ${row.label}`,
                subtitle: `Detailed view of users who belong to the project "${row.label}".`,
                filterFn: (u) => u.projects.some((p) => p.name === row.label || p.id === row.label),
              });
            }}
          />
          <FallbackBarPanel
            title="Top roles"
            subtitle="Extracted role assignments shown immediately while cross-filter charts initialize."
            rows={topRoleRows}
            accent={ACCENTS.role}
            emptyText="No roles found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users with Role: ${row.label}`,
                subtitle: `Detailed view of users who carry the role "${row.label}".`,
                filterFn: (u) => {
                  const userRoles = new Set([
                    ...(u.allRoles ?? []),
                    ...(u.perProjectRoleNames ?? []),
                    ...u.projects.flatMap((p) => p.roles)
                  ].filter(Boolean));
                  return userRoles.has(row.label);
                },
              });
            }}
          />
          <FallbackBarPanel
            title="Top companies"
            subtitle="Extracted company membership distribution."
            rows={topCompanyRows}
            accent={ACCENTS.company}
            emptyText="No company data found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users at Company: ${row.label}`,
                subtitle: `Detailed view of users belonging to "${row.label}".`,
                filterFn: (u) => {
                  const label = (u.companyName ?? u.companyRole ?? "Unknown").trim() || "Unknown";
                  return label === row.label;
                },
              });
            }}
          />
        </div>
      ) : null}

      {isReady ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div onClick={(e) => handleVgPlotClick(e, "topProjects")} className="cursor-pointer vgplot-clickable">
            <HistogramPanel
              title="Top projects"
              table="user_projects"
              groupBy="project_name"
              groupLabel="users per project"
              topN={20}
              selection={projectsSelection}
            />
          </div>
          <div onClick={(e) => handleVgPlotClick(e, "topRoles")} className="cursor-pointer vgplot-clickable">
            <HistogramPanel
              title="Top roles"
              table="user_projects"
              groupBy="role_id"
              groupLabel="users per role"
              topN={20}
              selection={projectsSelection}
            />
          </div>
          <div onClick={(e) => handleVgPlotClick(e, "topCompanies")} className="cursor-pointer vgplot-clickable">
            <HistogramPanel
              title="Top companies"
              table="users"
              groupBy="company_name"
              groupLabel="users per company"
              topN={20}
              selection={usersSelection}
            />
          </div>
        </div>
      ) : isFallback ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <FallbackBarPanel
            title="Top projects"
            rows={toFallbackRows(queryState.projectMembership)}
            accent={ACCENTS.membership}
            emptyText="No project memberships found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users in Project: ${row.label}`,
                subtitle: `Detailed view of users who belong to the project "${row.label}".`,
                filterFn: (u) => u.projects.some((p) => p.name === row.label || p.id === row.label),
              });
            }}
          />
          <FallbackBarPanel
            title="Top roles"
            rows={toFallbackRows(queryState.roleDistribution)}
            accent={ACCENTS.role}
            emptyText="No roles found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users with Role: ${row.label}`,
                subtitle: `Detailed view of users who carry the role "${row.label}".`,
                filterFn: (u) => {
                  const userRoles = new Set([
                    ...(u.allRoles ?? []),
                    ...(u.perProjectRoleNames ?? []),
                    ...u.projects.flatMap((p) => p.roles)
                  ].filter(Boolean));
                  return userRoles.has(row.label);
                },
              });
            }}
          />
          <FallbackBarPanel
            title="Top companies"
            rows={topCompanyRows}
            accent={ACCENTS.company}
            emptyText="No company data found."
            onRowClick={(row) => {
              setDetailFilter({
                title: `Users at Company: ${row.label}`,
                subtitle: `Detailed view of users belonging to "${row.label}".`,
                filterFn: (u) => {
                  const label = (u.companyName ?? u.companyRole ?? "Unknown").trim() || "Unknown";
                  return label === row.label;
                },
              });
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-[400px] animate-pulse rounded-lg border bg-card/60" />
          ))}
        </div>
      )}

      <SectionHeading title="Activity & risk" />

      <AccessEventsChart />

      <ComplianceScanPanel />

      <PermissionRiskPanel />

      {/* Styled Interactive Effects for vgplot charts */}
      <style>{`
        .vgplot-clickable svg rect,
        .vgplot-clickable svg path {
          cursor: pointer;
          transition: opacity 0.15s ease-in-out, filter 0.15s ease-in-out;
        }
        .vgplot-clickable svg rect:hover,
        .vgplot-clickable svg path:hover {
          opacity: 0.85;
          filter: brightness(1.15);
        }
      `}</style>
    </>
  );
}
