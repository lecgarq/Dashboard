"use client";

/**
 * Phase 4 Plan 6 — FolderPermissionsWidget (10th dashboard widget).
 *
 * Hub-wide folder × project-role permission matrix:
 *  - Columns are role-per-project pairs grouped under sticky project headers
 *    (NOT deduped across projects — same role under two projects = two columns)
 *  - Rows are folder paths, collapsed by default to top-level (parentId === null),
 *    expandable on click
 *  - Virtualized via @tanstack/react-virtual (DOM cells; canvas reserved for Plan 07)
 *  - Four filters + unified search (path AND role name)
 *  - Orphan cells: desaturated background + AlertTriangle glyph; click → side panel
 *  - Project-crawl-status !== 'ok': striped overlay + tooltip
 *  - Cross-widget interactivity: role/project inbound; cell/header outbound
 */

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/core/trpc";
import { mapActions, TIER_DEFINITIONS, type PermTier } from "@/lib/acc/permissionMapping";
import { useSelection } from "../selectionContext";
import type { WidgetCommonProps } from "../widgetRegistry";

// Highest → lowest tier order (mirrors TIER_DEFINITIONS order)
const TIER_ORDER: PermTier[] = TIER_DEFINITIONS.map((d) => d.tier);

// Tier color palette (darker = more permissive). Aligned with dashboard surfaces.
const TIER_COLOR: Record<PermTier, string> = {
  "Full Controller": "#7c3aed",          // violet-600
  "View+Download+Upload+Edit": "#a855f7", // purple-500
  "View+Download+Upload": "#3b82f6",      // blue-500
  "Upload Only": "#0ea5e9",               // sky-500
  "View+Download": "#10b981",             // emerald-500
  "View Only": "#94a3b8",                 // slate-400
};

interface FolderRow {
  id: string;
  projectId: string;
  parentId: string | null;
  fullPath: string;
  name: string;
}

interface MatrixRow {
  folderId: string;
  folderPath: string;
  projectId: string;
  projectName: string;
  projectCrawlStatus: string;
  roleId: string;
  roleName: string;
  permType: string;
  actions: string[];
  orphanReasons: string[];
}

interface ColumnSpec {
  projectId: string;
  projectName: string;
  roleId: string;
  roleName: string;
  crawlStatus: string;
}

interface VisibleRow {
  folder: FolderRow;
  depth: number;
}

