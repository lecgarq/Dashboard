"use client";
import { useState } from "react";
import { moduleLabelById } from "../modules";
import type { UserRow, UserProjectRow } from "../userRows";
import type { ModuleId } from "../types";

function Chips({ items, max = 4, title }: { items: string[]; max?: number; title?: string }) {
  if (items.length === 0) return <span className="text-zinc-600">—</span>;
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1" title={title ?? items.join(", ")}>
      {shown.map((c) => (
        <span key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">{c}</span>
      ))}
      {extra > 0 ? <span className="px-1 py-0.5 text-xs text-zinc-400">+{extra}</span> : null}
    </span>
  );
}

function moduleLabels(ids: ModuleId[]): string[] {
  return ids.map(moduleLabelById);
}

function ProjectDetail({ projects }: { projects: UserProjectRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-zinc-500">
        <tr>
          <th className="px-3 py-1 font-medium">Project</th>
          <th className="px-3 py-1 font-medium">Modules</th>
          <th className="px-3 py-1 font-medium">Role</th>
          <th className="px-3 py-1 font-medium">Company</th>
          <th className="px-3 py-1 font-medium">Access</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => (
          <tr key={p.projectId} className="border-t border-zinc-900 text-zinc-300">
            <td className="px-3 py-1">{p.project}</td>
            <td className="px-3 py-1">
              {p.modules.length === 0 ? <span className="text-zinc-600">—</span> : (
                <span className="flex flex-wrap gap-1">
                  {p.modules.map((m) => {
                    const isAdmin = p.adminModules.includes(m);
                    return (
                      <span key={m}
                        className={`rounded px-1.5 py-0.5 ${isAdmin ? "bg-amber-900/50 text-amber-200" : "bg-zinc-800 text-zinc-200"}`}
                        title={isAdmin ? `${moduleLabelById(m)} (admin)` : moduleLabelById(m)}>
                        {moduleLabelById(m)}{isAdmin ? " ★" : ""}
                      </span>
                    );
                  })}
                </span>
              )}
            </td>
            <td className="px-3 py-1">{p.role || <span className="text-zinc-600">—</span>}</td>
            <td className="px-3 py-1">{p.company || <span className="text-zinc-600">—</span>}</td>
            <td className="px-3 py-1">
              <span className={p.access === "Admin" ? "text-amber-300" : "text-zinc-400"}>{p.access}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UserTable({
  rows, total, page, size, onPage, exportHref, loading,
}: {
  rows: UserRow[]; total: number; page: number; size: number;
  onPage: (page: number) => void; exportHref: string; loading: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pages = Math.max(1, Math.ceil(total / size));
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Users ({total.toLocaleString("en-US")})
        </span>
        <span className="text-xs text-zinc-500">Click a row to see per-project access</span>
        <a href={exportHref} className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:border-zinc-500">
          Export CSV
        </a>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-950 text-left text-xs text-zinc-400">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Projects</th>
              <th className="px-3 py-2 font-medium">Modules</th>
              <th className="px-3 py-2 font-medium">Roles</th>
              <th className="px-3 py-2 font-medium">Companies</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const open = !!expanded[u.userId];
              return (
                <FragmentRow key={u.userId} u={u} open={open} onToggle={() => toggle(u.userId)} />
              );
            })}
          </tbody>
        </table>
        {loading ? <div className="px-3 py-6 text-center text-sm text-zinc-500">Loading…</div> : null}
        {!loading && rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-zinc-500">No users match these filters.</div>
        ) : null}
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

function FragmentRow({ u, open, onToggle }: { u: UserRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-zinc-900 text-zinc-200 hover:bg-zinc-900/50" onClick={onToggle}>
        <td className="px-2 py-1.5 text-zinc-400">{open ? "▾" : "▸"}</td>
        <td className="px-3 py-1.5">
          <div className="font-medium text-zinc-100">{u.name}</div>
          <div className="text-xs text-zinc-500">{u.email}</div>
        </td>
        <td className="px-3 py-1.5">
          <span className={u.type === "Internal" ? "text-emerald-300" : "text-sky-300"}>{u.type}</span>
          {u.isAdminAnywhere ? <span className="ml-1 text-xs text-amber-300">· admin</span> : null}
        </td>
        <td className="px-3 py-1.5 tabular-nums">{u.projectCount}</td>
        <td className="px-3 py-1.5"><Chips items={moduleLabels(u.modules)} /></td>
        <td className="px-3 py-1.5"><Chips items={u.roles} /></td>
        <td className="px-3 py-1.5"><Chips items={u.companies} /></td>
      </tr>
      {open ? (
        <tr className="bg-zinc-900/30">
          <td />
          <td colSpan={6} className="px-3 py-2">
            <ProjectDetail projects={u.projects} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
