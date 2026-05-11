"use client";

/**
 * Phase 04.1 Plan 03 — RecentlyAddedWidget rewrite (DASH-06).
 * Phase 03 Plan 04 — ACTV-04 WHO-added-WHOM row list added BELOW the heatmap.
 *
 * Layout (top-to-bottom):
 *   1. Header: segmented window [7d|30d|90d] (default 30d) + CSV download.
 *   2. Active filter pill: "Filtered by Jane Doe ×" (only when inviterFilter set).
 *   3. GitHub-style 90-day calendar heatmap (existing 04.1 behavior — unchanged).
 *      NOTE: When inviterFilter is active the heatmap is NOT visually filtered
 *      (CONTEXT.md does not require it). Documented in 03-04-SUMMARY.md.
 *   4. Row list (NEW — ACTV-04): up to 10 invitations newest-first, stacked
 *      avatars (invitee 28px in front, inviter 22px behind w/ 6px overlap),
 *      "(+N others)" suffix with hover popover, "Invited by Unknown" warning
 *      for unresolved inviters, click inviter → setInviterFilter (relaxes
 *      time window server-side per Plan 02 contract).
 *
 *   - 13 cols × 7 rows = 91 cells; first cell is a half-cell pad so the
 *     trailing column lands on `today`.
 *   - Color = scaleSequential(interpolateBlues) over per-day join count.
 *   - Window selector (7d / 30d / 90d, default 30d) dims out-of-band cells.
 *   - Click → SelectionContext setSelected({ kind: "day", dateIso, emails }).
 *   - Hover tooltip = aggregate count only (no member names — CONTEXT lock).
 *   - Local TZ bucketing via date-fns format("yyyy-MM-dd") (Pitfall 5).
 *   - Reduced-motion: entrance fade collapses to instant via useTransition.
 *   - Keyboard nav: arrow keys traverse, Enter dispatches setSelected.
 */

import { useCallback, useMemo, useState } from "react";
import { Download, AlertTriangle, X } from "lucide-react";
import { motion } from "framer-motion";
import { timeDays } from "d3-time";
import { scaleSequential } from "d3-scale";
import { interpolateBlues } from "d3-scale-chromatic";
import {
  format,
  formatDistanceToNow,
  parseISO,
  startOfDay,
  subDays,
  differenceInCalendarDays,
} from "date-fns";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";

import { useSelection } from "../selectionContext";
import {
  CELL_SPRING,
  HOVER_OPACITY_DIM,
  HOVER_OPACITY_FOCUS,
  useDashboardAccent,
} from "./_shared/dashboardTokens";
import { useTransition } from "./_shared/useTransition";
import { CalendarSkeleton } from "./_shared/WidgetSkeleton";

const WINDOWS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

const COLS = 13;
const ROWS = 7;
const CELL = 14;
const GAP = 2;
const PAD_LEFT = 8;
const PAD_TOP = 8;
const TOTAL_DAYS = 90;
const SVG_W = PAD_LEFT * 2 + COLS * (CELL + GAP) - GAP;
const SVG_H = PAD_TOP * 2 + ROWS * (CELL + GAP) - GAP;

const ROW_LIST_LIMIT = 10;

// Stacked-avatar sizing (CONTEXT.md: invitee front ~28px, inviter behind smaller w/ ~6px overlap).
const INVITEE_AVATAR_PX = 28;
const INVITER_AVATAR_PX = 22;
const AVATAR_OVERLAP_PX = 6;

interface DayCell {
  date: Date;
  dateIso: string;       // yyyy-MM-dd, local TZ
  emails: string[];
  count: number;
  col: number;
  row: number;
  cellIdx: number;       // 0..(COLS*ROWS)-1
}

/* ------------------------------------------------------------------ helpers */

function initialsFromName(name: string | null | undefined, fallbackEmail?: string | null): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    const first = parts[0]?.charAt(0) ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
    const initials = (first + last).toUpperCase();
    if (initials) return initials;
  }
  const local = (fallbackEmail ?? "").split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

/* ------------------------------------------------------------------ avatars */

