"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeaderWithPeople } from "./SectionHeaders";
import { CompaniesPieChart } from "./CompaniesPieChart";
import { CompaniesActivityPieChart } from "./CompaniesActivityPieChart";
import { ActivityCoverageBadge } from "./ActivityCoverageBadge";
import type { CompanySummary } from "../companyCounts";
import type { CompanyActivitySummary } from "../companyActivityCounts";
import type { DormantEntity } from "../dormantActivity";
import type { SliceFilters } from "../projectFilter";
import type { DrillPerson } from "../roleCounts";
import type { ActivityActorRow } from "@/lib/server/activityByActorView";

/**
 * Companies tab (locked tab map): Users by company · Activity by company
 * (2-up grid). The new Folder activity by company graph (UAT-6) mounts here
 * in 20.1-06 — this plan only relocates the two existing panels.
 */
export function CompaniesTabPanel({
  companySummary,
  sliceFilters,
  toggleSliceFilter,
  setProfileEmail,
  setPeopleSheet,
  activityActorRows,
  activityByCompanySummary,
  dormantCompanies,
  covCovered,
  covTotal,
}: {
  companySummary: CompanySummary;
  sliceFilters: SliceFilters;
  toggleSliceFilter: (dim: string, val: string) => void;
  setProfileEmail: (email: string) => void;
  setPeopleSheet: (sheet: { title: string; people: DrillPerson[] } | null) => void;
  /** Presence gates the Activity by company panel (matches the pre-split conditional-render guard). */
  activityActorRows?: ActivityActorRow[];
  activityByCompanySummary: CompanyActivitySummary;
  dormantCompanies: DormantEntity[];
  covCovered: number;
  covTotal: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Users by company — membership (not activity-derived → no coverage badge) */}
      <Reveal><PremiumSurface
        variant="base"
        glow={!!sliceFilters.company}
        className="flex flex-col gap-3 p-5 overflow-hidden"
      >
        <SectionHeaderWithPeople
          title="Users by company"
          subtitle="Project memberships grouped by each member's company."
          people={[...companySummary.usersByCompany.values()].flat()}
          onViewPeople={(people) => setPeopleSheet({ title: "Users by company — people", people })}
          testId="view-people-company"
        />
        <CompaniesPieChart
          data={companySummary.slices}
          distinctCompanies={companySummary.distinctCompanies}
          usersByCompany={companySummary.usersByCompany}
          onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          onSliceClick={(val) => toggleSliceFilter("company", val)}
          activeSlice={sliceFilters.company}
        />
      </PremiumSurface></Reveal>

      {/* Activity by company — activity-derived → coverage badge */}
      {activityActorRows ? (
        <Reveal><PremiumSurface
          variant="base"
          glow={!!sliceFilters.company}
          className="flex flex-col gap-3 p-5 overflow-hidden"
        >
          <SectionHeaderWithPeople
            title="Activity by company"
            subtitle="Project activity attributed to each person's company. Click a company to see who did the work."
            people={[...activityByCompanySummary.usersByCompany.values()].flat()}
            onViewPeople={(people) => setPeopleSheet({ title: "Activity by company — people", people })}
            testId="view-people-activity-company"
            badge={<ActivityCoverageBadge covered={covCovered} total={covTotal} />}
          />
          <CompaniesActivityPieChart
            summary={activityByCompanySummary}
            dormant={dormantCompanies}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
            onSliceClick={(val) => toggleSliceFilter("company", val)}
            activeSlice={sliceFilters.company}
          />
        </PremiumSurface></Reveal>
      ) : null}
    </div>
  );
}
