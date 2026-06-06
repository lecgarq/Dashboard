"use client";
import { useMemo, useState } from "react";
import { ProjectPicker } from "./ProjectPicker";
import { RolesPieChart } from "./RolesPieChart";
import { ModulesPieChart } from "./ModulesPieChart";
import { CoordinationByProject } from "./CoordinationByProject";
import { summarizeRoles } from "../roleCounts";
import { summarizeModules, type ModuleActivityRow } from "../moduleCounts";
import { summarizeCoordination } from "../coordinationCounts";
import { projectOptions, filterRowsBySelection, type ProjectRoleRow } from "../projectFilter";
import type { CoordinationByProjectData } from "@/lib/server/coordinationByProjectView";

/**
 * The whole Access Analysis surface behind ONE project picker. The selected set
 * of projects focuses BOTH donuts at once: roles (by membership) and module
 * activity (by volume). The project list is the union of the two sources — some
 * projects have access but no recorded activity, and the account-level admin
 * bucket has activity but no membership — so neither donut hides a project the
 * other knows about. Coordination rows are also included so MC-only projects
 * are selectable.
 */
export function AccessAnalysisCharts({
  roleRows,
  moduleRows,
  coordinationData,
}: {
  roleRows: ProjectRoleRow[];
  moduleRows: ModuleActivityRow[];
  coordinationData?: CoordinationByProjectData;
}) {
  const options = useMemo(
    () => projectOptions([...roleRows, ...moduleRows, ...(coordinationData?.rows ?? [])]),
    [roleRows, moduleRows, coordinationData],
  );

  // Per-project number shown in the picker = membership count (the roles donut's
  // unit), which is the figure the picker has always shown.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of roleRows) m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
    return m;
  }, [roleRows]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(options.map((o) => o.id)));

  const roleSummary = useMemo(() => summarizeRoles(filterRowsBySelection(roleRows, selected)), [roleRows, selected]);
  const moduleSummary = useMemo(() => summarizeModules(filterRowsBySelection(moduleRows, selected)), [moduleRows, selected]);
  const coordSummary = useMemo(
    () => summarizeCoordination(filterRowsBySelection(coordinationData?.rows ?? [], selected)),
    [coordinationData, selected],
  );

  return (
    <div className="flex flex-col gap-8">
      <ProjectPicker
        options={options}
        counts={counts}
        countNoun="memberships"
        selected={selected}
        onChange={setSelected}
        testIdPrefix="project"
      />

      <section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across all project memberships." />
        <RolesPieChart data={roleSummary.slices} distinctRoles={roleSummary.distinctRoles} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Activity by module" subtitle="Total actions recorded in each ACC module." />
        <ModulesPieChart summary={moduleSummary} />
      </section>

      {coordinationData ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Model Coordination" subtitle="Clash-validated coordination issues, by project." />
          <CoordinationByProject
            summary={coordSummary}
            accessibleProjects={coordinationData.accessibleProjects}
            forbiddenProjects={coordinationData.forbiddenProjects}
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * Consistent section heading: a readable title with a one-line plain-English
 * subtitle. Replaces the cramped "Title · descriptor" caption so each panel
 * reads clearly and the two Model Coordination surfaces stay distinct — the
 * donut counts *actions*, this section counts *issues*.
 */
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
