"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader } from "./SectionHeaders";
import { IssueFetchCoverageDonut } from "./IssueFetchCoverageDonut";
import { CoordinationByProject } from "./CoordinationByProject";
import { DonutPanelSkeleton } from "./DonutSkeletons";
import { LoadFailedNotice } from "./LoadFailedNotice";
import { IssueTimelineChart } from "./IssueTimelineChart";
import { IssueStatusChart } from "./IssueStatusChart";
import { IssueTypeChart } from "./IssueTypeChart";
import { WorkflowToolDonut } from "./WorkflowToolDonut";
import { AdminsPerProjectChart } from "./AdminsPerProjectChart";
import type { AdminsPerProjectData } from "@/lib/server/adminsPerProjectView";
import { WORKFLOW_TOOLS, type WorkflowTool, type WorkflowToolSummary } from "../workflowToolCounts";
import type {
  CoordinationByProjectData,
  IssueCoverageProjectRow,
} from "@/lib/server/coordinationByProjectView";
import type { CoordinationSummary } from "../coordinationCounts";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import type { ClashIssue } from "../coordinationClash";
import type { IssueFunnelData, IssueFunnelStatusRow, IssueFunnelTypeRow } from "@/lib/server/issueFunnelView";
import type { TimelineSummary } from "../timelineCounts";

const EMPTY_TIMELINE_SUMMARY: TimelineSummary = { points: [], total: 0, peak: null, busiestYear: null, span: null };

/**
 * Projects tab (locked tab map): Issue data coverage · Issues over time ·
 * Issues by status · Issues by type · Model Coordination. Coverage donut
 * renders FIRST — trust precedes metric (ISSUE-01 convention) — and frames
 * trust for the Phase 21/22 issue-funnel charts directly beneath it
 * (ISSUE-02/03/05).
 */
