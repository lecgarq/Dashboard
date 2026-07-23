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
import { ProfileAvatar } from "@/app/(dashboard)/users/ProfileAvatar";

export const GROUP_BY_NONE = "none";

/** Pull the email out of an author label ("Name <a@x.com>" or bare "a@x.com"). */
function emailFromLabel(label: string): string {
  const angle = label.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  const bare = label.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return bare ? bare[0] : label;
}

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
  authorPhotoByEmail,
}: Pick<
  ActivityDimensionsPanelProps,
  | "authorQuery"
  | "onAuthorQueryChange"
  | "authorSuggestions"
  | "matchedAuthorCount"
  | "searchPending"
  | "authorPhotoByEmail"
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
                {matches.map((label) => {
                  const active = label === authorQuery;
                  const email = emailFromLabel(label);
                  return (
                    <li key={label} className="px-1.5">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onAuthorQueryChange(label);
                          setOpen(false);
                        }}
                        title={label}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <ProfileAvatar
                          name={label}
                          email={email}
                          photoUrl={authorPhotoByEmail?.get(email.toLowerCase()) ?? null}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
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
  /** Lowercase email → Google-directory photo URL for the suggestion avatars. */
  authorPhotoByEmail?: ReadonlyMap<string, string>;
  /** Author-role dict labels (slot 0 = the "Unknown" sentinel), filterable. */
  roleOptions: readonly string[];
  roleCounts: ReadonlyMap<string, number>;
  selectedRoles: ReadonlySet<string>;
  onRolesChange: (next: Set<string>) => void;
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

/**
 * Author-role multi-select — narrows the rendered universe the same way the
 * project picker does. Sorted by event count; all-selected = no filter.
 */
function RoleFilter({
  roleOptions,
  roleCounts,
  selectedRoles,
  onRolesChange,
}: Pick<
  ActivityDimensionsPanelProps,
  "roleOptions" | "roleCounts" | "selectedRoles" | "onRolesChange"
>): React.JSX.Element | null {
  const sorted = useMemo(
    () =>
      [...roleOptions].sort(
        (a, b) => (roleCounts.get(b) ?? 0) - (roleCounts.get(a) ?? 0) || a.localeCompare(b),
      ),
    [roleOptions, roleCounts],
  );
  if (roleOptions.length === 0) return null;

  const allSelected = selectedRoles.size === roleOptions.length;
  const toggle = (label: string): void => {
    const next = new Set(selectedRoles);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onRolesChange(next);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="activity-role-filter">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Filter by role</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {allSelected ? "All" : `${fmt(selectedRoles.size)}/${fmt(roleOptions.length)}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onRolesChange(new Set(roleOptions))}
          className="rounded-lg border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/10"
        >
          All
        </button>
        <button
          type="button"
          onClick={() => onRolesChange(new Set())}
          className="rounded-lg border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          None
        </button>
      </div>
      <ul className="as-scroll max-h-52 list-none space-y-0.5 overflow-y-auto rounded-lg border border-border bg-background/60 p-1">
        {sorted.map((label) => {
          const on = selectedRoles.has(label);
          return (
            <li key={label}>
              <label
                title={`${label} · ${fmt(roleCounts.get(label) ?? 0)} events`}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  on ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(label)} className="sr-only" />
                <span
                  aria-hidden
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition-all ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-transparent"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5 10 17.5 19 6.5" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="shrink-0 font-mono tabular-nums text-[10px] text-muted-foreground">
                  {fmt(roleCounts.get(label) ?? 0)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
  authorPhotoByEmail,
  roleOptions,
  roleCounts,
  selectedRoles,
  onRolesChange,
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
          authorPhotoByEmail={authorPhotoByEmail}
        />

        <RoleFilter
          roleOptions={roleOptions}
          roleCounts={roleCounts}
          selectedRoles={selectedRoles}
          onRolesChange={onRolesChange}
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
