// SPLIT-PENDING: REF-01 — this is the terrain monolith slated to split into data-hook,
// transform, and thin-view modules; its server boundary is characterized by
// lib/server/__tests__/folderPermissionTerrainView.test.ts so the split stays safe.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { officeLabel } from "../projectGroups";
import type { FolderTerrainData, TerrainProjectOption } from "../folderTerrain";
import { useCamera, useGrowth } from "./useFolderPermissionTerrainCamera";
import {
  type Mode,
  type Hover,
  type Picked,
  type Theme,
  type StageView,
  VIEW_H,
  activeDims,
  defaultPivot,
  fitScale,
  buildView,
  crossProjectTiers,
} from "./terrainViewModel";
import { SceneStage } from "./TerrainStage";
import { ModeToggle, ProjectSelect, ProjectMultiSelect, TierLegend, DetailPanel } from "./TerrainControls";

// ---------------------------------------------------------------------------
export function FolderPermissionTerrain({
  projects, initial, loadTerrain, loadOverview, singleProject = false,
}: {
  projects: TerrainProjectOption[];
  initial: FolderTerrainData | null;
  loadTerrain: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
  // When true: lock to single-project mode and hide the mode toggle + project
  // picker (used by the Template MTY tab, which has exactly one "project").
  singleProject?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const theme: Theme = {
    ink: dark ? "#f1f1f4" : "#1f2024",
    sub: dark ? "#a1a1aa" : "#6b7280",
    grid: dark ? "rgba(161,161,170,0.10)" : "rgba(82,82,91,0.09)",
    connector: dark ? "rgba(161,161,170,0.45)" : "rgba(82,82,91,0.4)",
    hot: dark ? "#fafafa" : "#18181b",
    shadow: dark ? "rgba(0,0,0,0.5)" : "rgba(15,12,35,0.22)",
    topEdge: dark ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.62)",
    edge: dark ? "rgba(0,0,0,0.62)" : "rgba(24,27,38,0.42)",
    ground: dark ? "#191c28" : "#e4e8f0",        // opaque floor — nothing shows through
    groundEdge: dark ? "rgba(150,170,210,0.28)" : "rgba(40,55,90,0.24)",
    halo: dark ? "rgba(6,6,9,0.72)" : "rgba(255,255,255,0.78)",
    dark,
  };

  const [mode, setMode] = useState<Mode>("single");
  const [hover, setHover] = useState<Hover>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const clear = () => { setHover(null); setPicked(null); };

  const [cache, setCache] = useState<Record<string, FolderTerrainData | null>>(() => (initial ? { [initial.projectId]: initial } : {}));
  const [singleId, setSingleId] = useState<string>(initial?.projectId ?? projects[0]?.id ?? "");
  const topStaffed = useMemo(() => [...projects].sort((a, b) => b.userRoleCount - a.userRoleCount).map((p) => p.id), [projects]);
  const [selected, setSelected] = useState<string[]>(() => topStaffed.slice(0, 6));
  const [overview, setOverview] = useState<FolderTerrainData | null>(null);
  const [loading, setLoading] = useState(false);

  // Lazy-load terrain for whatever the active mode needs.
  useEffect(() => {
    if (mode === "overview") return;
    const needed = mode === "single" ? [singleId] : selected;
    const missing = [...new Set(needed)].filter((id) => id && !(id in cache));
    if (missing.length === 0) return;
    let alive = true;
    setLoading(true);
    Promise.all(missing.map((id) => loadTerrain(id).then((d) => [id, d] as const)))
      .then((pairs) => { if (alive) setCache((c) => { const n = { ...c }; for (const [id, d] of pairs) n[id] = d; return n; }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, singleId, selected, cache, loadTerrain]);

  useEffect(() => {
    if (mode !== "overview" || overview || !loadOverview) return;
    let alive = true;
    setLoading(true);
    loadOverview().then((d) => { if (alive) setOverview(d); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, overview, loadOverview]);

  const single = cache[singleId] ?? null;
  const compareDatas = useMemo(() => {
    const seen = new Set<string>();
    const out: FolderTerrainData[] = [];
    for (const id of selected) { const d = cache[id]; if (d && !seen.has(d.projectId)) { seen.add(d.projectId); out.push(d); } }
    return out;
  }, [selected, cache]);

  // Measured stage viewport (width tracks the container; height fixed).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 920, h: VIEW_H });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = Math.max(360, el.clientWidth || 920);
      setViewport((v) => (v.w === w ? v : { w, h: VIEW_H }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const camApi = useCamera(viewport);
  const busy = loading;

  // Stable key for the active data set — drives reframe, grow-in, and cross-fade.
  const dataKey = mode === "single" ? (single ? `s:${single.projectId}` : "")
    : mode === "overview" ? (overview ? "o" : "")
    : (compareDatas.length >= 2 ? `c:${compareDatas.map((d) => d.projectId).join(",")}` : "");

  const growth = useGrowth(dataKey);

  const view = useMemo<StageView>(
    () => buildView(mode, single, overview, compareDatas, camApi.cam, viewport, busy, growth),
    [mode, single, overview, compareDatas, camApi.cam, viewport, busy, growth],
  );

  // Reframe the camera when the active data set (not the camera) changes.
  const lastKey = useRef("");
  const { resetTo, framePivot } = camApi;
  useEffect(() => {
    if (!dataKey || dataKey === lastKey.current) return;
    lastKey.current = dataKey;
    const p = defaultPivot(mode, single, overview, compareDatas);
    const { R, Cf } = activeDims(mode, single, overview, compareDatas);
    resetTo(p.col, p.row, fitScale(R, Cf, viewport.w, viewport.h));
  }, [dataKey, mode, single, overview, compareDatas, resetTo, viewport.w, viewport.h]);

  // Re-centre the anchor when the stage is measured / resized (keeps orbit+zoom).
  useEffect(() => { framePivot(); }, [viewport.w, viewport.h, framePivot]);

  return (
    <div className="panel-elevated overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex min-w-0 flex-col gap-2">
          {!singleProject && (
            <ModeToggle mode={mode} hasOverview={!!loadOverview} onChange={(m) => { clear(); setMode(m); }} />
          )}
          {mode === "single" ? (
            <div className="flex flex-col gap-1">
              {!singleProject && (
                <ProjectSelect projects={projects} value={singleId} onChange={(id) => { clear(); setSingleId(id); }} disabled={busy} />
              )}
              {single && (
                <p className="text-xs text-muted-foreground">
                  {officeLabel(single.office)} · {single.folders.length} folders
                  {(() => { const inh = single.folders.filter((f) => f.inherited).length; return inh > 0 ? ` (${single.folders.length - inh} changed · ${inh} inherited)` : ""; })()}
                  {" · "}{single.roles.length} roles
                  {single.maxUserCount > 0 ? " · height = users in role" : " · height = permission level"}
                </p>
              )}
            </div>
          ) : mode === "compare" ? (
            <div className="flex flex-col gap-1.5">
              <ProjectMultiSelect projects={projects} selected={selected} onChange={(ids) => { clear(); setSelected(ids); }} disabled={busy} />
              <p className="text-xs text-muted-foreground">
                {selected.length} projects · each on its own plane, stacked top→bottom — scan a column straight down to compare the same folder × role. Drag to orbit the whole stack; scroll-drag to pan through it.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div className="text-sm font-semibold text-foreground">All projects · account-wide standard</div>
              <p className="text-xs text-muted-foreground">
                {overview ? `${overview.folders.length} folders × ${overview.roles.length} roles · ` : ""}colour = typical permission · height = projects configuring it
              </p>
            </div>
          )}
        </div>
        <TierLegend ink={theme.sub} />
      </div>

      <SceneStage
        wrapRef={wrapRef}
        view={view}
        viewport={viewport}
        theme={theme}
        dark={dark}
        cam={camApi.cam}
        busy={busy}
        hover={hover}
        picked={picked}
        setHover={setHover}
        setPicked={setPicked}
        camApi={camApi}
        dataKey={dataKey}
      />

      {picked && (
        <div className="px-4 pb-4">
          <DetailPanel
            cell={picked.cell}
            project={picked.source.projectName}
            metric={picked.source.heightMetric === "projects" ? "projects" : "users"}
            users={picked.source.usersByRole[picked.cell.roleId] ?? []}
            crossProject={mode === "compare" ? crossProjectTiers(picked.cell, compareDatas) : null}
            onClose={() => setPicked(null)}
          />
        </div>
      )}
    </div>
  );
}
