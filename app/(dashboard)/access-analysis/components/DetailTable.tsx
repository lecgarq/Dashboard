"use client";
import { useState } from "react";
import {
  useReactTable, getCoreRowModel, getGroupedRowModel, getExpandedRowModel, flexRender,
  type ColumnDef, type GroupingState, type ExpandedState, type RowSelectionState,
} from "@tanstack/react-table";

export interface Row {
  name: string; email: string; project: string; role: string;
  access: string; type: string; company: string; status: string; addedOn: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "project", header: "Project" },
  { accessorKey: "role", header: "Role" },
  { accessorKey: "access", header: "Access" },
  { accessorKey: "type", header: "Type" },
  { accessorKey: "company", header: "Company" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "addedOn", header: "Added" },
];

export function DetailTable({
  rows, total, page, size, onPage, exportHref, loading,
}: {
  rows: Row[]; total: number; page: number; size: number;
  onPage: (page: number) => void; exportHref: string; loading: boolean;
}) {
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const table = useReactTable({
    data: rows, columns, state: { grouping, expanded, rowSelection },
    onGroupingChange: setGrouping, onExpandedChange: setExpanded, onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(), getGroupedRowModel: getGroupedRowModel(), getExpandedRowModel: getExpandedRowModel(),
  });
  const pages = Math.max(1, Math.ceil(total / size));
  const groupBy = (col: string) => setGrouping(grouping[0] === col ? [] : [col]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Members ({total.toLocaleString("en-US")})</span>
        <span className="text-xs text-zinc-500">Group by:</span>
        {["project", "company", "role"].map((c) => (
          <button key={c} onClick={() => groupBy(c)}
            className={`rounded border px-2 py-0.5 text-xs ${grouping[0] === c ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>{c}</button>
        ))}
        <a href={exportHref} className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:border-zinc-500">Export CSV</a>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-950 text-left text-xs text-zinc-400">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 font-medium">{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-900 text-zinc-200">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-3 py-1.5">
                    {c.getIsGrouped() ? (
                      <button onClick={r.getToggleExpandedHandler()} className="font-medium text-zinc-100">
                        {r.getIsExpanded() ? "▾" : "▸"} {String(c.getValue() ?? "")} ({r.subRows.length})
                      </button>
                    ) : c.getIsAggregated() ? null : c.getIsPlaceholder() ? null : String(c.getValue() ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <div className="px-3 py-6 text-center text-sm text-zinc-500">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="px-3 py-6 text-center text-sm text-zinc-500">No members match these filters.</div> : null}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span>Page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded border border-zinc-800 px-2 py-0.5 disabled:opacity-40">Prev</button>
          <button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} className="rounded border border-zinc-800 px-2 py-0.5 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