interface AvatarCircleProps {
  size: number;
  label: string;          // initials
  title?: string;
  bg?: string;
  ring?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  unresolved?: boolean;   // grey + warning indicator
}

function AvatarCircle({
  size,
  label,
  title,
  bg = "#E5E7EB",
  ring,
  onClick,
  ariaLabel,
  unresolved,
}: AvatarCircleProps) {
  const fontSize = Math.max(9, Math.floor(size * 0.4));
  const interactive = !!onClick;
  return (
    <span
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-label={ariaLabel}
      title={title}
      style={{
        width: size,
        height: size,
        fontSize,
        background: unresolved ? "#F3F4F6" : bg,
        boxShadow: ring ? "0 0 0 2px #fff" : undefined,
        cursor: interactive ? "pointer" : "default",
      }}
      className={
        "inline-flex items-center justify-center rounded-full text-foreground/80 font-medium select-none " +
        (interactive ? "hover:ring-2 hover:ring-primary/40 transition-shadow" : "")
      }
    >
      {unresolved ? (
        <AlertTriangle size={Math.floor(size * 0.5)} className="text-amber-600" />
      ) : (
        label
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ pill */

function InviterFilterPill({
  inviterName,
  onClear,
}: {
  inviterName: string;
  onClear: () => void;
}) {
  return (
    <span
      data-testid="recently-added-inviter-filter-pill"
      className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1.5 py-0.5"
    >
      <span className="font-medium">Filtered by:</span>
      <span className="truncate max-w-[180px]">{inviterName}</span>
      <button
        onClick={onClear}
        aria-label={`Clear filter for ${inviterName}`}
        className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ row */

interface InvitationRow {
  activityId: string;
  createdAt: string | Date;
  projectId: string | null;
  rawAction: string;
  inviterAutodeskId: string;
  inviterName: string | null;
  inviterEmail: string | null;
  inviteeEmail: string | null;
  inviteeName: string | null;
  inviteeAutodeskId: string | null;
}

interface InvitationGroup {
  inviteeEmail: string | null;
  inviteeName: string | null;
  primary: InvitationRow;
  others: InvitationRow[];
}

function InvitationRowItem({
  group,
  onInviterClick,
}: {
  group: InvitationGroup;
  onInviterClick: (autodeskId: string, name: string | null) => void;
}) {
  const [hoverOthers, setHoverOthers] = useState(false);
  const { primary, others } = group;
  const inviterUnresolved = !primary.inviterName;
  const inviteeUnresolved = !primary.inviteeName && !primary.inviteeEmail;

  const inviteeInitials = initialsFromName(primary.inviteeName, primary.inviteeEmail);
  const inviterInitials = initialsFromName(primary.inviterName, primary.inviterEmail);

  const createdAtDate =
    typeof primary.createdAt === "string" ? parseISO(primary.createdAt) : primary.createdAt;
  const ago = formatDistanceToNow(createdAtDate, { addSuffix: false });

  const inviterDisplay = primary.inviterName ?? "Unknown";
  const inviteeDisplay =
    primary.inviteeName ?? primary.inviteeEmail ?? "Unknown invitee";

  const handleInviterClick = () => {
    if (inviterUnresolved) return;
    onInviterClick(primary.inviterAutodeskId, primary.inviterName);
  };

  return (
    <li className="flex items-center gap-3 py-1.5 px-1 rounded-md hover:bg-muted/40 transition-colors">
      {/* Stacked avatars — invitee in front, inviter behind */}
      <span
        className="relative shrink-0 inline-block"
        style={{
          width: INVITEE_AVATAR_PX + INVITER_AVATAR_PX - AVATAR_OVERLAP_PX,
          height: INVITEE_AVATAR_PX,
        }}
      >
        <span
          className="absolute"
          style={{
            top: (INVITEE_AVATAR_PX - INVITER_AVATAR_PX) / 2,
            left: 0,
            zIndex: 0,
          }}
        >
          <AvatarCircle
            size={INVITER_AVATAR_PX}
            label={inviterInitials}
            title={inviterUnresolved ? "Unknown inviter" : `Inviter: ${inviterDisplay}`}
            ariaLabel={
              inviterUnresolved
                ? "Inviter unresolved"
                : `Filter by inviter ${inviterDisplay}`
            }
            unresolved={inviterUnresolved}
            onClick={inviterUnresolved ? undefined : handleInviterClick}
            bg="#D1D5DB"
          />
        </span>
        <span
          className="absolute"
          style={{
            top: 0,
            left: INVITER_AVATAR_PX - AVATAR_OVERLAP_PX,
            zIndex: 1,
          }}
        >
          <AvatarCircle
            size={INVITEE_AVATAR_PX}
            label={inviteeInitials}
            title={inviteeUnresolved ? "Unknown invitee" : `Invitee: ${inviteeDisplay}`}
            unresolved={inviteeUnresolved}
            ring
            bg="#DBEAFE"
          />
        </span>
      </span>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-foreground/90 truncate">
          {inviterUnresolved ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <AlertTriangle size={11} className="text-amber-600" />
              Invited by Unknown
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInviterClick}
              className="font-medium hover:underline"
              aria-label={`Filter by ${inviterDisplay}`}
            >
              {inviterDisplay}
            </button>
          )}
          <span className="text-muted-foreground"> invited </span>
          <span className="font-medium">{inviteeDisplay}</span>
          {others.length > 0 && (
            <span
              className="relative ml-1 text-muted-foreground cursor-default"
              onMouseEnter={() => setHoverOthers(true)}
              onMouseLeave={() => setHoverOthers(false)}
            >
              (+{others.length} {others.length === 1 ? "other" : "others"})
              {hoverOthers && (
                <span className="absolute left-0 bottom-full mb-1 z-50 min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-lg p-2 text-[11px]">
                  <div className="font-semibold mb-1">Also invited by:</div>
                  <ul className="space-y-0.5">
                    {others.map((o) => {
                      const d =
                        typeof o.createdAt === "string"
                          ? parseISO(o.createdAt)
                          : o.createdAt;
                      return (
                        <li key={o.activityId} className="flex justify-between gap-2">
                          <span>{o.inviterName ?? "Unknown"}</span>
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(d, { addSuffix: true })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </span>
              )}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {primary.projectId ?? "—"} · {ago} ago
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ widget */

export function RecentlyAddedWidget({ users }: { users: BulkAccUser[] }) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [inviterFilter, setInviterFilter] = useState<{
    autodeskId: string;
    name: string | null;
  } | null>(null);
  const { setSelected } = useSelection();
  const { neutral } = useDashboardAccent();
  const transition = useTransition(CELL_SPRING);

  // ----- invitation row list (ACTV-04 backend) -----------------------------
  const invitationsQuery = trpc.accActivity.listInvitations.useQuery(
    {
      windowDays,
      inviterFilter: inviterFilter?.autodeskId,
      limit: 100,
    },
    {
      staleTime: 60_000,
      retry: false,
    },
  );
  const invitationGroups = (invitationsQuery.data?.invitations ?? []) as InvitationGroup[];
  const visibleGroups = invitationGroups.slice(0, ROW_LIST_LIMIT);

  const clearInviterFilter = useCallback(() => setInviterFilter(null), []);
  const handleInviterClick = useCallback(
    (autodeskId: string, name: string | null) => {
      setInviterFilter({ autodeskId, name });
    },
    [],
  );

  // ----- bucket users by local-date string (Pitfall 5) ---------------------
  const countsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const u of users) {
      if (!u.addedOn) continue;
      let key: string;
      try {
        key = format(parseISO(u.addedOn), "yyyy-MM-dd");
      } catch {
        continue;
      }
      const arr = map.get(key);
      if (arr) arr.push(u.email);
      else map.set(key, [u.email]);
    }
    return map;
  }, [users]);

  // ----- 90-day grid -------------------------------------------------------
  const cells: DayCell[] = useMemo(() => {
    const today = startOfDay(new Date());
    const start = subDays(today, TOTAL_DAYS - 1);
    const days = timeDays(start, subDays(today, -1)); // inclusive of today
    // Layout 13×7 = 91 cells; offset days so the LAST cell lands on today.
    // First slot (idx 0) is a phantom pad cell.
    const padCount = COLS * ROWS - days.length; // typically 1
    const out: DayCell[] = [];
    for (let i = 0; i < days.length; i++) {
      const idx = i + padCount;
      const d = days[i]!;
      const dateIso = format(d, "yyyy-MM-dd");
      const emails = countsByDay.get(dateIso) ?? [];
      out.push({
        date: d,
        dateIso,
        emails,
        count: emails.length,
        col: Math.floor(idx / ROWS),
        row: idx % ROWS,
        cellIdx: idx,
      });
    }
    return out;
  }, [countsByDay]);

  const maxCount = useMemo(() => {
    let m = 0;
    for (const c of cells) if (c.count > m) m = c.count;
    return Math.max(1, m);
  }, [cells]);

  const colorScale = useMemo(
    () => scaleSequential(interpolateBlues).domain([0, maxCount]),
    [maxCount],
  );

  const today = useMemo(() => startOfDay(new Date()), []);

  // ----- empty state -------------------------------------------------------
  const totalAddedAnyTime = countsByDay.size;
  const totalInWindow = useMemo(
    () =>
      cells.reduce(
        (acc, c) =>
          differenceInCalendarDays(today, c.date) < windowDays
            ? acc + c.count
            : acc,
        0,
      ),
    [cells, windowDays, today],
  );

  // ----- CSV ---------------------------------------------------------------
  const handleDownload = useCallback(() => {
    const rows: Array<Record<string, string>> = [];
    for (const c of cells) {
      const inWindow = differenceInCalendarDays(today, c.date) < windowDays;
      if (!inWindow) continue;
      for (const email of c.emails) {
        const u = users.find((x) => x.email === email);
        rows.push({
          Date: c.dateIso,
          Email: email,
          Name: u?.name ?? "",
          CompanyRole: u?.companyRole ?? "",
        });
      }
    }
    downloadCsv(`recently-added-${windowDays}d.csv`, rows);
  }, [cells, today, users, windowDays]);

  // ----- keyboard nav ------------------------------------------------------
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (focusedIdx === null) return;
      const dx =
        e.key === "ArrowRight" ? ROWS : e.key === "ArrowLeft" ? -ROWS : 0;
      const dy =
        e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (dx === 0 && dy === 0 && e.key !== "Enter") return;
      e.stopPropagation();
      e.preventDefault();
      if (e.key === "Enter") {
        const c = cells.find((x) => x.cellIdx === focusedIdx);
        if (c && c.count > 0) {
          setSelected({ kind: "day", dateIso: c.dateIso, emails: c.emails });
        }
        return;
      }
      const next = focusedIdx + dx + dy;
      if (next >= 0 && next < COLS * ROWS) {
        setFocusedIdx(next);
      }
    },
    [cells, focusedIdx, setSelected],
  );

  // ----- "See all" handler -------------------------------------------------
  // CONTEXT decision: "See all" reuses the existing kind:"day" side-panel by
  // dispatching today's date + the union of invitee emails from the current
  // list. This keeps the panel handler unchanged. A richer kind:"invitations"
  // body is deferred (CONTEXT.md "Phase 5 may add").
  const handleSeeAll = useCallback(() => {
    const todayIso = format(today, "yyyy-MM-dd");
    const emails = Array.from(
      new Set(
        invitationGroups
          .map((g) => g.primary.inviteeEmail)
          .filter((e): e is string => !!e),
      ),
    );
    setSelected({ kind: "day", dateIso: todayIso, emails });
  }, [invitationGroups, setSelected, today]);

  // ----- loading / empty (heatmap section) ---------------------------------
  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <CalendarSkeleton width={SVG_W + 40} height={SVG_H + 20} />
      </div>
    );
  }

  if (totalAddedAnyTime === 0 && visibleGroups.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled
          >
            <Download className="mr-2 size-4" />
            Download CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground py-12 text-center">
          No recently-added members in last 90 days.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header: window selector + CSV button */}
      <div className="flex items-center justify-between gap-2">
        <span className="sr-only">
          {totalInWindow} members added in last {windowDays} days
        </span>
        <div
          className="inline-flex rounded-md border"
          role="group"
          aria-label="Window"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={windowDays === w}
              onClick={() => setWindowDays(w)}
              className={
                "px-3 py-1 text-xs first:rounded-l-md last:rounded-r-md " +
                (windowDays === w
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted")
              }
            >
              {w}d
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>

      {/* Active inviter filter pill (ACTV-04) */}
      {inviterFilter && (
        <div className="flex items-center gap-2">
          <InviterFilterPill
            inviterName={inviterFilter.name ?? "Unknown"}
            onClear={clearInviterFilter}
          />
          <span className="text-[10px] text-muted-foreground">
            time-window filter relaxed
          </span>
        </div>
      )}

      {/* Heatmap */}
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-roledescription="90 day join calendar"
        aria-label={`${totalInWindow} members added in last ${windowDays} days`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocusedIdx((p) => p ?? cells[cells.length - 1]?.cellIdx ?? 0)}
        style={{ outline: "none" }}
      >
        {cells.map((c) => {
          const x = PAD_LEFT + c.col * (CELL + GAP);
          const y = PAD_TOP + c.row * (CELL + GAP);
          const daysFromToday = differenceInCalendarDays(today, c.date);
          const inWindow = daysFromToday >= 0 && daysFromToday < windowDays;
          const targetOpacity = inWindow
            ? HOVER_OPACITY_FOCUS
            : HOVER_OPACITY_DIM;
          const fill = c.count === 0 ? neutral : colorScale(c.count);
          const isInteractive = c.count > 0;
          const focused = focusedIdx === c.cellIdx;

          return (
            <motion.rect
              key={c.cellIdx}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2}
              fill={fill}
              fillOpacity={c.count === 0 ? 0.35 : 1}
              stroke={focused ? "currentColor" : "none"}
              strokeWidth={focused ? 1.5 : 0}
              initial={{ opacity: 0 }}
              animate={{ opacity: targetOpacity }}
              transition={{
                ...transition,
                delay: c.col * 0.005,
              }}
              onClick={
                isInteractive
                  ? () =>
                      setSelected({
                        kind: "day",
                        dateIso: c.dateIso,
                        emails: c.emails,
                      })
                  : undefined
              }
              style={{
                cursor: isInteractive ? "pointer" : "default",
              }}
              aria-label={`${format(c.date, "PPP")}: ${c.count} member${
                c.count === 1 ? "" : "s"
              } added`}
            >
              <title>
                {`${format(c.date, "EEE MMM d")}: ${c.count} member${
                  c.count === 1 ? "" : "s"
                }`}
              </title>
            </motion.rect>
          );
        })}
      </svg>

      {/* Row list (ACTV-04) */}
      <div className="flex flex-col gap-1 mt-1 border-t pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent invitations
          </h4>
          {invitationGroups.length > ROW_LIST_LIMIT && (
            <button
              type="button"
              onClick={handleSeeAll}
              data-testid="recently-added-see-all"
              className="text-[11px] text-primary hover:underline"
            >
              See all →
            </button>
          )}
        </div>

        {invitationsQuery.isLoading && (
          <p className="text-[11px] text-muted-foreground py-2">
            Loading invitations…
          </p>
        )}

        {!invitationsQuery.isLoading &&
          visibleGroups.length === 0 &&
          inviterFilter && (
            <div className="text-[11px] text-muted-foreground py-2 flex items-center gap-2">
              <span>
                No invitations by {inviterFilter.name ?? "this inviter"}.
              </span>
              <button
                type="button"
                onClick={clearInviterFilter}
                className="text-primary hover:underline"
              >
                Clear filter
              </button>
            </div>
          )}

        {!invitationsQuery.isLoading &&
          visibleGroups.length === 0 &&
          !inviterFilter && (
            <p className="text-[11px] text-muted-foreground py-2">
              No invitations in the last {windowDays} days.
            </p>
          )}

        {visibleGroups.length > 0 && (
          <ul className="flex flex-col">
            {visibleGroups.map((g) => (
              <InvitationRowItem
                key={
                  g.primary.activityId +
                  ":" +
                  (g.inviteeEmail ?? g.primary.activityId)
                }
                group={g}
                onInviterClick={handleInviterClick}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
