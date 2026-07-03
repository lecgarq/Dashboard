"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader } from "./SectionHeaders";
import { ModulesPieChart } from "./ModulesPieChart";
import { ActivityTimelineChart } from "./ActivityTimelineChart";
import { ActivityCoverageBadge } from "./ActivityCoverageBadge";
import { IngestFreshnessPanel } from "./IngestFreshnessPanel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActivityTimelineRow, TimelineSummary } from "../timelineCounts";
import type { ModuleSummary } from "../moduleCounts";
import type { IngestFreshness } from "@/lib/server/ingestFreshnessView";

/**
 * Overview tab (locked tab map): Activity over time · Activity by module ·
 * Ingest freshness. First chapter of the story — account-wide activity shape
 * before drilling into Roles/Users/Companies/Projects/Compare.
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
}: {
  timelineRows?: ActivityTimelineRow[];
  timelineSummary: TimelineSummary;
  dataFloor?: string | null;
  floorByProject?: Record<string, string>;
  covCovered: number;
  covTotal: number;
  moduleSummary: ModuleSummary;
  ingestFreshness?: IngestFreshness | null;
}) {
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
                      Classification is derived from each activity&apos;s{" "}
                      <code className="font-mono">rawAction</code>. Autodesk&apos;s own{" "}
                      <code className="font-mono">service</code> product attribution is
                      not yet reconciled — the two disagree on ~40.7% of rows.
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

      {/* Ingest freshness (PIPE-01) — muted ops-metadata strip, account-wide
          (NOT project-filtered). */}
      {ingestFreshness !== undefined && <IngestFreshnessPanel freshness={ingestFreshness} />}
    </div>
  );
}
