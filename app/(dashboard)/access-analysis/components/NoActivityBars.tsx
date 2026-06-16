"use client";
import { useState } from "react";
import { PeopleDrillList } from "./PeopleDrillList";
import type { DormantEntity } from "../dormantActivity";

// Zinc/grey — these entities contributed no activity, so they read as "inactive"
// next to the donut's colourful active slices.
const DORMANT_COLOR = "#a1a1aa";
const DEFAULT_TOP = 8;

/** "companies" -> "company", "roles" -> "role". */
const singular = (noun: string) => noun.replace(/s$/, "");

/**
 * "No activity" footer under an activity donut: the entities (companies or roles)
 * with people assigned in the current selection but ZERO recorded activity,
 * ranked by headcount so the biggest "lots of people, nothing happening" gaps
 * surface first. Each row's bar is its headcount; click a row to see the people
 * behind it (their membership seats). Renders nothing when everything in scope
 * has activity.
 */
export function NoActivityBars({
  noun,
  entities,
  onUserClick,
}: {
  /** Plural entity noun: "companies" | "roles". */
  noun: string;
  /** Already sorted desc by userCount (rankDormantByPeople). */
  entities: DormantEntity[];
  /** Open a person's profile (same drawer the donut uses). */
  onUserClick?: (email: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  if (entities.length === 0) return null;

  const max = entities[0]?.userCount || 1;
  const shown = expanded ? entities : entities.slice(0, DEFAULT_TOP);
  const hidden = entities.length - shown.length;
  const openEntity = open ? entities.find((e) => e.label === open) : undefined;
  // Drill share is per-seat, so total = sum of the members' seat counts (not headcount).
  const drillTotal = openEntity ? openEntity.people.reduce((sum, p) => sum + p.count, 0) : 0;

  return (
    <div data-testid={`no-activity-${noun}`} className="mt-4 border-t border-border pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: DORMANT_COLOR }} aria-hidden />
        No activity · {entities.length} {entities.length === 1 ? singular(noun) : noun}
        <span className="font-normal normal-case text-muted-foreground/70">— people assigned, nothing recorded</span>
      </div>

      <ul className="list-none space-y-0.5" style={{ columnWidth: "248px", columnGap: "1.5rem" }}>
        {shown.map((e) => {
          const isOpen = open === e.label;
          const barPct = max > 0 ? (e.userCount / max) * 100 : 0;
          return (
            <li key={e.label} className="break-inside-avoid">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((cur) => (cur === e.label ? null : e.label))}
                title={`${e.label} — ${e.userCount} ${e.userCount === 1 ? "person" : "people"}, 0 activity — click to ${isOpen ? "collapse" : "see who"}`}
                className={`group relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                  isOpen ? "bg-accent text-foreground" : "text-foreground/85"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                  style={{ width: `${barPct}%`, background: DORMANT_COLOR, opacity: isOpen ? 0.3 : 0.18 }}
                />
                <span className="relative flex-1 truncate">{e.label}</span>
                <span className="relative shrink-0 tabular-nums text-muted-foreground">{e.userCount.toLocaleString()}</span>
                <span
                  aria-hidden
                  className={`relative shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                >
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          + {hidden} more
        </button>
      )}

      {openEntity && (
        <PeopleDrillList
          testId={`no-activity-${noun}-drilldown`}
          title={openEntity.label}
          color={DORMANT_COLOR}
          people={openEntity.people}
          total={drillTotal}
          unitNoun="members"
          onUserClick={onUserClick}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
