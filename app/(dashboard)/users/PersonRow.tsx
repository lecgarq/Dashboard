"use client";

// ---------------------------------------------------------------------------
// PersonRow.tsx — list-view row component for the /users directory
//
// Extracted from UsersDirectoryClient.tsx (USR-01 decomposition, Wave 3).
// No logic changes — this is a pure move.
// ---------------------------------------------------------------------------

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  reduceMemberStatus,
  type AggregatedStatus,
} from "@/lib/acc/accStatusReduction";
import { trpc } from "@/lib/core/trpc";
import { formatDistanceToNowStrict } from "date-fns";
import type { OrgPerson } from "./directoryUtils";
import { PersonAvatar } from "./PersonDetailModal";
import { StatusPill, AdminPill, AccBadge } from "./DirectoryPills";

// ---------------------------------------------------------------------------
// File-activity column helpers (ACTV-03 / LIST-03 prep)
// ---------------------------------------------------------------------------

type FileActivityKey = "lastView" | "lastUpload" | "lastEdit" | "lastDelete";

const FILE_ACTIVITY_COLUMNS: ReadonlyArray<{ key: FileActivityKey; label: string }> = [
  { key: "lastView", label: "View" },
  { key: "lastUpload", label: "Upload" },
  { key: "lastEdit", label: "Edit" },
  { key: "lastDelete", label: "Delete" },
];

/**
 * Reads from React Query cache only — does NOT fire a query. This honors
 * ACTV-03's "NOT eager-loaded" contract. Data arrives via hover prefetch
 * (250ms debounce) or via the side-panel open (which calls useQuery directly).
 */
function FileActivityCell({
  email,
  field,
  active,
  onClick,
}: {
  email: string;
  field: FileActivityKey;
  active: boolean;
  onClick: () => void;
}) {
  // `enabled: active` guards: cell only fetches when row was hovered
  // (we set active=true on enter, leave it true after to keep cache warm).
  const { data } = trpc.accActivity.getFileActivityForUser.useQuery(
    { email },
    { enabled: active, staleTime: 5 * 60_000, retry: false },
  );

  const value = data ? data[field] : undefined;

  if (!active || data === undefined) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="text-muted-foreground/40 hover:text-primary text-[11px] tabular-nums"
        title="Hover the row to load activity"
      >
        —
      </button>
    );
  }

  if (value === null || value === undefined) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="text-muted-foreground/50 hover:text-primary text-[11px]"
      >
        Never
      </button>
    );
  }

  const date: Date = value instanceof Date ? value : new Date(value as string | number);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-foreground hover:text-primary text-[11px] tabular-nums truncate text-left"
      title={date.toISOString()}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LIST-03 (display path): Last File Activity cell
//
// Renders a single "max-of-buckets" relative timestamp fed by
// `accActivity.getLastFileActivityBatch`. The actual batch query lives on the
// parent (UsersDirectoryClient root) — this component receives the lookup map
// already keyed by lowercased email and decides which of three states to
// render: skeleton (not yet fetched), em-dash + tooltip (null = no activity),
// or relative timestamp (ISO string).
//
// Anti-pattern guard (RESEARCH Pitfall 1): NEVER read from
// `BulkAccUser.lastFileActivity` — that field does not exist and adding it
// would violate ACTV-03 by eager-loading activity onto the bulk payload.
// ---------------------------------------------------------------------------

function LastFileActivityCell({
  email,
  activityByEmail,
}: {
  email: string;
  activityByEmail: Record<string, string | null> | undefined;
}) {
  const lookup = email.toLowerCase();
  const value = activityByEmail ? activityByEmail[lookup] : undefined;

  // Pending: parent's batch query has not yet returned a value for this row.
  if (activityByEmail === undefined || value === undefined) {
    return <Skeleton className="h-4 w-20" />;
  }

  // Empty: server returned null — user has no file activity in the window.
  if (value === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label="No activity in 90d"
            className="text-muted-foreground/50 text-[11px] tabular-nums"
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent>No activity in 90d</TooltipContent>
      </Tooltip>
    );
  }

  const date = new Date(value);
  return (
    <span
      className="text-foreground text-[11px] tabular-nums truncate"
      title={date.toISOString()}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </span>
  );
}

export function PersonRow({
  person,
  accSummary,
  onClick,
  activityActive,
  onHoverEnter,
  onHoverLeave,
  onActivityCellClick,
  onStatusPillClick,
  onAdminPillClick,
  rowRef,
  activityByEmail,
}: {
  person: OrgPerson;
  accSummary?: BulkAccUser;
  onClick: () => void;
  activityActive: boolean;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onActivityCellClick: () => void;
  onStatusPillClick?: (status: AggregatedStatus) => void;
  onAdminPillClick?: () => void;
  // LIST-03 (display path): optional viewport-tracking ref + batch lookup.
  // Both are undefined for the legacy/card render path; the list path wires
  // them through from useVisibleRowEmails + getLastFileActivityBatch.
  rowRef?: (el: HTMLElement | null) => void;
  activityByEmail?: Record<string, string | null>;
}) {
  // LIST-01: prefer canonical aggregatedStatus; fall back to client reducer
  // only when the enrichedUsers query hasn't returned yet AND the summary
  // happens to surface a raw status list (today it does not — keeps shape
  // future-proof). When both are absent we render the skeleton variant by
  // passing undefined to <StatusPill />.
  const rowStatus: AggregatedStatus | undefined =
    accSummary?.aggregatedStatus ??
    (accSummary?.projects && accSummary.projects.length > 0
      ? reduceMemberStatus(accSummary.projects.map((p) => p.status))
      : undefined);
  const isProjectAdmin = accSummary?.projectAdmin === true;

  return (
    <div
      ref={rowRef}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      className="group/row w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all duration-150 cursor-pointer"
      onClick={onClick}
    >
      <PersonAvatar person={person} size="sm" />
      <div className="min-w-0 flex-1 grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto] gap-3 items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate flex items-center">
            <span className="truncate">{person.displayName}</span>
            {isProjectAdmin && <AdminPill onClick={onAdminPillClick} />}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{person.email}</p>
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.department || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.jobTitle || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.costCenter || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.phoneNumber || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0">
          <StatusPill status={rowStatus} onClick={onStatusPillClick} />
        </div>
        {FILE_ACTIVITY_COLUMNS.map((col) => (
          <div key={col.key} className="min-w-0">
            <FileActivityCell
              email={person.email}
              field={col.key}
              active={activityActive}
              onClick={onActivityCellClick}
            />
          </div>
        ))}
        <div className="min-w-0">
          <LastFileActivityCell
            email={person.email}
            activityByEmail={activityByEmail}
          />
        </div>
        <div className="shrink-0">
          <AccBadge summary={accSummary} />
        </div>
      </div>
    </div>
  );
}
