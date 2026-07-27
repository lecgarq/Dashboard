"use client";
import { useTheme } from "next-themes";
import { DrillSheet } from "@/components/ui/DrillSheet";
import { tierSwatch } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { TemplateMember } from "@/lib/server/templateView";

interface TierSummary {
  label: string;
  rank: number;
  count: number;
}

interface RoleOverviewSheetProps {
  open: boolean;
  onClose: () => void;
  roleName: string | null;
  folderCount: number;
  tiers: TierSummary[];
  members: TemplateMember[];
  onMemberClick: (email: string) => void;
}

export function RoleOverviewSheet({
  open,
  onClose,
  roleName,
  folderCount,
  tiers,
  members,
  onMemberClick,
}: RoleOverviewSheetProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const totalTierFolders = tiers.reduce((s, t) => s + t.count, 0);

  return (
    <DrillSheet open={open} onClose={onClose} title={roleName ?? "Role"}>
      {/* Header: role name + folder count */}
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{folderCount}</span>{" "}
          folder{folderCount !== 1 ? "s" : ""} reached
        </p>
      </div>

      {/* Tier breakdown */}
      {tiers.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Permission tiers
          </h3>
          <div className="flex flex-col gap-2">
            {tiers.map((tier) => {
              const barWidth = totalTierFolders > 0 ? (tier.count / totalTierFolders) * 100 : 0;
              return (
                <div key={tier.rank} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-foreground/80">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: tierSwatch(tier.rank, dark) }}
                      />
                      {tier.label}
                    </span>
                    <span className="text-muted-foreground">{tier.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barWidth}%`,
                        background: tierSwatch(tier.rank, dark),
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Members with this role{" "}
          <span className="font-normal normal-case text-muted-foreground/70">
            ({members.length})
          </span>
        </h3>

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members hold this role.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50">
            {members.map((m, idx) => {
              const hasEmail = !!m.email;
              return (
                <button
                  key={m.email || `${m.name}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (hasEmail) onMemberClick(m.email);
                  }}
                  disabled={!hasEmail}
                  className={[
                    "flex flex-col gap-0.5 px-1 py-2.5 text-left transition-colors",
                    hasEmail
                      ? "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      : "cursor-default opacity-50",
                  ].join(" ")}
                  title={hasEmail ? `View profile for ${m.name}` : `${m.name} — no email`}
                >
                  <span className="text-sm font-medium text-foreground leading-tight">
                    {m.name}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {m.company && <span>{m.company}</span>}
                    {m.isAdmin && (
                      <span className="rounded px-1 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                        Admin
                      </span>
                    )}
                    <span className={m.isInternal ? "text-chart-5" : "text-chart-7"}>
                      {m.isInternal ? "Internal" : "External"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DrillSheet>
  );
}
