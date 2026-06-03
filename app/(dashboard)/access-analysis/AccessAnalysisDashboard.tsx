"use client";
import { useEffect, useState } from "react";
import { useAccessFilters } from "./store";
import { useUsers } from "./queries";
import { serializeFilters } from "./filterParams";
import { FilterBar, type FilterOptions } from "./components/FilterBar";
import { UserTable } from "./components/UserTable";

export function AccessAnalysisDashboard({ filterOptions }: { filterOptions: FilterOptions }) {
  const { filters } = useAccessFilters();
  const [page, setPage] = useState(0);
  const size = 50;
  const filterKey = serializeFilters(filters);
  useEffect(() => { setPage(0); }, [filterKey]);

  const users = useUsers(filters, page, size);
  // Export stays the flat per-(user, project) CSV so no detail is lost on download.
  const exportHref = `/api/access-analysis/members?filters=${encodeURIComponent(filterKey)}&format=csv`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <FilterBar options={filterOptions} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <UserTable
          rows={users.data?.rows ?? []}
          total={users.data?.total ?? 0}
          page={page} size={size} onPage={setPage}
          exportHref={exportHref} loading={users.isLoading} />
      </div>
    </div>
  );
}
