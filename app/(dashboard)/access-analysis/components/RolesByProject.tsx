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

/**
 * Project multi-select wrapper around the roles donut. The user keeps a set of
 * selected projects (all selected by default); the search box narrows which
 * project checkboxes are shown, and Select all / Clear act on the currently
 * visible (searched) list. The donut re-runs the pure `summarizeRoles` on the
 * selected projects' memberships, so it updates the instant a box is toggled.
 */
export function RolesByProject({ rows }: { rows: ProjectRoleRow[] }) {
  const options = useMemo(() => projectOptions(rows), [rows]);
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

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative w-80">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden>
              ⌕
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
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-7 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <span data-testid="project-summary" className="shrink-0 whitespace-nowrap text-xs text-zinc-400">
            {summary}
          </span>
        </div>

        {open && (
          <div
            role="listbox"
            aria-label="Projects"
            className="absolute left-0 right-0 top-11 z-20 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-200 hover:bg-zinc-800"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearVisible}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-200 hover:bg-zinc-800"
                >
                  Clear
                </button>
              </div>
              <span className="text-zinc-500">{visible.length.toLocaleString()} shown</span>
            </div>

            <ul className="max-h-64 list-none overflow-auto py-1">
              {visible.length === 0 ? (
                <li className="px-3 py-2 text-xs text-zinc-500">No projects match.</li>
              ) : (
                visible.map((o) => (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800/70">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-indigo-500"
                      />
                      <span className="truncate" title={o.name}>
                        {o.name}
                      </span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      <RolesPieChart data={slices} distinctRoles={distinctRoles} />
    </div>
  );
}
