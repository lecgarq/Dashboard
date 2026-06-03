"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RolesPieChart } from "./RolesPieChart";
import { summarizeRoles } from "../roleCounts";
import {
  projectOptions,
  filterProjectOptions,
  filterRowsBySelection,
  type ProjectRoleRow,
} from "../projectFilter";

// Scoped via the unique `rbp-` prefix so the global <style> can't leak. Holds
// the panel entrance animation and a slim custom scrollbar for the list.
const PICKER_CSS = `
@keyframes rbpDropIn { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
.rbp-panel { animation: rbpDropIn .16s cubic-bezier(.16, 1, .3, 1); transform-origin: top center; }
.rbp-scroll::-webkit-scrollbar { width: 9px; }
.rbp-scroll::-webkit-scrollbar-thumb { background: rgba(113,113,122,.35); border-radius: 9999px; border: 2px solid transparent; background-clip: padding-box; }
.rbp-scroll::-webkit-scrollbar-thumb:hover { background: rgba(129,140,248,.55); background-clip: padding-box; }
.rbp-scroll::-webkit-scrollbar-track { background: transparent; }
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
 * Project multi-select wrapper around the roles donut. The user keeps a set of
 * selected projects (all selected by default); the search box narrows which
 * project checkboxes are shown, and Select all / Clear act on the currently
 * visible (searched) list. The donut re-runs the pure `summarizeRoles` on the
 * selected projects' memberships, so it updates the instant a box is toggled.
 */
export function RolesByProject({ rows }: { rows: ProjectRoleRow[] }) {
  const options = useMemo(() => projectOptions(rows), [rows]);
  const countsById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
    return m;
  }, [rows]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(options.map((o) => o.id)));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => filterProjectOptions(options, query), [options, query]);

  const { slices, distinctRoles } = useMemo(() => {
    const summary = summarizeRoles(filterRowsBySelection(rows, selected));
    return { slices: summary.slices, distinctRoles: summary.distinctRoles };
  }, [rows, selected]);

  const total = options.length;
  const selectedCount = selected.size;
  const allSelected = total > 0 && selectedCount === total;
  const pct = total > 0 ? (selectedCount / total) * 100 : 0;

  // Close the dropdown on outside click or Escape.
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

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of visible) next.add(o.id);
      return next;
    });
  const clearVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of visible) next.delete(o.id);
      return next;
    });

  const summary = allSelected
    ? "All projects"
    : `${selectedCount.toLocaleString()} of ${total.toLocaleString()} projects`;
  const dotColor = allSelected ? "bg-emerald-400" : selectedCount === 0 ? "bg-amber-400" : "bg-indigo-400";

  return (
    <div className="flex flex-col gap-4">
      <style>{PICKER_CSS}</style>

      <div ref={containerRef} className="relative w-full max-w-lg">
        <div className="flex items-center gap-2.5">
          {/* Search field */}
          <div className="group relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400" aria-hidden>
              <IconSearch />
            </span>
            <input
              data-testid="project-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="Search projects…"
              aria-label="Search and select projects"
              aria-expanded={open}
              className="w-full rounded-xl border border-zinc-700/70 bg-gradient-to-b from-zinc-800/50 to-zinc-900/80 py-2.5 pl-10 pr-10 text-sm text-zinc-100 shadow-inner shadow-black/20 transition placeholder:text-zinc-500 focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Reset search"
                  className="grid h-5 w-5 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-700/60 hover:text-zinc-200"
                >
                  ✕
                </button>
              ) : (
                <span aria-hidden><IconChevron open={open} /></span>
              )}
            </span>
          </div>

          {/* Selection summary pill */}
          <span
            data-testid="project-summary"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-700/70 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shadow-[0_0_6px_currentColor]`} aria-hidden />
            {summary}
          </span>
        </div>

        {/* Selection meter */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800/80" aria-hidden>
          <div
            className={`h-full rounded-full transition-all duration-300 ${allSelected ? "bg-emerald-400/80" : "bg-indigo-400/80"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div
            role="group"
            aria-label="Projects"
            className="rbp-panel absolute left-0 z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-900/85 shadow-2xl shadow-black/60 ring-1 ring-black/40 backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden />

            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/40 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-white"
                >
                  <span className="text-indigo-400" aria-hidden><IconCheck /></span>
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearVisible}
                  className="rounded-lg border border-zinc-700/70 bg-zinc-800/40 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                >
                  Clear
                </button>
              </div>
              <span className="rounded-md bg-zinc-800/70 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-400">
                {visible.length.toLocaleString()} shown
              </span>
            </div>

            <ul className="rbp-scroll max-h-72 list-none overflow-auto py-1.5">
              {visible.length === 0 ? (
                <li className="flex flex-col items-center gap-1 px-3 py-8 text-center text-xs text-zinc-500">
                  <span className="text-zinc-600"><IconSearch /></span>
                  No projects match “{query.trim()}”.
                </li>
              ) : (
                visible.map((o) => {
                  const on = selected.has(o.id);
                  return (
                    <li key={o.id} className="relative px-1.5">
                      <span
                        aria-hidden
                        className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-indigo-400 transition-opacity ${on ? "opacity-100" : "opacity-0"}`}
                      />
                      <label
                        title={`${o.name} · ${(countsById.get(o.id) ?? 0).toLocaleString()} memberships`}
                        className={`group/row flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                          on ? "bg-indigo-500/[0.07] text-zinc-100" : "text-zinc-300 hover:bg-white/[0.04]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(o.id)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-all ${
                            on
                              ? "border-indigo-500 bg-indigo-500 text-white shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
                              : "border-zinc-600 bg-zinc-800/60 text-transparent group-hover/row:border-zinc-500"
                          }`}
                        >
                          <span className={`transition-transform duration-150 ${on ? "scale-100" : "scale-50"}`}>
                            <IconCheck />
                          </span>
                        </span>
                        <span className="flex-1 truncate">{o.name}</span>
                        <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">
                          {(countsById.get(o.id) ?? 0).toLocaleString()}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex items-center justify-between border-t border-zinc-800/80 px-3 py-1.5 text-[11px] text-zinc-500">
              <span>
                <b className="text-zinc-300">{selectedCount.toLocaleString()}</b> selected
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-zinc-700 bg-zinc-800/70 px-1 py-px font-mono text-[10px] text-zinc-400">Esc</kbd>
                to close
              </span>
            </div>
          </div>
        )}
      </div>

      <RolesPieChart data={slices} distinctRoles={distinctRoles} />
    </div>
  );
}
