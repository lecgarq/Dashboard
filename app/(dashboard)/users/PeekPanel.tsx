"use client";

/**
 * PeekPanel — the renderExpanded slot for the /users DataTable.
 *
 * Renders a compact snapshot from the in-memory DirectoryRow:
 * avatar, name, jobTitle, office, last-active, and project/role/module counts.
 * Provides a "See full profile →" affordance (INT-03).
 *
 * PERF-04: strictly read-only from props — NO useQuery, NO tRPC, NO fetch.
 */
import { formatDistanceToNowStrict } from "date-fns";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { ProfileAvatar } from "./ProfileAvatar";
import type { DirectoryRow } from "./directoryTableRow";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PeekPanelProps {
  row: DirectoryRow;
  onOpenProfile: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PeekPanel({ row, onOpenProfile }: PeekPanelProps): React.JSX.Element {
  const { displayName, email, photoUrl, jobTitle, officeLabel, lastActivity, projectCount, accUser } = row;

  const roleCount = accUser?.allRoles.length ?? 0;
  const moduleCount = accUser?.allModules.length ?? 0;

  const lastActiveText = lastActivity
    ? formatDistanceToNowStrict(new Date(lastActivity), { addSuffix: true })
    : "No data";

  return (
    <PremiumSurface variant="inset" className="mx-10 my-2 px-4 py-3">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <ProfileAvatar name={displayName} email={email} photoUrl={photoUrl} size="lg" />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          {jobTitle && (
            <p className="text-xs text-muted-foreground truncate">{jobTitle}</p>
          )}
          {officeLabel && (
            <p className="text-xs text-muted-foreground">{officeLabel}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Last active: <span className="text-foreground/70">{lastActiveText}</span>
          </p>

          {/* Counts row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>
              Projects <span className="font-medium text-foreground">{projectCount}</span>
            </span>
            <span className="opacity-30">·</span>
            <span>
              Roles <span className="font-medium text-foreground">{roleCount}</span>
            </span>
            <span className="opacity-30">·</span>
            <span>
              Modules <span className="font-medium text-foreground">{moduleCount}</span>
            </span>
          </div>
        </div>

        {/* See full profile affordance (INT-03) */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="shrink-0 text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
        >
          See full profile →
        </button>
      </div>
    </PremiumSurface>
  );
}
