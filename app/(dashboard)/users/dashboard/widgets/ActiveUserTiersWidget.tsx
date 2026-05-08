"use client";

import * as React from "react";
import { ResponsiveBar } from "@nivo/bar";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import {
  ACTIVE_TIERS,
  bucketActiveUserTier,
  type ActiveTier,
} from "@/lib/acc/activeUserTiers";
import type { BulkAccUser } from "@/lib/acc/acc-types";

/**
 * Phase 4 Plan 06 — Active-user tiers stacked bar (DASH-02).
 *
 * Single horizontal stacked bar with one row ("Members") and one stacked key per tier
 * (7d / 30d / 90d / >90d / Never). Bucketing is delegated to bucketActiveUserTier.
 *
 * Pitfall 1 (SSR): `"use client"` MANDATORY — Nivo touches `window` at module load.
 * Pitfall 2 (height): explicit container height required.
 */
export interface ActiveUserTiersWidgetProps {
  users: BulkAccUser[];
}

const TIER_COLORS: Record<ActiveTier, string> = {
  "7d": "#16a34a", // green-600
  "30d": "#84cc16", // lime-500
  "90d": "#f59e0b", // amber-500
  ">90d": "#dc2626", // red-600
  Never: "#9ca3af", // gray-400
};

export function ActiveUserTiersWidget({ users }: ActiveUserTiersWidgetProps) {
  const counts = React.useMemo(() => {
    const now = new Date();
    const c: Record<ActiveTier, number> = {
      "7d": 0,
      "30d": 0,
      "90d": 0,
      ">90d": 0,
      Never: 0,
    };
    for (const u of users) {
      const tier = bucketActiveUserTier(u.lastSignIn, now);
      c[tier] += 1;
    }
    return c;
  }, [users]);

  const data = React.useMemo(
    () => [
      {
        group: "Members",
        ...counts,
      },
    ],
    [counts]
  );

  function handleExport() {
    downloadCsv(
      "active-tiers.csv",
      ACTIVE_TIERS.map((t) => ({ Tier: t, Count: counts[t] }))
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 size-4" />
          CSV
        </Button>
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveBar
          data={data}
          keys={[...ACTIVE_TIERS]}
          indexBy="group"
          layout="horizontal"
          margin={{ top: 10, right: 16, bottom: 40, left: 80 }}
          padding={0.3}
          colors={(d) => TIER_COLORS[d.id as ActiveTier]}
          enableLabel
          labelSkipWidth={20}
          labelTextColor="#fff"
          axisBottom={{ tickSize: 5, tickPadding: 5 }}
          axisLeft={{ tickSize: 5, tickPadding: 5 }}
          legends={[
            {
              dataFrom: "keys",
              anchor: "bottom",
              direction: "row",
              justify: false,
              translateY: 40,
              itemWidth: 70,
              itemHeight: 16,
              itemsSpacing: 4,
              symbolSize: 12,
            },
          ]}
          tooltip={({ id, value }) => (
            <div
              style={{
                background: "white",
                color: "#111",
                padding: "6px 10px",
                borderRadius: 4,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                fontSize: 12,
              }}
            >
              <strong>{String(id)}</strong>: {value}
            </div>
          )}
        />
      </div>
    </div>
  );
}
