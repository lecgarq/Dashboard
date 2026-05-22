"use client";

import { Activity, FolderKey, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { KpiSummary } from "@/lib/acc/accessAnalysisTypes";
import { chartColor } from "./chartColors";

interface KpiCardProps {
  label: string;
  value: string;
  detail: string;
  accent: string;
  icon: typeof Users;
  sparklineValues?: number[];
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");
  const area = `0,${h} ${points} ${(values.length - 1) * step},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polygon points={area} fill={color} fillOpacity={0.18} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function KpiCard({ label, value, detail, accent, icon: Icon, sparklineValues }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-3xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
          aria-hidden
        >
          <Icon size={18} />
        </div>
      </div>
      {sparklineValues && sparklineValues.length > 1 ? (
        <div className="mt-3">
          <MiniSparkline values={sparklineValues} color={accent} />
        </div>
      ) : null}
    </div>
  );
}

interface KpiHeroStripProps {
  users: BulkAccUser[];
  folderGrantCount?: number;
  summary?: KpiSummary;
}

export function KpiHeroStrip({ users, folderGrantCount = 0, summary }: KpiHeroStripProps) {
  const totalMembers = users.length;
  const synced = users.filter((u) => u.found).length;

  const now = Date.now();
  const activeUsers = users.filter((u) => {
    if (!u.lastSignIn) return false;
    const t = Date.parse(u.lastSignIn);
    if (!Number.isFinite(t)) return false;
    return (now - t) / 86_400_000 <= 30;
  }).length;
  const activePct = totalMembers ? Math.round((activeUsers / totalMembers) * 100) : 0;

  const accountAdmins = users.filter((u) => u.isAccountAdmin).length;
  const anyAdmin = users.filter((u) => u.isAccountAdmin || u.adminCount > 0).length;
  const activeAdmins = summary?.activeAdmins.value ?? anyAdmin;
  const staleMembers =
    summary?.staleMembers.value ??
    users.filter((u) => {
      if (!u.lastSignIn) return true;
      const t = Date.parse(u.lastSignIn);
      if (!Number.isFinite(t)) return true;
      return (now - t) / 86_400_000 > 90;
    }).length;
  const accessChanges = summary?.accessChanges.value ?? 0;

  const projectCounts = users.map((u) => u.projectCount);
  const avgProjects = totalMembers
    ? projectCounts.reduce((s, n) => s + n, 0) / totalMembers
    : 0;
  const maxProjects = projectCounts.length ? Math.max(...projectCounts) : 0;
  const maxUser = projectCounts.length
    ? users[projectCounts.indexOf(maxProjects)]?.name ?? users[projectCounts.indexOf(maxProjects)]?.email ?? ""
    : "";

  const buckets = new Array(12).fill(0) as number[];
  for (const u of users) {
    const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
    if (!Number.isFinite(t)) continue;
    const daysAgo = (now - t) / 86_400_000;
    const idx = Math.min(11, Math.max(0, 11 - Math.floor(daysAgo / 30)));
    buckets[idx]++;
  }

  const projectSpark = [...projectCounts].sort((a, b) => b - a).slice(0, 24);
  const adminSpark = users
    .map((u) => u.adminCount)
    .filter((n) => n > 0)
    .sort((a, b) => b - a)
    .slice(0, 24);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Total members"
        value={totalMembers.toLocaleString()}
        detail={`${synced.toLocaleString()} synced from ACC; ${(totalMembers - synced).toLocaleString()} from directory`}
        accent={chartColor("info")}
        icon={Users}
      />
      <KpiCard
        label="Active (30d)"
        value={`${activePct}%`}
        detail={`${activeUsers.toLocaleString()} of ${totalMembers.toLocaleString()} signed in within 30 days`}
        accent={chartColor("good")}
        icon={Activity}
        sparklineValues={buckets}
      />
      <KpiCard
        label="Active admins"
        value={activeAdmins.toLocaleString()}
        detail={`${accountAdmins.toLocaleString()} account admin; ${Math.max(0, anyAdmin - accountAdmins).toLocaleString()} project-only`}
        accent={chartColor("watch")}
        icon={ShieldCheck}
        sparklineValues={adminSpark}
      />
      <KpiCard
        label="Stale members"
        value={staleMembers.toLocaleString()}
        detail="No sign-in or outside the 90 day review window"
        accent={chartColor("risk")}
        icon={UserX}
      />
      <KpiCard
        label="Access changes"
        value={accessChanges.toLocaleString()}
        detail={summary ? "Current review window" : "Waiting for activity summary"}
        accent={chartColor("neutral")}
        icon={UserCheck}
      />
      <KpiCard
        label="Folder grants"
        value={folderGrantCount.toLocaleString()}
        detail={maxUser ? `Avg ${avgProjects.toFixed(1)} projects/user; max ${maxProjects} (${maxUser})` : "Folder permission matrix rows"}
        accent={chartColor("info")}
        icon={FolderKey}
        sparklineValues={projectSpark}
      />
    </div>
  );
}
