"use client";
import { Reveal } from "@/components/ui/animated-list";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { SectionHeader } from "./SectionHeaders";
import { DormantSignInChart } from "./DormantSignInChart";
import type { SignInRecencyRow } from "@/lib/server/signInRecencyView";
import type { DcCoverage } from "@/lib/server/dcCoverageView";

/**
 * Users tab (locked tab map, interim placement per 20.1-05): Dormant users
 * (interim sign-in-recency chart — replaced by the ENG-01 activity-recency
 * pivot in 20.1-06, which also adds the user-level cut of that panel).
 */
export function UsersTabPanel({
  signInRecencyRows,
  filteredSignInRecencyRows,
  dcCoverage,
}: {
  /** Presence gates the panel (matches the pre-split conditional-render guard). */
  signInRecencyRows?: SignInRecencyRow[];
  filteredSignInRecencyRows: SignInRecencyRow[];
  dcCoverage?: DcCoverage;
}) {
  return (
    <div className="flex flex-col gap-6">
      {signInRecencyRows ? (
        <Reveal>
          <PremiumSurface variant="base" className="flex flex-col gap-3 p-5 overflow-hidden">
            <SectionHeader
              title="Dormant users"
              subtitle="Project memberships by sign-in recency. Click a band to see who."
            />
            <DormantSignInChart rows={filteredSignInRecencyRows} dcCoverage={dcCoverage} />
          </PremiumSurface>
        </Reveal>
      ) : null}
    </div>
  );
}
