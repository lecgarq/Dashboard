"use client";

// ---------------------------------------------------------------------------
// PersonRowList.tsx — window-virtualized list for the /users directory
//
// Extracted from UsersDirectoryClient.tsx (USR-01 decomposition, Wave 3).
// No logic changes — this is a pure move.
//
// CRITICAL: The `const [, setMounted] = useState(false); useEffect(() => setMounted(true), [])`
// re-render hack (RESEARCH Pitfall 3) MUST remain verbatim. It forces a
// re-render after parentRef mounts so `scrollMargin: parentRef.current?.offsetTop`
// picks up the real DOM offset. Removing or simplifying it resets scroll position.
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { AggregatedStatus } from "@/lib/acc/accStatusReduction";
import type { OrgPerson } from "./directoryUtils";
import { useVisibleRowEmails } from "./useVisibleRowEmails";
import { PersonRow } from "./PersonRow";

export function PersonRowList({
  list,
  accSummaryMap,
  activatedEmails,
  onPersonClick,
  onHoverEnter,
  onHoverLeave,
  onActivityCellClick,
  onStatusPillClick,
  onAdminPillClick,
}: {
  list: OrgPerson[];
  accSummaryMap: Map<string, BulkAccUser>;
  activatedEmails: Set<string>;
  onPersonClick: (p: OrgPerson) => void;
  onHoverEnter: (email: string) => void;
  onHoverLeave: (email: string) => void;
  onActivityCellClick: (email: string) => void;
  onStatusPillClick?: (status: AggregatedStatus) => void;
  onAdminPillClick?: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // Force re-render once parentRef mounts so scrollMargin picks up its offsetTop.
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const virtualizer = useWindowVirtualizer({
    count: list.length,
    estimateSize: () => 72,
    overscan: 8,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  // LIST-03 (display path): lazy "Last File Activity" column. The hook
  // returns the set of currently-visible row emails; the batch query is
  // keyed on that set and re-fires when the visible window changes. The
  // batch procedure is the ONLY new server hit per scroll — N+1 forbidden
  // (RESEARCH Pitfall 2).
  const { visibleEmails, registerRow } = useVisibleRowEmails();
  const { data: activityByEmail } =
    trpc.accActivity.getLastFileActivityBatch.useQuery(
      { emails: visibleEmails.slice(0, 200) },
      {
        enabled: visibleEmails.length > 0,
        staleTime: 300_000,
        placeholderData: (prev) => prev,
      },
    );

  return (
    <div
      ref={parentRef}
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const person = list[vi.index];
        const registerRefForEmail = registerRow(person.email);
        return (
          <div
            key={person.resourceName}
            data-index={vi.index}
            ref={(el) => {
              // Compose tanstack-virtual's measureElement with the visibility
              // observer's ref. Both must observe the same outer wrapper.
              virtualizer.measureElement(el);
              registerRefForEmail(el);
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
              paddingBottom: 6,
            }}
          >
            <PersonRow
              person={person}
              accSummary={accSummaryMap.get(person.email)}
              onClick={() => onPersonClick(person)}
              activityActive={activatedEmails.has(person.email)}
              onHoverEnter={() => onHoverEnter(person.email)}
              onHoverLeave={() => onHoverLeave(person.email)}
              onActivityCellClick={() => onActivityCellClick(person.email)}
              onStatusPillClick={onStatusPillClick}
              onAdminPillClick={onAdminPillClick}
              activityByEmail={activityByEmail}
            />
          </div>
        );
      })}
    </div>
  );
}
