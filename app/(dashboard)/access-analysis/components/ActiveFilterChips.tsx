"use client";
import { useAccessFilters } from "../store";

export function ActiveFilterChips() {
  const { filters, toggle, setSingle, setSearch, setDateRange, clearAll, activeCount } = useAccessFilters();
  if (activeCount() === 0) return null;
  const chip = (text: string, onRemove: () => void) => (
    <button key={text} onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-200 hover:border-zinc-500">
      {text} <span aria-hidden>×</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.projectId.map((v) => chip(`Project: ${v}`, () => toggle("projectId", v)))}
      {filters.company.map((v) => chip(`Company: ${v}`, () => toggle("company", v)))}
      {filters.role.map((v) => chip(`Role: ${v}`, () => toggle("role", v)))}
      {filters.module.map((v) => chip(`Module: ${v}`, () => toggle("module", v)))}
      {filters.internalExternal ? chip(filters.internalExternal, () => setSingle("internalExternal", null)) : null}
      {filters.adminMember ? chip(filters.adminMember, () => setSingle("adminMember", null)) : null}
      {filters.dateFrom || filters.dateTo ? chip(`Dates`, () => setDateRange(null, null)) : null}
      {filters.search.trim() ? chip(`"${filters.search}"`, () => setSearch("")) : null}
      <button onClick={clearAll} className="text-xs text-zinc-400 underline hover:text-zinc-200">Clear all</button>
    </div>
  );
}
