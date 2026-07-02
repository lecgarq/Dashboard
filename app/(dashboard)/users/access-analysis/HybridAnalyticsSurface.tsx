// REF-01 split complete (SPLIT-03/SPLIT-04): DuckDB-Wasm query wiring lives in useHybridAnalytics.ts,
// pure aggregations live in hybridAnalyticsTransforms.ts, and the presentational body lives in
// HybridAnalyticsView.tsx (+ HybridAnalyticsPostureSection / HybridAnalyticsRankingsSection) plus
// HybridAnalyticsDrilldown.tsx. This shell owns only the drill-down interaction state and composition.
"use client";

import { useEffect, useMemo, useState } from "react";
import { isAdmin } from "./analyticsFindings";
import { useHybridAnalytics } from "./useHybridAnalytics";
import { HybridAnalyticsView, type DetailFilter, type VgPlotColumnType } from "./HybridAnalyticsView";
import { HybridAnalyticsDrilldown } from "./HybridAnalyticsDrilldown";

export function HybridAnalyticsSurface() {
  const viewModel = useHybridAnalytics();
  const { users } = viewModel;

  const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    setVisibleCount(50);
  }, [detailFilter]);

  const filteredDetailUsers = useMemo(() => {
    if (!detailFilter) return [];
    const matched = users.filter(detailFilter.filterFn);
    if (!searchTerm.trim()) return matched;
    const query = searchTerm.toLowerCase();
    return matched.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(query) ||
        (u.email ?? "").toLowerCase().includes(query) ||
        (u.companyName ?? "").toLowerCase().includes(query)
    );
  }, [users, detailFilter, searchTerm]);

  const handleVgPlotClick = (
    e: React.MouseEvent<HTMLDivElement>,
    columnType: VgPlotColumnType
  ) => {
    const target = e.target as SVGElement;
    const rectOrPath = target.closest("rect, path, g");
    if (!rectOrPath) return;

    const titleEl = rectOrPath.querySelector("title");
    if (!titleEl) return;

    const text = titleEl.textContent || "";
    const lines = text.split("\n");
    const parsedData: Record<string, string> = {};
    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(":").trim();
        parsedData[key] = val;
      }
    }

    const findValueByKeyContains = (search: string) => {
      for (const [k, v] of Object.entries(parsedData)) {
        if (k.toLowerCase().includes(search.toLowerCase())) return v;
      }
      return parsedData.value || parsedData.count || "";
    };

    if (columnType === "projects") {
      const countVal = findValueByKeyContains("project_count");
      if (countVal) {
        setDetailFilter({
          title: `Users with ${countVal} Projects`,
          subtitle: `Detailed view of users who belong to exactly ${countVal} projects.`,
          filterFn: (u) => {
            if (countVal === "10+") return u.projectCount >= 10;
            const num = parseInt(countVal);
            if (isNaN(num)) return false;
            return u.projectCount === num;
          },
        });
      }
    } else if (columnType === "admin") {
      const countVal = findValueByKeyContains("admin_count");
      if (countVal) {
        setDetailFilter({
          title: `Users with ${countVal} Admin Grants`,
          subtitle: `Detailed view of users administering exactly ${countVal} projects.`,
          filterFn: (u) => {
            if (countVal === "10+") return u.adminCount >= 10;
            const num = parseInt(countVal);
            if (isNaN(num)) return false;
            return u.adminCount === num;
          },
        });
      }
    } else if (columnType === "topProjects" && (parsedData.project_name !== undefined || parsedData.project_id !== undefined)) {
      const projectName = parsedData.project_name ?? parsedData.project_id;
      setDetailFilter({
        title: `Users in Project: ${projectName}`,
        subtitle: `Detailed view of members assigned to the "${projectName}" project.`,
        filterFn: (u) => u.projects.some((p) => p.name === projectName || p.id === projectName),
      });
    } else if (columnType === "topRoles" && parsedData.role_id !== undefined) {
      const roleId = parsedData.role_id;
      setDetailFilter({
        title: `Users with Role: ${roleId}`,
        subtitle: `Detailed view of users carrying the role "${roleId}".`,
        filterFn: (u) =>
          u.allRoles.includes(roleId) || u.projects.some((p) => p.roles.includes(roleId)),
      });
    } else if (columnType === "topCompanies" && parsedData.company_name !== undefined) {
      const companyName = parsedData.company_name;
      setDetailFilter({
        title: `Users at Company: ${companyName}`,
        subtitle: `Detailed view of users belonging to "${companyName}".`,
        filterFn: (u) =>
          (u.companyName ?? "Unknown").trim() === companyName ||
          (!u.companyName && companyName === "Unknown"),
      });
    } else if (columnType === "rolesProjectStatus" && (parsedData.role_id !== undefined || parsedData.project_status !== undefined)) {
      const roleId = parsedData.role_id;
      const projectStatus = parsedData.project_status;
      setDetailFilter({
        title: `Users with Role ${roleId || "Any"} in ${projectStatus || "Any"} Projects`,
        subtitle: `Detailed view of role-project membership intersections.`,
        filterFn: (u) =>
          u.projects.some(
            (p) =>
              (!projectStatus || p.status === projectStatus) &&
              (!roleId || p.roles.includes(roleId)),
          ),
      });
    }
  };

  const handleHeadlineSelect = (id: string) => {
    const now = Date.now();
    if (id === "stale") {
      setDetailFilter({
        title: "Stale or never signed-in members",
        subtitle: "Members with no sign-in in over 90 days (or never).",
        filterFn: (u) => {
          const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
          if (!Number.isFinite(t)) return true;
          return (now - t) / 86_400_000 > 90;
        },
      });
    } else if (id === "active") {
      setDetailFilter({
        title: "Members active in the last 30 days",
        subtitle: "Members who signed in within the last 30 days.",
        filterFn: (u) => {
          const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
          return Number.isFinite(t) && (now - t) / 86_400_000 <= 30;
        },
      });
    } else if (id === "admins") {
      setDetailFilter({
        title: "Admins",
        subtitle: "Members with account or project admin access.",
        filterFn: (u) => isAdmin(u),
      });
    } else if (id === "breadth") {
      setDetailFilter({
        title: "Members with 10+ projects",
        subtitle: "Broad-access members who belong to ten or more projects.",
        filterFn: (u) => u.projectCount >= 10,
      });
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <HybridAnalyticsView
        viewModel={viewModel}
        setDetailFilter={setDetailFilter}
        handleVgPlotClick={handleVgPlotClick}
        handleHeadlineSelect={handleHeadlineSelect}
      />
      <HybridAnalyticsDrilldown
        detailFilter={detailFilter}
        filteredDetailUsers={filteredDetailUsers}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        onClose={() => {
          setDetailFilter(null);
          setSearchTerm("");
          setVisibleCount(50);
        }}
      />
    </section>
  );
}