export function ProjectsTabPanel({
  coordinationData,
  filteredIssueCoverageProjects,
  coordSummary,
  coverageMap,
  mtySet,
  loadClashes,
  setProfileEmail,
  loadIssueFunnel,
  issueFunnelLoading,
  issueFunnelFailed,
  onRetryIssueFunnel,
  issueTimelineSummary,
  filteredIssueStatusRows,
  filteredIssueTypeRows,
  workflowToolSummaries,
  workflowToolsLoading,
  workflowToolsFailed,
  onRetryWorkflowTools,
  adminsData,
  adminsEnabled,
  adminsLoading,
  adminsFailed,
  onRetryAdmins,
}: {
  coordinationData?: CoordinationByProjectData;
  filteredIssueCoverageProjects: IssueCoverageProjectRow[];
  coordSummary: CoordinationSummary;
  coverageMap: Map<string, ProjectCoverage>;
  mtySet: Set<string>;
  loadClashes?: (projectId: string) => Promise<ClashIssue[]>;
  setProfileEmail: (email: string) => void;
  /** Phase 21 ISSUE-02/03: presence gates both issue-funnel panels below the coverage donut. */
  loadIssueFunnel?: () => Promise<IssueFunnelData | null>;
  issueFunnelLoading?: boolean;
  /** True when the lazy issue-funnel fetch REJECTED — the timeline panel shows
   *  the retry state and the two sibling issue panels collapse (one fetch, one notice). */
  issueFunnelFailed?: boolean;
  onRetryIssueFunnel?: () => void;
  issueTimelineSummary?: TimelineSummary;
  filteredIssueStatusRows?: IssueFunnelStatusRow[];
  /** Phase 22 ISSUE-05: rides the same lazy loadIssueFunnel fetch, no new fetch branch. */
  filteredIssueTypeRows?: IssueFunnelTypeRow[];
  /** Reviews/RFIs/Submittals donuts — lazy loadWorkflowTools fetch; undefined
   *  until resolved (or forever, on a no-session result) → section stays hidden. */
  workflowToolSummaries?: Record<WorkflowTool, WorkflowToolSummary>;
  workflowToolsLoading?: boolean;
  workflowToolsFailed?: boolean;
  onRetryWorkflowTools?: () => void;
  /** Admins-per-project chart — lazy loadAdminsPerProject fetch, picker-filtered upstream. */
  adminsData?: AdminsPerProjectData | null;
  adminsEnabled?: boolean;
  adminsLoading?: boolean;
  adminsFailed?: boolean;
  onRetryAdmins?: () => void;
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

      {/* Issues over time (ISSUE-02) — full-width, directly below the coverage donut. */}
      {loadIssueFunnel ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            {issueFunnelLoading ? (
              <DonutPanelSkeleton />
            ) : issueFunnelFailed && onRetryIssueFunnel ? (
              <LoadFailedNotice what="the issue funnel (timeline, status, and type)" onRetry={onRetryIssueFunnel} />
            ) : (
              <>
                <SectionHeader
                  title="Issues over time"
                  subtitle="When are issues actually being raised? Every ACC issue by created month — sustained climbs and spikes mark heavy review pushes."
                />
                <IssueTimelineChart
                  summary={issueTimelineSummary ?? EMPTY_TIMELINE_SUMMARY}
                  coverageProjects={filteredIssueCoverageProjects}
                />
              </>
            )}
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Issues by status (ISSUE-03) — full-width, beneath the timeline.
          Collapsed while the shared issue-funnel fetch is failed: the timeline
          panel above carries the single retry notice for all three. */}
      {loadIssueFunnel && !issueFunnelFailed ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            {issueFunnelLoading ? (
              <DonutPanelSkeleton />
            ) : (
              <>
                <SectionHeader
                  title="Issues by status"
                  subtitle="Where does the issue pile sit right now? All fetched issues by their current ACC status, shown exactly as ACC reports them."
                />
                <IssueStatusChart
                  rows={filteredIssueStatusRows ?? []}
                  coverageProjects={filteredIssueCoverageProjects}
                />
              </>
            )}
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Issues by type (ISSUE-05) — full-width, beneath the status panel.
          Collapsed while failed — same shared-fetch rule as Issues by status. */}
      {loadIssueFunnel && !issueFunnelFailed ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            {issueFunnelLoading ? (
              <DonutPanelSkeleton />
            ) : (
              <>
                <SectionHeader
                  title="Issues by type"
                  subtitle="What kinds of issues do we actually have? Every fetched issue by its resolved ACC type name — honest buckets for unresolved and untyped issues."
                />
                <IssueTypeChart
                  rows={filteredIssueTypeRows ?? []}
                  coverageProjects={filteredIssueCoverageProjects}
                />
              </>
            )}
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Workflow tools (Reviews / Transmittals / RFIs / Submittals) — 2x2 donut
          grid. Hidden until the lazy fetch resolves (no-session results keep it
          hidden). RFI/submittal volume comes only from the DC feed — see
          lib/server/workflowToolsView.ts for the per-verb-family keep rules. */}
      {(workflowToolsLoading || workflowToolsFailed || workflowToolSummaries) && (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Workflow tools"
              subtitle="How much are the document Reviews, Transmittals, RFIs, and Submittals workflows actually used? Every recorded action, by type — click one for its per-project breakdown. RFI and Submittal events come only from the batch Data Connector feed (the live feed does not report them), so recent weeks may lag."
            />
            {workflowToolsFailed && onRetryWorkflowTools ? (
              <LoadFailedNotice what="workflow tool activity" onRetry={onRetryWorkflowTools} />
            ) : workflowToolsLoading || !workflowToolSummaries ? (
              <DonutPanelSkeleton />
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {WORKFLOW_TOOLS.map((tool) => (
                  <div key={tool} className="flex flex-col gap-2">
                    <h3 className="text-center font-display text-sm font-semibold tracking-tight text-foreground">{tool}</h3>
                    <WorkflowToolDonut label={tool} summary={workflowToolSummaries[tool]} />
                  </div>
                ))}
              </div>
            )}
          </PremiumSurface>
        </Reveal>
      )}

      {/* Admins per project (owner ask 2026-07-23) — visible while loading;
          hidden only when the lazy loader is absent or returned no session. */}
      {adminsEnabled && (adminsLoading || adminsFailed || adminsData) && (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Admins per project"
              subtitle="Who holds project-admin power, per project? ACC member sync and the Data Connector feed, deduped by email — with the projects neither source can see disclosed below."
            />
            {adminsFailed && onRetryAdmins ? (
              <LoadFailedNotice what="admins per project" onRetry={onRetryAdmins} />
            ) : adminsLoading || !adminsData ? (
              <DonutPanelSkeleton />
            ) : (
              <AdminsPerProjectChart data={adminsData} />
            )}
          </PremiumSurface>
        </Reveal>
      )}

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
    </div>
  );
}
