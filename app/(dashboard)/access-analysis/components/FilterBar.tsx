"use client";
import { useAccessFilters } from "../store";
import { MultiSelectCombobox, type Option } from "./MultiSelectCombobox";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { MODULES } from "../modules";

export interface FilterOptions { projects: Option[]; companies: Option[]; roles: Option[] }

export function FilterBar({ options }: { options: FilterOptions }) {
  const { filters, toggle, setSingle, setSearch } = useAccessFilters();
  const moduleOptions: Option[] = MODULES.map((m) => ({ value: m.id, label: m.label }));
  return (
    <div className="sticky top-0 z-40 flex flex-col gap-2 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, projects, companies…"
          className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600" />
        <MultiSelectCombobox label="Project" placeholder="Search projects" options={options.projects} selected={filters.projectId} onToggle={(v) => toggle("projectId", v)} />
        <MultiSelectCombobox label="Company" placeholder="Search companies" options={options.companies} selected={filters.company} onToggle={(v) => toggle("company", v)} />
        <MultiSelectCombobox label="Role" placeholder="Search roles" options={options.roles} selected={filters.role} onToggle={(v) => toggle("role", v)} />
        <MultiSelectCombobox label="Module" placeholder="Search modules" options={moduleOptions} selected={filters.module} onToggle={(v) => toggle("module", v)} />
        <button onClick={() => setSingle("internalExternal", "internal")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${filters.internalExternal === "internal" ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>Internal</button>
        <button onClick={() => setSingle("internalExternal", "external")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${filters.internalExternal === "external" ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>External</button>
        <button onClick={() => setSingle("adminMember", "admin")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${filters.adminMember === "admin" ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>Admins</button>
      </div>
      <ActiveFilterChips />
    </div>
  );
}
