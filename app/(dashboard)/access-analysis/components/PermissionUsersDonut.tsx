"use client";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import type { PermissionUserCounts } from "@/lib/server/permissionUserView";

/**
 * "Users by permission level" donut (Users tab, owner request 2026-07-13) —
 * one exclusive slice per stored permType, counting each user ONCE at their
 * STRONGEST folder-permission level (the transform in
 * `lib/server/permissionUserView.ts` owns that ranking). Account-wide, NOT
 * project-filtered — same scoping note as the ingest-freshness panel.
 *
 * No drill (the levels are already leaf buckets); the ranked legend + honest
 * coverage captions carry the detail. Colors: fixed strongest→weakest ramp —
 * warm for power tiers, cool for read-mostly tiers, zinc for Unrecognized
 * (the sibling donuts' data-rollup color role).
 */
const TIER_COLORS: Record<string, string> = {
  "Full Controller": "#e06a62",
  "View+Download+Upload+Edit": "#e8763f",
  "View+Download+Upload": "#d2a012",
  "View+Download": "#5e96ce",
  "Upload Only": "#4fabc9",
  "View Only": "#21a3b0",
  Unrecognized: "#71717a",
};

/** Lighten a hex color by mixing it toward white by `amt` (0–1). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round((255 - ((n >> 16) & 0xff)) * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * amt));
  const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

export function PermissionUsersDonut({ counts }: { counts: PermissionUserCounts }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const { tiers, usersWithGrants, usersWithRoles, totalDcUsers } = counts;

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";

  if (tiers.length === 0) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No recorded folder permissions.
        <span className="text-xs opacity-70">Run the folder crawl to populate permission data.</span>
      </div>
    );
  }

  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const colorFor = (permType: string) => TIER_COLORS[permType] ?? "#71717a";

  const option: EChartsOption = {
    title: [
      {
        text: usersWithGrants.toLocaleString(),
        subtext: "users",
        left: "center",
        top: "42%",
        textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      padding: [10, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} users · <b style='color:${cTitle}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Users by permission level",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "50%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: {
          focus: "self",
          scaleSize: 12,
          label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: cTitle },
        },
        blur: { itemStyle: { opacity: 0.22 } },
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        data: tiers.map((t) => {
          const base = colorFor(t.permType);
          return {
            name: t.permType,
            value: t.users,
            itemStyle: {
              color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lighten(base, 0.22) }, { offset: 1, color: base }] },
            },
          };
        }),
      },
    ],
  };

  return (
    <div className="panel-elevated p-5">
      <EChart option={option} height={340} notMerge={false} />

      {/* Ranked legend — strongest level first. */}
      <ul
        data-testid="permission-users-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {tiers.map((t) => {
          const color = colorFor(t.permType);
          const barPct = usersWithGrants > 0 ? (t.users / usersWithGrants) * 100 : 0;
          return (
            <li key={t.permType} className="mb-1 break-inside-avoid">
              <div className="relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-xs text-foreground/85">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${barPct}%`, background: color, opacity: 0.16 }}
                />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
                <span className="relative flex-1 truncate">{t.permType}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{t.users.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                  {fmtPct(t.users, usersWithGrants)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Live data-truthfulness captions — never hardcoded figures. */}
      <div data-testid="permission-users-caption" className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <p>
          Each user counted once at their strongest folder-permission level.
        </p>
        <p>
          {usersWithGrants.toLocaleString()} of {usersWithRoles.toLocaleString()} role-assigned users have a
          recorded folder permission ({totalDcUsers.toLocaleString()} DC users total) — folder crawl does not
          cover every project. Account-wide; the project filter does not apply.
        </p>
      </div>
    </div>
  );
}
