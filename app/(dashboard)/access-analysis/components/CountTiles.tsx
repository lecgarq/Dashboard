"use client";
import type { SummaryDTO } from "../types";

const nf = (n: number) => n.toLocaleString("en-US");

function Tile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-zinc-100">{nf(value)}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      {sub ? <div className="text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function CountTiles({ counts, projectTotal }: { counts: SummaryDTO["counts"]; projectTotal: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Tile label="Users" value={counts.users} />
      <Tile label="Projects" value={counts.projects} sub={`of ${nf(projectTotal)} total`} />
      <Tile label="Access" value={counts.access} />
      <Tile label="Roles" value={counts.roles} />
      <Tile label="Companies" value={counts.companies} />
    </div>
  );
}
