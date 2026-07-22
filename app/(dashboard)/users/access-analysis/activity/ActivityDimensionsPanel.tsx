"use client";

/**
 * ActivityDimensionsPanel.tsx — v2.7 Phase 40 (DIM-07, owner decision 3).
 *
 * The repopulated dimensions sidebar for the activity universe: group-by
 * select (7 dims — author excluded, owner decision 4), color-by select
 * (all 8 dims), and the kept DimensionSlider for grouping strength. Same
 * aside chrome as the retired instance rail (GroupByControls pattern),
 * activity-native data boundary: the shell supplies options, coverage text
 * and counts — this component holds no dimension logic of its own.
 *
 * A dimension whose dict failed to resolve arrives with `disabled: true` and
 * renders as a disabled option — honest degradation, never a blank sidebar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { DimensionSlider } from "../DimensionSlider";

export const GROUP_BY_NONE = "none";

const AUTHOR_SEARCH_CSS = `
@keyframes asDropIn { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
.as-panel { animation: asDropIn .16s cubic-bezier(.16, 1, .3, 1); transform-origin: top center; }
.as-scroll::-webkit-scrollbar { width: 9px; }
.as-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 9999px; border: 2px solid transparent; background-clip: padding-box; }
.as-scroll::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); background-clip: padding-box; }
.as-scroll::-webkit-scrollbar-track { background: transparent; }
`;

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
  </svg>
);

/** Max matched emails surfaced in the suggestion dropdown. */
const MAX_AUTHOR_SUGGESTIONS = 10;

/**
 * Styled user-search combobox — replaces the native datalist. Mirrors the
 * ProjectPicker chrome (search icon, clear affordance, dropdown panel). The
 * suggestion list is derived locally from the resident author labels; clicking
 * a row commits that exact email so the universe narrows to one user. Index 0
 * is the sentinel/unknown slot and is never suggested.
 */
