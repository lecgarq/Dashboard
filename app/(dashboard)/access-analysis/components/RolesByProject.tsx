"use client";
import { useId, useMemo, useState } from "react";
import { RolesPieChart } from "./RolesPieChart";
import { summarizeRoles } from "../roleCounts";
import {
  filterRowsByProject,
  distinctProjectNames,
  countMatchedProjects,
  type ProjectRoleRow,
} from "../projectFilter";

/**
 * Project-searchable wrapper around the roles donut. Holds the search query and
 * re-runs the pure `summarizeRoles` on the matching memberships, so the chart
 * updates instantly without a server round-trip. An empty query shows the whole
 * account (the original behaviour).
 */
export function RolesByProject({ rows }: { rows: ProjectRoleRow[] }) {
  const [query, setQuery] = useState("");
  const listId = useId();

  const projectNames = useMemo(() => distinctProjectNames(rows), [rows]);
  const totalProjects = projectNames.length;

  const { slices, distinctRoles, matched } = useMemo(() => {
    const filtered = filterRowsByProject(rows, query);
    const summary = summarizeRoles(filtered);
    return { slices: summary.slices, distinctRoles: summary.distinctRoles, matched: countMatchedProjects(filtered) };
  }, [rows, query]);

  const active = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden>
            ⌕
          </span>
          <input
            data-testid="project-search"
            type="search"
            list={listId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project…"
            aria-label="Search by project"
            className="w-72 rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-7 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <datalist id={listId}>
            {projectNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        {active && (
          <span data-testid="project-match" className="text-xs text-zinc-400">
            <b className="text-zinc-100">{matched.toLocaleString()}</b> of {totalProjects.toLocaleString()} projects
          </span>
        )}
        {active && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Clear
          </button>
        )}
      </div>

      <RolesPieChart data={slices} distinctRoles={distinctRoles} />
    </div>
  );
}
