"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader } from "./SectionHeaders";
import { ModulesPieChart } from "./ModulesPieChart";
import { ActivityTimelineChart } from "./ActivityTimelineChart";
import { ActivityCoverageBadge } from "./ActivityCoverageBadge";
import { IngestFreshnessPanel } from "./IngestFreshnessPanel";
import { ProjectActivityDonut } from "./ProjectActivityDonut";
import { ProvisionedModulesChart } from "./ProvisionedModulesChart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActivityTimelineRow, TimelineSummary } from "../timelineCounts";
import type { ModuleSummary } from "../moduleCounts";
import type { IngestFreshness } from "@/lib/server/ingestFreshnessView";
import type { ProjectActivitySummary } from "../projectActivityCounts";
import type { ProvisionedModuleSummary } from "../provisionedModulesCounts";

/**
 * Overview tab (locked tab map): Activity over time · Activity by module ·
 * [Activity share by project | Provisioned modules] 2-up row · Ingest
 * freshness. First chapter of the story — account-wide activity shape before
 * drilling into Roles/Users/Companies/Projects/Compare.
 */
export function OverviewTabPanel({
  timelineRows,
  timelineSummary,
  dataFloor,
  floorByProject,
  covCovered,
  covTotal,
  moduleSummary,
  ingestFreshness,
  projectActivitySummary,
  provisionedModuleSummary,
}: {
  timelineRows?: ActivityTimelineRow[];
  timelineSummary: TimelineSummary;
  dataFloor?: string | null;
  floorByProject?: Record<string, string>;
  covCovered: number;
  covTotal: number;
  moduleSummary: ModuleSummary;
  ingestFreshness?: IngestFreshness | null;
  /** UAT-21.1-03: Activity share by project donut. Presence gates the left panel of the 2-up row. */
  projectActivitySummary?: ProjectActivitySummary;
  /** UAT-21.1-01: Provisioned modules bars. Presence gates the right panel of the 2-up row. */
  provisionedModuleSummary?: ProvisionedModuleSummary;
}) {
  // TRUTH-03 caveat (UAT-21.1-02): live service-attributed vs verb-inferred
  // split, computed from moduleSummary.attribution — never hardcoded. Guards
  // division-by-zero for an empty selection (neutral sentence, never NaN%).
  const { serviceCount, verbCount } = moduleSummary.attribution;
  const attributionTotal = serviceCount + verbCount;
  const pct = (n: number) => (attributionTotal > 0 ? ((n / attributionTotal) * 100).toFixed(1) : "0");
  return (
    <div className="flex flex-col gap-6">
      {/* Activity over time — full-width, activity-derived → coverage badge */}
      {timelineRows ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Activity over time"
              subtitle="Total ACC activity per month across all years. Tick projects above to refocus the line; quiet months dip to zero."
              badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
            />
            <ActivityTimelineChart
              summary={timelineSummary}
              dataFloor={dataFloor}
              floorByProject={floorByProject}
            />
          </PremiumSurface>
        </Reveal>
      ) : null}

      {/* Activity by module — activity-derived → coverage badge + TRUTH-03 ⓘ caveat.
          Own grid wrapper keeps the original lg:col-span-2 full-width treatment now
          that this panel isn't sharing a grid with the other donuts (Pitfall preserved). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal className="lg:col-span-2"><PremiumSurface
          variant="base"
          className="flex flex-col gap-3 p-5 overflow-hidden"
        >
          <SectionHeader
            title="Activity by module"
            subtitle="Total actions recorded in each ACC module."
            badge={
              <>
                {/* TRUTH-03: hover/focus-only ⓘ tooltip — candid classification caveat.
                    TooltipProvider is NOT mounted globally in this tree → wrap locally. */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="About module classification"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4M12 8h.01" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      data-testid="module-caveat"
                      className="max-w-xs text-xs"
                    >
                      {attributionTotal > 0 ? (
                        <>
                          Module attribution is service-first: {pct(serviceCount)}% of activity in
                          view carries Autodesk&apos;s service tag; the remaining {pct(verbCount)}%
                          is classified from each activity&apos;s{" "}
                          <code className="font-mono">rawAction</code> verb taxonomy.
                        </>
                      ) : (
                        <>
                          Module attribution is service-first, falling back to each activity&apos;s{" "}
                          <code className="font-mono">rawAction</code> verb taxonomy when no
                          Autodesk service tag is present. No activity in the current selection.
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <ActivityCoverageBadge covered={covCovered} total={covTotal} />
              </>
            }
          />
          <ModulesPieChart summary={moduleSummary} />
        </PremiumSurface></Reveal>
      </div>

      {/* Provisioned-vs-used 2-up row (UAT-21.1-01/03): Activity share by
          project (left) + Provisioned modules (right) — "what's used" next to
          "what's rolled out." Both picker-only, gated independently on their
          own summary prop; absent → that panel is absent (mirrors the
          `timelineRows ?` convention above). Identical panel shell to the
          existing Overview panels — no card-inside-card. */}
      {(projectActivitySummary || provisionedModuleSummary) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {projectActivitySummary && (
            <Reveal>
              <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
                <SectionHeader
                  title="Activity share by project"
                  subtitle="Top 10 projects by activity volume, plus Other. Account-level admin activity is excluded — see caption below."
                  badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
                />
                <ProjectActivityDonut summary={projectActivitySummary} />
              </PremiumSurface>
            </Reveal>
          )}
          {provisionedModuleSummary && (
            <Reveal>
              <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
                <SectionHeader
                  title="Provisioned modules"
                  subtitle="Member x project module access grants for the selected projects — what's rolled out, vs. the activity donut's what's used."
                />
                <ProvisionedModulesChart summary={provisionedModuleSummary} />
              </PremiumSurface>
            </Reveal>
          )}
        </div>
      )}

      {/* Ingest freshness (PIPE-01) — muted ops-metadata strip, account-wide
          (NOT project-filtered). */}
      {ingestFreshness !== undefined && <IngestFreshnessPanel freshness={ingestFreshness} />}
    </div>
  );
}
