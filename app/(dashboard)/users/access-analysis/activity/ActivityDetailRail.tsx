"use client";

/**
 * ActivityDetailRail.tsx — v2.7 Phase 39 (ACT-04).
 *
 * Right rail for a clicked activity node: the event's story (verb, object,
 * folder, project, exact timestamp — fetched on-demand by payload row index
 * via activityUniverse.eventDetail) and the author's profile (UserProfilePanel
 * rail variant, email-driven; it owns the aside chrome + Close, the event
 * story rides in via railPrelude). authorId 0 renders the explicit "Unknown
 * author" grouping instead of a profile. Every failure path has honest copy —
 * fields are never silently blank.
 */

import { trpc } from "@/lib/core/trpc";
import { UserProfilePanel } from "../../UserProfilePanel";
import type { ActivityHoverLabels } from "./activityEventLabels";

export interface ActivityDetailRailProps {
  /** FULL-set payload row index of the clicked node. */
  index: number;
  /** Resident labels for the same row (instant context while detail loads). */
  labels: ActivityHoverLabels;
  /** Unknown-author share from the payload meta coverage (honest context line). */
  unknownAuthorRate: number;
  onClose: () => void;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function EventStory({
  index,
  labels,
}: {
  index: number;
  labels: ActivityHoverLabels;
}): React.JSX.Element {
  const detail = trpc.activityUniverse.eventDetail.useQuery(
    { index, expectedProjectGuid: labels.projectGuid },
    { staleTime: Infinity, retry: 1 },
  );

  let body: React.JSX.Element;
  if (detail.isLoading) {
    body = <div className="text-[11px] text-muted-foreground">Loading event details…</div>;
  } else if (detail.isError || !detail.data) {
    body = (
      <div className="text-[11px] text-muted-foreground">
        Details unavailable — the event story could not be fetched.
      </div>
    );
  } else if (detail.data.stale) {
    body = (
      <div className="text-[11px] text-muted-foreground">
        Details unavailable ({detail.data.reason}).
      </div>
    );
  } else {
    const d = detail.data;
    body = (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">Object</dt>
        <dd className="truncate text-right font-medium" title={d.objectName ?? undefined}>
          {d.objectName ?? "—"}
          {d.objectType ? ` (${d.objectType})` : ""}
        </dd>
        <dt className="text-muted-foreground">Folder</dt>
        <dd className="truncate text-right font-medium" title={d.folderName ?? undefined}>
          {d.folderName ?? "—"}
        </dd>
        <dt className="text-muted-foreground">Project</dt>
        <dd className="truncate text-right font-medium">{d.projectName ?? d.projectId ?? "—"}</dd>
        <dt className="text-muted-foreground">When</dt>
        <dd className="text-right font-medium">{fmtTimestamp(d.createdAt)}</dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd className="text-right font-medium">
          {d.source === "accds" ? "web-session crawl" : "Data Connector"}
        </dd>
      </dl>
    );
  }

  return (
    <div data-testid="activity-event-story" className="border-b border-border/30 px-4 py-3">
      <div className="truncate text-sm font-semibold text-foreground">{labels.verb}</div>
      <div className="truncate text-[11px] text-muted-foreground">
        {labels.module} · {labels.month}
      </div>
      <div className="mt-2">{body}</div>
    </div>
  );
}

export function ActivityDetailRail({
  index,
  labels,
  unknownAuthorRate,
  onClose,
}: ActivityDetailRailProps): React.JSX.Element {
  return (
    <div data-testid="activity-detail-rail" className="absolute inset-y-0 right-0 z-20 w-[340px]">
      {labels.isUnknownAuthor ? (
        <aside className="flex h-full w-full flex-col border-l border-border/30 bg-card">
          <header className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold">Activity event</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
            >
              Close
            </button>
          </header>
          <div className="flex-1 overflow-y-auto">
            <EventStory index={index} labels={labels} />
            <div className="px-4 py-3">
              <div className="rounded-md border bg-popover p-3">
                <div className="text-sm font-semibold text-foreground">Unknown author</div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This event could not be attributed to a directory user.{" "}
                  {(unknownAuthorRate * 100).toFixed(2)}% of the corpus shares this bucket —
                  shown honestly rather than guessed.
                </p>
              </div>
            </div>
          </div>
        </aside>
      ) : (
        <UserProfilePanel
          user={null}
          email={labels.author}
          variant="rail"
          onClose={onClose}
          railPrelude={<EventStory index={index} labels={labels} />}
        />
      )}
    </div>
  );
}
