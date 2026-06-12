"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AnimatedExpand, useEntrance } from "@/components/ui/animated-list";
import { filterProjectOptions, type ProjectOption } from "../projectFilter";
import type { OfficeGroup } from "../projectGroups";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import { CoverageDots, isFullyCovered } from "./CoverageBadges";

// Scoped via the unique `pp-` prefix so the global <style> can't leak.
const PICKER_CSS = `
@keyframes ppDropIn { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
.pp-panel { animation: ppDropIn .16s cubic-bezier(.16, 1, .3, 1); transform-origin: top center; }
.pp-scroll::-webkit-scrollbar { width: 9px; }
.pp-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 9999px; border: 2px solid transparent; background-clip: padding-box; }
.pp-scroll::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); background-clip: padding-box; }
.pp-scroll::-webkit-scrollbar-track { background: transparent; }
`;

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17.5 19 6.5" />
  </svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Reusable project multi-select (checkbox dropdown). The parent owns the
 * `selected` set; this component owns the search box, open/close, select-all /
 * clear, and — when `groups` describes more than one office — collapsible office
 * sections each with their own select-all / clear. `coverage` adds a per-row
 * data-completeness indicator and a "fully covered only" quick filter.
 */
export function ProjectPicker({
  options,
  counts,
  countNoun,
  selected,
  onChange,
  testIdPrefix = "project",
  groups,
  coverage,
}: {
  options: ProjectOption[];
  counts: Map<string, number>;
  countNoun: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  testIdPrefix?: string;
  groups?: OfficeGroup[];
  coverage?: Map<string, ProjectCoverage>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [coveredOnly, setCoveredOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const entrance = useEntrance();

  const hasCoverage = !!coverage && coverage.size > 0;

  // The visible option set: search filter, then optional fully-covered filter.
  const visible = useMemo(() => {
    let v = filterProjectOptions(options, query);
    if (coveredOnly && coverage) v = v.filter((o) => isFullyCovered(coverage.get(o.id)));
    return v;
  }, [options, query, coveredOnly, coverage]);
  const visibleIds = useMemo(() => new Set(visible.map((o) => o.id)), [visible]);

  // Office sections actually worth showing: >1 group, each narrowed to visibleIds.
  const sections = useMemo(() => {
    if (!groups || groups.length <= 1) return null;
    return groups
      .map((g) => ({ ...g, options: g.options.filter((o) => visibleIds.has(o.id)) }))
      .filter((g) => g.options.length > 0);
  }, [groups, visibleIds]);

  const total = options.length;
  const selectedCount = selected.size;
  const allSelected = total > 0 && selectedCount === total;
  const pct = total > 0 ? (selectedCount / total) * 100 : 0;

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

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const addIds = (ids: Iterable<string>) => {
    const next = new Set(selected);
    for (const id of ids) next.add(id);
    onChange(next);
  };
  const removeIds = (ids: Iterable<string>) => {
    const next = new Set(selected);
    for (const id of ids) next.delete(id);
    onChange(next);
  };
  const selectAllVisible = () => addIds(visible.map((o) => o.id));
  const clearVisible = () => removeIds(visible.map((o) => o.id));

  const toggleCollapse = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const summary = allSelected
    ? "All projects"
    : `${selectedCount.toLocaleString()} of ${total.toLocaleString()} projects`;
  const dotColor = allSelected ? "bg-success" : selectedCount === 0 ? "bg-warning" : "bg-primary";

  const renderRow = (o: ProjectOption, idx: number) => {
    const on = selected.has(o.id);
    const cov = coverage?.get(o.id);
    const full = isFullyCovered(cov);
    return (
      <motion.li key={o.id} {...entrance(idx)} className="relative px-1.5">
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-opacity ${
            full ? "bg-success" : "bg-primary"
          } ${on ? "opacity-100" : full ? "opacity-50" : "opacity-0"}`}
        />
        <label
          title={`${o.name} · ${(counts.get(o.id) ?? 0).toLocaleString()} ${countNoun}`}
          className={`group/row flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
            on ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent"
          } ${full && !on ? "bg-success/[0.06]" : ""}`}
        >
          <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="sr-only" />
          <span
            aria-hidden
            className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-all ${
              on
                ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px] shadow-primary/20"
                : "border-border bg-muted text-transparent group-hover/row:border-muted-foreground/60"
            }`}
          >
            <span className={`transition-transform duration-150 ${on ? "scale-100" : "scale-50"}`}>
              <IconCheck />
            </span>
          </span>
          <span className="flex-1 truncate">{o.name}</span>
          {hasCoverage && <CoverageDots coverage={cov} />}
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {(counts.get(o.id) ?? 0).toLocaleString()}
          </span>
        </label>
      </motion.li>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <style>{PICKER_CSS}</style>

      <div className="flex items-center gap-2.5">
        <div className="group relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden>
            <IconSearch />
          </span>
          <input
            data-testid={`${testIdPrefix}-search`}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Search projects…"
            aria-label="Search and select projects"
            aria-expanded={open}
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-10 text-sm text-foreground shadow-inner shadow-black/10 transition placeholder:text-muted-foreground focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Reset search"
                className="grid h-5 w-5 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                ✕
              </button>
            ) : (
              <span aria-hidden><IconChevron open={open} /></span>
            )}
          </span>
        </div>

        <span
          data-testid={`${testIdPrefix}-summary`}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shadow-[0_0_6px_currentColor]`} aria-hidden />
          {summary}
        </span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={`h-full rounded-full transition-all duration-300 ${allSelected ? "bg-success" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && (
        <div
          role="group"
          aria-label="Projects"
          className="pp-panel absolute left-0 z-30 mt-2 w-full overflow-hidden rounded-xl border border-surface-border bg-surface-1 shadow-elevated backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" aria-hidden />

          <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectAllVisible}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/10"
              >
                <span className="text-primary" aria-hidden><IconCheck /></span>
                Select all
              </button>
              <button
                type="button"
                onClick={clearVisible}
                className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
              {hasCoverage && (
                <button
                  type="button"
                  onClick={() => setCoveredOnly((v) => !v)}
                  aria-pressed={coveredOnly}
                  title="Show only projects with both activity data and a folder crawl"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    coveredOnly
                      ? "border-success/60 bg-success/15 text-success"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  Full data only
                </button>
              )}
            </div>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {visible.length.toLocaleString()} shown
            </span>
          </div>

          <div className="pp-scroll max-h-80 overflow-auto py-1.5">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-3 py-8 text-center text-xs text-muted-foreground">
                <span className="opacity-60"><IconSearch /></span>
                {coveredOnly && query.trim() === ""
                  ? "No fully-covered projects."
                  : `No projects match “${query.trim()}”.`}
              </div>
            ) : sections ? (
              sections.map((g) => {
                const ids = g.options.map((o) => o.id);
                const selectedInGroup = ids.filter((id) => selected.has(id)).length;
                const coveredInGroup = coverage ? ids.filter((id) => isFullyCovered(coverage.get(id))).length : 0;
                const isCollapsed = collapsed.has(g.code);
                return (
                  <div key={g.code} className="mb-1">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface-1/95 px-2.5 py-1.5 backdrop-blur">
                      <button
                        type="button"
                        onClick={() => toggleCollapse(g.code)}
                        className="flex min-w-0 items-center gap-1.5 text-left"
                      >
                        <span className={`text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden>
                          <IconChevron open={!isCollapsed} />
                        </span>
                        <span className="truncate text-xs font-semibold text-foreground">{g.label}</span>
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                          {selectedInGroup}/{g.options.length}
                        </span>
                        {hasCoverage && coveredInGroup > 0 && (
                          <span className="shrink-0 text-[10px] font-medium text-success" title={`${coveredInGroup} fully covered`}>
                            ✓{coveredInGroup}
                          </span>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => addIds(ids)}
                          aria-label={`Select all in ${g.label}`}
                          className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/10"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => removeIds(ids)}
                          aria-label={`Deselect all in ${g.label}`}
                          className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <AnimatedExpand open={!isCollapsed}>
                      <ul className="list-none">{g.options.map(renderRow)}</ul>
                    </AnimatedExpand>
                  </div>
                );
              })
            ) : (
              <ul className="list-none">{visible.map(renderRow)}</ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              <b className="text-foreground">{selectedCount.toLocaleString()}</b> selected
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">Esc</kbd>
              to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