export function FolderPermissionsWidget(_props: WidgetCommonProps) {
  const { selected, setSelected } = useSelection();

  // ─── Inbound scoping ──────────────────────────────────────────────────────
  // 'role' selection → scope columns to that role.
  // 'folderPermission' selection (project from prior click) → scope to that project.
  // No 'project' kind in current union — projectId scoping happens via projectFilter UI.
  const inboundRoleName =
    selected?.kind === "role" ? selected.role : null;
  const inboundProjectId =
    selected?.kind === "folderPermission" ? selected.projectId : null;

  // ─── Data fetch ───────────────────────────────────────────────────────────
  const matrixQuery = trpc.accFolders.getMatrix.useQuery(
    { projectIds: inboundProjectId ? [inboundProjectId] : undefined },
    { staleTime: 5 * 60_000, enabled: false },
  );

  // ─── Filter state ─────────────────────────────────────────────────────────
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [tierThreshold, setTierThreshold] = useState<PermTier | "none">("none");
  const [tierMode, setTierMode] = useState<"gte" | "eq">("gte");
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const [unifiedSearch, setUnifiedSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // ─── Build derived structures ─────────────────────────────────────────────
  const rows: MatrixRow[] = useMemo(
    () => (matrixQuery.data?.rows ?? []) as MatrixRow[],
    [matrixQuery.data],
  );

  // All distinct folders (rebuild structure: row-rows include only folders that
  // appear in the matrix; for expansion we need parent/child too)
  const allFolders: Map<string, FolderRow> = useMemo(() => {
    const m = new Map<string, FolderRow>();
    for (const r of rows) {
      if (!m.has(r.folderId)) {
        // Infer parent from folderPath splitting — APS fullPath uses '/'.
        // Without explicit parentId on the row, we approximate: parent = same project,
        // path = dirname(fullPath). For collapsed top-level: rows where path has no '/'
        // or exactly one segment are treated as roots.
        const segs = r.folderPath.split("/").filter(Boolean);
        const isRoot = segs.length <= 1;
        m.set(r.folderId, {
          id: r.folderId,
          projectId: r.projectId,
          parentId: isRoot ? null : "__derived__",
          fullPath: r.folderPath,
          name: segs[segs.length - 1] ?? r.folderPath,
        });
      }
    }
    return m;
  }, [rows]);

  // ─── Columns: distinct (projectId, roleId) pairs, grouped ─────────────────
  const allColumns: ColumnSpec[] = useMemo(() => {
    const seen = new Map<string, ColumnSpec>();
    for (const r of rows) {
      const k = `${r.projectId}::${r.roleId}`;
      if (!seen.has(k)) {
        seen.set(k, {
          projectId: r.projectId,
          projectName: r.projectName,
          roleId: r.roleId,
          roleName: r.roleName,
          crawlStatus: r.projectCrawlStatus,
        });
      }
    }
    // Sort: project name, then role name
    return Array.from(seen.values()).sort((a, b) => {
      if (a.projectName !== b.projectName) {
        return a.projectName.localeCompare(b.projectName);
      }
      return a.roleName.localeCompare(b.roleName);
    });
  }, [rows]);

  // All project IDs (for the project multi-select)
  const allProjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allColumns) m.set(c.projectId, c.projectName);
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allColumns]);

  // Cell lookup: ${folderId}::${roleId} → MatrixRow
  const cellLookup = useMemo(() => {
    const m = new Map<string, MatrixRow>();
    for (const r of rows) m.set(`${r.folderId}::${r.roleId}`, r);
    return m;
  }, [rows]);

  // Tier rank helper
  const tierRank = (t: string): number => {
    const idx = TIER_ORDER.indexOf(t as PermTier);
    return idx === -1 ? TIER_ORDER.length : idx; // unknown → least permissive
  };

  // ─── visibleColumns: apply filters ────────────────────────────────────────
  const visibleColumns = useMemo(() => {
    const search = unifiedSearch.trim().toLowerCase();
    return allColumns.filter((c) => {
      if (projectFilter.size > 0 && !projectFilter.has(c.projectId)) return false;
      if (inboundRoleName && c.roleName !== inboundRoleName) return false;
      if (search && !c.roleName.toLowerCase().includes(search)) {
        // Allow column through if search ALSO matches at least one row's folder path
        // (search is unified — but a column with NO matching rows in search is hidden
        // only if its role name doesn't match either). To keep it simple: hide if
        // role name doesn't match. Path-only matches still display the visible columns.
        // CONTEXT: "single search box filters BOTH rows by folder path AND columns
        // by role name simultaneously" — so role-name match is independent.
        return false;
      }
      return true;
    });
  }, [allColumns, projectFilter, inboundRoleName, unifiedSearch]);

  // ─── visibleRows: collapsed + search ──────────────────────────────────────
  const visibleRows: VisibleRow[] = useMemo(() => {
    const search = unifiedSearch.trim().toLowerCase();
    const allFolderArr = Array.from(allFolders.values());

    // Apply search filter to all folders
    const matched = search
      ? allFolderArr.filter((f) => f.fullPath.toLowerCase().includes(search))
      : allFolderArr;

    // Roots: parentId === null (i.e. top-level fullPath)
    const roots = matched
      .filter((f) => f.parentId === null)
      .sort((a, b) => {
        if (a.projectId !== b.projectId) return a.projectId.localeCompare(b.projectId);
        return a.fullPath.localeCompare(b.fullPath);
      });

    // Build expanded flat list. For each root, if expanded, append all matched
    // descendants (under the same project whose path starts with root path).
    const out: VisibleRow[] = [];
    for (const root of roots) {
      out.push({ folder: root, depth: 0 });
      if (expandedFolders.has(root.id)) {
        const prefix = root.fullPath.endsWith("/")
          ? root.fullPath
          : root.fullPath + "/";
        const children = matched
          .filter(
            (f) =>
              f.id !== root.id &&
              f.projectId === root.projectId &&
              f.fullPath.startsWith(prefix),
          )
          .sort((a, b) => a.fullPath.localeCompare(b.fullPath));
        for (const child of children) {
          out.push({ folder: child, depth: 1 });
        }
      }
    }

    // anomaliesOnly: keep only rows that have ≥1 cell with orphanReasons across
    // the visibleColumns.
    if (anomaliesOnly) {
      return out.filter((row) =>
        visibleColumns.some((col) => {
          const cell = cellLookup.get(`${row.folder.id}::${col.roleId}`);
          return cell && cell.orphanReasons.length > 0;
        }),
      );
    }
    return out;
  }, [allFolders, unifiedSearch, expandedFolders, anomaliesOnly, visibleColumns, cellLookup]);

  // ─── Virtualization ───────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement | null>(null);
  const ROW_PX = 32;
  const COL_PX = 120;
  const LABEL_W = 280;

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_PX,
    overscan: 10,
  });

  const colVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    horizontal: true,
    getScrollElement: () => parentRef.current,
    estimateSize: () => COL_PX,
    overscan: 5,
  });

  // ─── Project group header runs ────────────────────────────────────────────
  // Build contiguous spans of same-project columns from visibleColumns
  const projectGroups = useMemo(() => {
    const groups: Array<{ projectId: string; projectName: string; start: number; end: number; crawlStatus: string }> = [];
    for (let i = 0; i < visibleColumns.length; i++) {
      const col = visibleColumns[i];
      if (!col) continue;
      const last = groups[groups.length - 1];
      if (last && last.projectId === col.projectId) {
        last.end = i;
      } else {
        groups.push({
          projectId: col.projectId,
          projectName: col.projectName,
          start: i,
          end: i,
          crawlStatus: col.crawlStatus,
        });
      }
    }
    return groups;
  }, [visibleColumns]);

  // ─── Cell renderer helpers ────────────────────────────────────────────────
  function cellFor(folderId: string, roleId: string): MatrixRow | null {
    return cellLookup.get(`${folderId}::${roleId}`) ?? null;
  }

  function passesTier(cell: MatrixRow): boolean {
    if (tierThreshold === "none") return true;
    const thresholdRank = TIER_ORDER.indexOf(tierThreshold as PermTier);
    const cellRank = tierRank(cell.permType);
    if (tierMode === "eq") return cellRank === thresholdRank;
    // gte = "at least as permissive as threshold" = lower or equal rank index
    return cellRank <= thresholdRank;
  }

  function tierColor(permType: string): string {
    const t = TIER_ORDER.find((x) => x === permType);
    return t ? TIER_COLOR[t] : "transparent";
  }

  function onCellClick(cell: MatrixRow) {
    setSelected({
      kind: "folderPermission",
      folderId: cell.folderId,
      folderPath: cell.folderPath,
      roleId: cell.roleId,
      roleName: cell.roleName,
      projectId: cell.projectId,
      projectName: cell.projectName,
      permType: cell.permType,
      actions: cell.actions,
      orphanReasons: cell.orphanReasons,
    });
  }

  function onRoleHeaderClick(col: ColumnSpec) {
    setSelected({ kind: "role", role: col.roleName, severity: undefined });
  }

  function toggleExpand(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function toggleProjectFilter(projectId: string) {
    setProjectFilter((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (matrixQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading folder permissions…
      </div>
    );
  }
  if (matrixQuery.error) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-destructive">
        Failed to load: {matrixQuery.error.message}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No folder permissions yet — run the folder-crawl cron to populate.
      </div>
    );
  }

  const totalWidth = LABEL_W + colVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        {/* Unified search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={unifiedSearch}
            onChange={(e) => setUnifiedSearch(e.target.value)}
            placeholder="Search folder paths and roles…"
            className="h-7 w-[260px] pl-7 text-[11px]"
          />
        </div>

        {/* Project multi-select (compact: popover-like dropdown via Select with custom render) */}
        <Select
          value="__placeholder__"
          onValueChange={(v) => {
            if (v === "__clear__") setProjectFilter(new Set());
            else toggleProjectFilter(v);
          }}
        >
          <SelectTrigger className="h-7 w-auto min-w-[140px] text-[11px]">
            <SelectValue placeholder={projectFilter.size === 0 ? "All projects" : `${projectFilter.size} project${projectFilter.size === 1 ? "" : "s"}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__">Clear (all projects)</SelectItem>
            {allProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {projectFilter.has(p.id) ? "✓ " : "  "}
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tier threshold + mode */}
        <Select value={tierThreshold} onValueChange={(v) => setTierThreshold(v as PermTier | "none")}>
          <SelectTrigger className="h-7 w-auto min-w-[140px] text-[11px]">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">All tiers</SelectItem>
            {TIER_ORDER.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tierThreshold !== "none" && (
          <Select value={tierMode} onValueChange={(v) => setTierMode(v as "gte" | "eq")}>
            <SelectTrigger className="h-7 w-auto min-w-[80px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gte">≥</SelectItem>
              <SelectItem value="eq">=</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Anomalies only */}
        <label className="flex items-center gap-1.5 text-[11px]">
          <Checkbox
            checked={anomaliesOnly}
            onCheckedChange={(v) => setAnomaliesOnly(v === true)}
          />
          <span>Anomalies only</span>
        </label>

        {/* Stats */}
        <div className="ml-auto text-[11px] text-muted-foreground">
          {visibleRows.length} folders × {visibleColumns.length} role columns
        </div>
      </div>

      {/* Active filter chips */}
      {(projectFilter.size > 0 || tierThreshold !== "none" || anomaliesOnly || unifiedSearch) && (
        <div className="flex flex-wrap items-center gap-1">
          {Array.from(projectFilter).map((pid) => {
            const p = allProjects.find((x) => x.id === pid);
            return (
              <Badge key={pid} variant="secondary" className="text-[10px]">
                {p?.name ?? pid}
                <button
                  className="ml-1 hover:text-foreground"
                  onClick={() => toggleProjectFilter(pid)}
                >
                  ×
                </button>
              </Badge>
            );
          })}
          {tierThreshold !== "none" && (
            <Badge variant="secondary" className="text-[10px]">
              tier {tierMode === "gte" ? "≥" : "="} {tierThreshold}
            </Badge>
          )}
          {anomaliesOnly && (
            <Badge variant="secondary" className="text-[10px]">
              anomalies
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => {
              setProjectFilter(new Set());
              setTierThreshold("none");
              setAnomaliesOnly(false);
              setUnifiedSearch("");
            }}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Matrix viewport */}
      <div
        ref={parentRef}
        className="relative max-h-[560px] overflow-auto rounded-md border bg-card"
        style={{ height: 560 }}
      >
        <div
          style={{
            width: totalWidth,
            height: totalHeight + 56, // +headers
            position: "relative",
          }}
        >
          {/* Sticky project group header (top row) */}
          <div
            className="sticky top-0 z-20 flex border-b bg-card"
            style={{ height: 24, width: totalWidth }}
          >
            <div
              className="sticky left-0 z-30 border-r bg-card text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: LABEL_W, lineHeight: "24px", paddingLeft: 8 }}
            >
              Folder
            </div>
            <div className="relative" style={{ width: colVirtualizer.getTotalSize(), height: 24 }}>
              {projectGroups.map((g) => {
                const left = g.start * COL_PX;
                const width = (g.end - g.start + 1) * COL_PX;
                const incomplete = g.crawlStatus !== "ok";
                return (
                  <div
                    key={`${g.projectId}-${g.start}`}
                    className="absolute flex items-center gap-1 truncate border-r px-2 text-[10px] font-semibold"
                    style={{
                      left,
                      width,
                      height: 24,
                      background: incomplete
                        ? "repeating-linear-gradient(45deg, rgba(245,158,11,0.05) 0 4px, transparent 4px 8px)"
                        : "transparent",
                    }}
                    title={incomplete ? `${g.projectName} — crawl ${g.crawlStatus} (data may be missing)` : g.projectName}
                  >
                    <span className="truncate">{g.projectName}</span>
                    {incomplete && (
                      <span className="text-amber-500" aria-label="crawl incomplete">⚠</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sticky role header (row 2) */}
          <div
            className="sticky z-10 flex border-b bg-card"
            style={{ top: 24, height: 32, width: totalWidth }}
          >
            <div
              className="sticky left-0 z-20 border-r bg-card text-[11px] text-muted-foreground"
              style={{ width: LABEL_W, lineHeight: "32px", paddingLeft: 8 }}
            >
              path ↓ / role →
            </div>
            <div className="relative" style={{ width: colVirtualizer.getTotalSize(), height: 32 }}>
              {colVirtualizer.getVirtualItems().map((vc) => {
                const col = visibleColumns[vc.index];
                if (!col) return null;
                return (
                  <button
                    key={`${col.projectId}-${col.roleId}`}
                    className="absolute truncate border-r px-1.5 text-left text-[11px] hover:bg-muted/50"
                    style={{
                      left: vc.start,
                      width: vc.size,
                      height: 32,
                      lineHeight: "32px",
                    }}
                    title={`${col.projectName} — ${col.roleName}`}
                    onClick={() => onRoleHeaderClick(col)}
                  >
                    {col.roleName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div style={{ position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const row = visibleRows[vr.index];
              if (!row) return null;
              const expanded = expandedFolders.has(row.folder.id);
              return (
                <div
                  key={row.folder.id}
                  className="absolute flex border-b"
                  style={{
                    top: vr.start + 56, // headers
                    height: vr.size,
                    width: totalWidth,
                  }}
                >
                  {/* Row label (sticky-left) */}
                  <button
                    className="sticky left-0 z-[5] flex items-center gap-1 truncate border-r bg-card px-2 text-left text-[11px] hover:bg-muted/40"
                    style={{ width: LABEL_W, height: vr.size, paddingLeft: 8 + row.depth * 14 }}
                    title={row.folder.fullPath}
                    onClick={() => toggleExpand(row.folder.id)}
                  >
                    {row.folder.parentId === null ? (
                      expanded ? (
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                      )
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <span className="truncate">{row.folder.name}</span>
                  </button>

                  {/* Virtualized columns within row */}
                  <div className="relative" style={{ width: colVirtualizer.getTotalSize(), height: vr.size }}>
                    {colVirtualizer.getVirtualItems().map((vc) => {
                      const col = visibleColumns[vc.index];
                      if (!col) return null;
                      const cell = cellFor(row.folder.id, col.roleId);
                      if (!cell) {
                        return (
                          <div
                            key={`${col.projectId}-${col.roleId}-empty`}
                            className="absolute border-r"
                            style={{ left: vc.start, width: vc.size, height: vr.size }}
                          />
                        );
                      }
                      if (!passesTier(cell)) {
                        return (
                          <div
                            key={`${col.projectId}-${col.roleId}-below`}
                            className="absolute border-r"
                            style={{ left: vc.start, width: vc.size, height: vr.size }}
                          />
                        );
                      }
                      const baseColor = tierColor(cell.permType);
                      const orphaned = cell.orphanReasons.length > 0;
                      const mapped = mapActions(cell.actions);
                      const incomplete = cell.projectCrawlStatus !== "ok";
                      const bgStyle: React.CSSProperties = {
                        left: vc.start,
                        width: vc.size,
                        height: vr.size,
                        backgroundColor: baseColor,
                        opacity: orphaned ? 0.35 : 0.85,
                      };
                      const tooltipBits = [
                        cell.permType,
                        `Actions: ${cell.actions.join(", ") || "(none)"}`,
                      ];
                      if (orphaned) tooltipBits.push(`⚠ ${cell.orphanReasons.join(", ")}`);
                      if (mapped.extended) tooltipBits.push("+ extended actions");
                      if (incomplete) tooltipBits.push("Crawl incomplete — data may be missing");

                      return (
                        <button
                          key={`${col.projectId}-${col.roleId}-cell`}
                          className="absolute border-r text-left transition-opacity hover:opacity-100"
                          style={bgStyle}
                          title={tooltipBits.join("\n")}
                          onClick={() => onCellClick(cell)}
                        >
                          {orphaned && (
                            <AlertTriangle
                              className="absolute left-0.5 top-0.5 size-3 text-amber-50"
                              aria-hidden
                            />
                          )}
                          {mapped.extended && (
                            <span
                              className="absolute right-0.5 top-0.5 rounded-sm bg-black/30 px-1 text-[8px] font-bold text-white"
                              aria-label="extended actions"
                            >
                              +
                            </span>
                          )}
                          {incomplete && (
                            <div
                              className="pointer-events-none absolute inset-0"
                              style={{
                                background:
                                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.0) 0 3px, rgba(0,0,0,0.18) 3px 6px)",
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>Tier:</span>
        {TIER_ORDER.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: TIER_COLOR[t] }} />
            {t}
          </span>
        ))}
        <span className="ml-2">⚠ orphan · + extended · stripes = crawl incomplete</span>
      </div>
    </div>
  );
}