function AuthorSearch({
  authorQuery,
  onAuthorQueryChange,
  authorSuggestions,
  matchedAuthorCount,
  searchPending,
}: Pick<
  ActivityDimensionsPanelProps,
  "authorQuery" | "onAuthorQueryChange" | "authorSuggestions" | "matchedAuthorCount" | "searchPending"
>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const trimmed = authorQuery.trim();

  const matches = useMemo(() => {
    const needle = trimmed.toLocaleLowerCase();
    if (!needle) return [];
    const out: string[] = [];
    for (let i = 1; i < authorSuggestions.length && out.length < MAX_AUTHOR_SUGGESTIONS; i++) {
      if (authorSuggestions[i].toLocaleLowerCase().includes(needle)) out.push(authorSuggestions[i]);
    }
    return out;
  }, [trimmed, authorSuggestions]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showPanel = open && trimmed.length > 0;

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <style>{AUTHOR_SEARCH_CSS}</style>
      <span className="text-sm font-medium">Search users</span>

      <div className="group relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
          aria-hidden
        >
          <IconSearch />
        </span>
        <input
          type="search"
          value={authorQuery}
          onChange={(event) => onAuthorQueryChange(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Email…"
          aria-label="Search users"
          aria-expanded={showPanel}
          autoComplete="off"
          data-testid="activity-author-search"
          className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-9 text-sm text-foreground shadow-inner shadow-black/10 transition placeholder:text-muted-foreground focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        {authorQuery ? (
          <button
            type="button"
            onClick={() => {
              onAuthorQueryChange("");
              setOpen(false);
            }}
            aria-label="Clear user search"
            className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            ✕
          </button>
        ) : null}

        {showPanel ? (
          <div
            role="listbox"
            aria-label="Matching users"
            data-testid="activity-author-suggestions"
            className="as-panel absolute left-0 z-30 mt-2 w-full overflow-hidden rounded-xl border border-surface-border bg-surface-1 shadow-elevated backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" aria-hidden />
            {matches.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                {searchPending ? "Searching…" : `No users match “${trimmed}”.`}
              </div>
            ) : (
              <ul className="as-scroll max-h-64 list-none overflow-auto py-1.5">
                {matches.map((email) => {
                  const active = email === authorQuery;
                  return (
                    <li key={email} className="px-1.5">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onAuthorQueryChange(email);
                          setOpen(false);
                        }}
                        title={email}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <span className="text-muted-foreground/70" aria-hidden>
                          <IconSearch />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{email}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {trimmed ? (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {searchPending
            ? "Searching…"
            : `${matchedAuthorCount.toLocaleString("en-US")} user${matchedAuthorCount === 1 ? "" : "s"} matched`}
        </span>
      ) : null}
    </div>
  );
}

export interface ActivityDimensionOption {
  id: string;
  label: string;
  /** Dict failed to resolve (cardinality 0) — selectable never, hidden never. */
  disabled?: boolean;
}

export interface ActivityDimensionsPanelProps {
  groupByOptions: readonly ActivityDimensionOption[];
  colorByOptions: readonly ActivityDimensionOption[];
  groupBy: string;
  colorBy: string;
  /** 0–100 grouping strength (committed value; shell coalesces morph work). */
  strength: number;
  onGroupByChange: (id: string) => void;
  onColorByChange: (id: string) => void;
  onStrengthChange: (v: number) => void;
  authorQuery: string;
  onAuthorQueryChange: (query: string) => void;
  authorSuggestions: readonly string[];
  matchedAuthorCount: number;
  searchPending: boolean;
  /** "covered/total" for the active group-by dim (null when none / no sentinel gap). */
  groupCoverageText: string | null;
  groupByLabel: string | null;
  /** "covered/total" for the active color-by dim. */
  colorCoverageText: string | null;
  colorByLabel: string;
  residentCount: number;
  renderedCount: number;
}

const fmt = (n: number): string => n.toLocaleString("en-US");

export function ActivityDimensionsPanel({
  groupByOptions,
  colorByOptions,
  groupBy,
  colorBy,
  strength,
  onGroupByChange,
  onColorByChange,
  onStrengthChange,
  authorQuery,
  onAuthorQueryChange,
  authorSuggestions,
  matchedAuthorCount,
  searchPending,
  groupCoverageText,
  groupByLabel,
  colorCoverageText,
  colorByLabel,
  residentCount,
  renderedCount,
}: ActivityDimensionsPanelProps): React.JSX.Element {
  const allGroupDimsDisabled = groupByOptions.every((o) => o.disabled);

  return (
    <aside
      data-testid="activity-dimensions-panel"
      className="flex w-[260px] shrink-0 flex-col border-l bg-card"
    >
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
      </header>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <AuthorSearch
          authorQuery={authorQuery}
          onAuthorQueryChange={onAuthorQueryChange}
          authorSuggestions={authorSuggestions}
          matchedAuthorCount={matchedAuthorCount}
          searchPending={searchPending}
        />

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Group into</span>
          <select
            data-testid="activity-group-by-select"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value={GROUP_BY_NONE}>None · Embedding</option>
            {groupByOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.disabled}>
                {o.disabled ? `${o.label} · unavailable` : o.label}
              </option>
            ))}
          </select>
        </label>

        {allGroupDimsDisabled ? (
          <p className="text-xs text-muted-foreground">
            Dimension dictionaries unavailable — grouping is disabled for this payload.
          </p>
        ) : null}

        {groupBy !== GROUP_BY_NONE ? (
          <DimensionSlider
            dimId={groupBy}
            label="Grouping strength"
            value={strength}
            onChange={onStrengthChange}
            onReset={() => onStrengthChange(0)}
          />
        ) : null}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Color by</span>
          <select
            data-testid="activity-color-by-select"
            value={colorBy}
            onChange={(e) => onColorByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {colorByOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.disabled}>
                {o.disabled ? `${o.label} · unavailable` : o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>Position: Embedding</p>
          <p>
            Group into: {groupByLabel ?? "None"}
            {groupBy !== GROUP_BY_NONE ? ` · ${strength}` : ""}
          </p>
          <p>Color: {colorByLabel}</p>
        </div>

        {groupCoverageText && groupByLabel ? (
          <p data-testid="activity-group-coverage" className="text-xs text-muted-foreground">
            {groupByLabel} data · {groupCoverageText} events
          </p>
        ) : null}
        {colorCoverageText ? (
          <p data-testid="activity-color-coverage" className="text-xs text-muted-foreground">
            {colorByLabel} data · {colorCoverageText} events
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {fmt(residentCount)} events · rendering ~{fmt(renderedCount)}
        </p>

        <p className="text-xs text-muted-foreground">
          0 keeps the embedding · 100 clumps into {groupByLabel ?? "the selected"} groups. Drag to
          morph in real time.
        </p>
      </div>
    </aside>
  );
}
