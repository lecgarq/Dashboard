"use client";
import type { SummaryDTO } from "../types";

const nf = (n: number) => n.toLocaleString("en-US");

function Card({ label, value, accent, onClick }: { label: string; value: number; accent: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-start rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left transition hover:border-zinc-600">
      <span className={`text-2xl font-semibold tabular-nums ${accent}`}>{nf(value)}</span>
      <span className="mt-0.5 text-xs font-medium text-zinc-400">{label}</span>
    </button>
  );
}

export function RiskCards({
  risk, onExternal, onExternalAdmins, onAdmins, onPending,
}: {
  risk: SummaryDTO["risk"];
  onExternal: () => void; onExternalAdmins: () => void; onAdmins: () => void; onPending: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="External members" value={risk.externalMembers} accent="text-amber-400" onClick={onExternal} />
      <Card label="External project admins" value={risk.externalAdmins} accent="text-red-400" onClick={onExternalAdmins} />
      <Card label="Project admins" value={risk.projectAdmins} accent="text-zinc-100" onClick={onAdmins} />
      <Card label="Pending memberships" value={risk.pending} accent="text-zinc-100" onClick={onPending} />
    </div>
  );
}
