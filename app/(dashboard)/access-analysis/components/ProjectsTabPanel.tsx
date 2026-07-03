"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader } from "./SectionHeaders";
import { IssueFetchCoverageDonut } from "./IssueFetchCoverageDonut";
import { CoordinationByProject } from "./CoordinationByProject";
import type {
  CoordinationByProjectData,
  IssueCoverageProjectRow,
} from "@/lib/server/coordinationByProjectView";
import type { CoordinationSummary } from "../coordinationCounts";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import type { ClashIssue } from "../coordinationClash";

/**
 * Projects tab (locked tab map): Issue data coverage · Model Coordination.
 * Coverage donut renders FIRST — trust precedes metric (ISSUE-01 convention).
 * Ph21-22 issue-funnel/issue-type charts mount into this tab in a later phase;
 * this plan only relocates the two existing panels, no new charts.
 */
export function ProjectsTabPanel({
  coordinationData,
  filteredIssueCoverageProjects,
  coordSummary,
  coverageMap,
  mtySet,
  loadClashes,
  setProfileEmail,
}: {
  coordinationData?: CoordinationByProjectData;
  filteredIssueCoverageProjects: IssueCoverageProjectRow[];
  coordSummary: CoordinationSummary;
  coverageMap: Map<string, ProjectCoverage>;
  mtySet: Set<string>;
  loadClashes?: (projectId: string) => Promise<ClashIssue[]>;
  setProfileEmail: (email: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Issue data coverage (ISSUE-01) — trust precedes metric: sits directly
          above Model Coordination. */}
      {coordinationData?.issueCoverage ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Issue data coverage"
              subtitle="How much of the issue data can we see into? Every project checked by the latest fetch, honestly bucketed."
            />
            <IssueFetchCoverageDonut
              coverage={{
                runStatus: coordinationData.issueCoverage.runStatus,
                runStartedAt: coordinationData.issueCoverage.runStartedAt,
                runFinishedAt: coordinationData.issueCoverage.runFinishedAt,
              }}
              projects={filteredIssueCoverageProjects}
            />
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Model Coordination — full-width */}
      {coordinationData ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader title="Model Coordination" subtitle="Coordination-classified issues, by project." />
            <CoordinationByProject
              summary={coordSummary}
              accessibleProjects={coordinationData.accessibleProjects}
              forbiddenProjects={coordinationData.forbiddenProjects}
              latestRunAt={coordinationData.latestRunAt}
              coverage={coverageMap}
              mtyIds={mtySet}
              loadClashes={loadClashes}
              onAuthorClick={(email) => setProfileEmail(email.toLowerCase())}
            />
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Ph21-22 issue funnel / issue-type charts land here in a later phase —
          this tab is the locked home for them (20.1-CONTEXT.md), not built yet. */}
    </div>
  );
}
